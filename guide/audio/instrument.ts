// Load the guide's self-contained SpessaSynth instrument on the first Play gesture.
import { WorkletSynthesizer } from 'spessasynth_lib';
import { createSpessaSynthPlayback } from '../../src/playback/spessasynth';
import processor from 'spessasynth_lib/dist/spessasynth_processor.min.js?guide-content';
import samples from './florestan-subset.sf2';

/** Bundling the worklet and bank also lets a downloaded guide play from disk. */
export async function loadInstrument(audio: AudioContext) {
  if (!audio.audioWorklet) throw new Error('Playback needs HTTPS or localhost.');
  // A data URL also resolves in an AudioWorklet on a file: page with an opaque origin.
  await audio.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(processor));
  const synth = new WorkletSynthesizer(audio);
  synth.connect(audio.destination);
  await synth.soundBankManager.addSoundBank(new Uint8Array(samples).buffer, 'Florestan');
  await synth.isReady;
  return createSpessaSynthPlayback(synth);
}
