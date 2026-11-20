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

/** Place the transport in an existing control bar, or immediately above a score. */
export function scoreOptions(host: HTMLElement, bar?: HTMLElement): DivOptions {
  let controls = bar ? bar.querySelector<HTMLElement>('.guide-audio') : host.previousElementSibling as HTMLElement;
  if (!controls?.classList.contains('guide-audio')) {
    controls = document.createElement('div');
    controls.className = 'guide-audio';
    if (bar) bar.prepend(controls);
    else host.before(controls);
  }
  // Capture the Play action before the button changes to Stop.
  controls.addEventListener('click', stopPrevious, true);
  return { playback, playbackControls: controls };
}

/** A route may reuse its toolbar, so share one listener across remounts. */
function stopPrevious(event: Event) {
  if (!(event.target instanceof Element) || !event.target.closest('.vextab-play')) return;
  const controls = event.currentTarget as HTMLElement;
  for (const stop of document.querySelectorAll<HTMLButtonElement>('.guide-audio .vextab-stop')) {
    if (!controls.contains(stop)) stop.click();
  }
}
