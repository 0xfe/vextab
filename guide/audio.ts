// All guide scores share one lazily opened SoundFont and a single audible transport.
import type { DivOptions } from '../src/div';
import type { PlaybackPlugin } from '../src/playback/transport';

let audio: AudioContext;
let instrument: Promise<PlaybackPlugin>;

// The public-domain subset has a piano at GM 2 and a nylon-string guitar at 24.
const presets = new Set([2, 10, 12, 19, 21, 24, 38, 40, 45, 55, 61, 75, 87, 90, 97, 109, 116]);

/** Resume during the click, including on repeat visits after the browser suspends audio. */
const playback: PlaybackPlugin = {
  async open(program, signal) {
    if (!audio || audio.state === 'closed') audio = new AudioContext();
    const resumed = audio.resume();
    instrument ??= import(/* webpackChunkName: "guide-instrument" */ './audio/instrument')
      .then(module => module.loadInstrument(audio))
      .catch(async error => {
        const failed = audio;
        audio = undefined;
        instrument = undefined;
        await failed.close();
        throw error;
      });
    const [, plugin] = await Promise.all([resumed, instrument]);
    signal.throwIfAborted();
    // The subset stores its acoustic piano at GM 2. Use the guitar for missing presets.
    return plugin.open(program === 0 ? 2 : presets.has(program) ? program : 24, signal);
  },
};

/** Enable the default sheet player with the guide's shared, lazily loaded instrument. */
export function scoreOptions(host: HTMLElement): DivOptions {
  host.addEventListener('click', stopPrevious, true);
  return { playback, player: true, language: 2 };
}

let lastPlay: HTMLButtonElement;

/** Capture Play before the toggle switches to Stop. Each guide page plays one example at a time. */
function stopPrevious(event: Event): void {
  const play = event.target instanceof Element && event.target.closest<HTMLButtonElement>('button.vextab-play');
  if (!play) return;
  if (lastPlay !== play && lastPlay?.classList.contains('vextab-stop')) lastPlay.click();
  lastPlay = play;
}
