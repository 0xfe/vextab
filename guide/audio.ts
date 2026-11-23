// All guide scores share one lazily opened SoundFont and a single audible transport.
import type { DivOptions } from '../src/div';
import type { PlaybackPlugin } from '../src/playback/transport';

/** One visit shares the context, worklet and sample bank across all scores. */
interface GuideInstrument {
  audio: AudioContext;
  ready: Promise<PlaybackPlugin>;
  dispose(): void;
}

let instrument: GuideInstrument | undefined;

// The public-domain subset has a piano at GM 2 and a nylon-string guitar at 24.
const presets = new Set([2, 10, 12, 19, 21, 24, 38, 40, 45, 55, 61, 75, 87, 90, 97, 109, 116]);

/** A restored page needs a new audio device clock, even when the old context reports running. */
function openInstrument(): GuideInstrument {
  if (instrument && instrument.audio.state !== 'closed') return instrument;
  instrument?.dispose();
  const audio = new AudioContext();
  const lifetime = new AbortController();
  function dispose() {
    if (instrument?.audio === audio) instrument = undefined;
    // Destroy the old worklet before closing its port, including a bank load still in flight.
    lifetime.abort();
    if (audio.state !== 'closed') void audio.close();
  }
  window.addEventListener('pagehide', dispose, { signal: lifetime.signal });
  const ready = import(/* webpackChunkName: "guide-instrument" */ './audio/instrument')
    .then(module => module.loadInstrument(audio, lifetime.signal))
    .catch(error => { dispose(); throw error; });
  instrument = { audio, ready, dispose };
  return instrument;
}

/** Resume during the Play gesture. The next visit opens its own graph on demand. */
const playback: PlaybackPlugin = {
  async open(program, signal) {
    const { audio, ready } = openInstrument();
    const [, plugin] = await Promise.all([audio.resume(), ready]);
    signal.throwIfAborted();
    // The subset stores its acoustic piano at GM 2. The bowed strings share the violin sample. Other missing presets use guitar.
    const preset = program === 0 ? 2 : program >= 40 && program <= 43 ? 40 : program;
    return plugin.open(presets.has(preset) ? preset : 24, signal);
  },
};

/** Tutorial scores opt in with a play block. Other guide examples show the player by default. */
export function scoreOptions(host: HTMLElement, player: 'always' | 'score' = 'always'): DivOptions {
  host.addEventListener('click', stopPrevious, true);
  return { playback, player: player === 'always' ? true : undefined };
}

let lastPlay: HTMLButtonElement;

/** Capture Play before the toggle switches to Stop. Each guide page plays one example at a time. */
function stopPrevious(event: Event): void {
  const play = event.target instanceof Element && event.target.closest<HTMLButtonElement>('button.vextab-play');
  if (!play) return;
  if (lastPlay !== play && lastPlay?.classList.contains('vextab-stop')) lastPlay.click();
  lastPlay = play;
}
