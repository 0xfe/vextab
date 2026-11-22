# Playback plugins

Add `play { tempo 100 }` before the first stave of an embed to show playback controls on the sheet. This works with the fixed SVG and Canvas renderers, responsive SVG and the legacy `.vex-tabdiv` class. The default embed uses native Web Audio and needs no samples. The first Play gesture opens audio. [Runnable bass chords and guitar pre-bend](../demos/player.html)

The controls fade after three seconds. Hover over the sheet, tap it, or tab to a control to reveal them. Hover over the metronome beside Play, or activate it with a tap or keyboard, to adjust the tempo in steps of 5 BPM. Changes apply to upcoming notes during playback and leave the written tempo in the source intact.

Each Play creates a fresh human performance. Choose a style in the score with `play { performer chopin }`, or use `performer robot` for literal playback. Hosts can specify a profile and seed. [Performer examples, API and research](performers.md)

## Listen in the guide

Press **Play** at the bottom center of a tutorial example, study or playground score. The button becomes **Stop** and can cancel the first instrument load. Changing an edit or starting a different score ends playback. The duet edition has its own button for the selected voice. An empty stave or an example containing only rests has no pitches to play.

A soft blue dot appears just before each sounding head or fret, reaches full strength on the beat and fades at the end of its written duration. The vertical playhead spans the system and continues through rests. It follows the spacing of the selected layout, including printed parts.

The guide loads its bundled SpessaSynth worklet and Florestan SoundFont on demand. Program 24 is nylon guitar, 40 is violin and 12 is marimba. The bank supplies a piano for program 0 and a nylon guitar for unavailable programs. Use HTTPS, localhost or the offline guide in a browser with AudioWorklet support. [Editable example](../demos/spessasynth.html) · [SoundFont source](../guide/audio/README.md)

## Supply a SpessaSynth instance

The [SpessaSynth quickstart](../dist/guide/index.html#quickstart/spessasynth) includes the worklet and SoundFont setup, a complete browser example and an editable instrument comparison.

Install `spessasynth_lib` in **your application**. Serve its matching worklet from your own site. Choose and host a SoundFont you can distribute. The adapter accepts a configured synthesizer. The host owns its context, worklet, sound bank and output routing. VexTab's package and type declarations have no dependency on SpessaSynth.

```ts
import { WorkletSynthesizer } from 'spessasynth_lib';
import { createSpessaSynthPlayback, Div } from 'vextab/browser';

// Call from the host application’s Enable Audio button.
async function mountScore() {
  const audio = new AudioContext();
  await audio.resume();
  await audio.audioWorklet.addModule('/audio/spessasynth_processor.min.js');
  const synth = new WorkletSynthesizer(audio);
  synth.connect(audio.destination);
  const response = await fetch('/audio/instruments.sf2');
  if (!response.ok) throw new Error('Could not load the SoundFont');
  await synth.soundBankManager.addSoundBank(await response.arrayBuffer(), 'main');

  const playback = createSpessaSynthPlayback(synth, [0, 1, 2, 3]);
  const host = document.querySelector<HTMLElement>('#score')!;
  host.textContent = 'play { instrument acoustic_guitar_nylon } staff { :w (C4 E4 G4) | }';
  return new Div(host, { playback });
}
```

Use a plain host element for manual mounting. The adapter resumes the context on Play and waits for the synth's readiness. Reserve the supplied MIDI channels for VexTab. Straight notes share channels. A bent string or an overlapping unison needs a separate channel. The default pool uses the 15 melodic channels of the first MIDI port. Stop releases only notes owned by the session. Dispose the returned embed when removing it and close the audio context when the host has finished using it.

To enable the sheet controls from JavaScript, pass <code>{ player: true }</code> to <code>new Div(host, options)</code>. To put buttons in your own toolbar, pass <code>{ playback, playbackControls: toolbar }</code> as the second argument to <code>new Div</code>. This enables playback for the embed without changing its source text. A standalone <code>Player</code> accepts <code>{ playback, controls: toolbar }</code> and mounts the buttons when you call <code>render()</code>. To animate a score drawn with <code>renderScore</code>, pass its SVG to <code>player.render(svg)</code>. For an extracted part, construct the player with the score returned by <code>renderScorePart</code> and pass its first page SVG.

## Play a score without a renderer

```ts
import { createWebAudioPlayback, parseScore, Player } from 'vextab/browser';

const score = parseScore('meter 2/4 guitar { (5/2 7/3[prebend +1 release]) 5/2[tie] | }');
const player = new Player(score, { playback: createWebAudioPlayback(), tempo: 90 });
playButton.onclick = () => player.play().catch(showError);
stopButton.onclick = () => player.stop();
```

The parsed-score player uses sounding pitch, including tuning and capo, and follows written measures once. It sustains tied chord members, skips rests and silent heads, and sends a separate pitch curve for each bent string. A pre-bend starts at the raised pitch and releases across its attack. Timed bends use their written rise, hold and release fractions. The legacy Artist also plays fixed-layout fragments with pre-bend releases. Automatic repeat traversal and continuous rendering of legacy multi-attack bend chains are outside the current player.

## Implement an instrument

`PlaybackPlugin.open(program, signal)` runs on the Play gesture. It returns a new session, immediately or through a promise. This example forwards each head to an application instrument.

```ts
import type { PlaybackPlugin } from 'vextab/browser';

const playback: PlaybackPlugin = {
  open(program, signal) {
    const instrument = myAudio.openInstrument(program, signal);
    return {
      playNote({ pitch, velocity, duration, bend }) {
        instrument.play(pitch, velocity, duration, bend);
      },
      stop() { instrument.stopAllVoices(); },
    };
  },
};
```

- `program` is a General MIDI program from 0 to 127. `pitch` is a MIDI note number with middle C at 60. Velocity runs from 1 to 127.
- VexTab dispatches `playNote` at the attack. The instrument schedules the release after `duration` seconds. Optional bend points specify a time in seconds from that attack and a linear pitch offset in semitones.
- A session may expose a `currentTime` getter in seconds to use its audio clock for onsets and the cursor. Otherwise VexTab uses the browser's monotonic clock.
- Honour the abort signal during asynchronous preparation. Stop, redraw and disposal invalidate pending playback. An already-open session receives `stop()` on cancellation, error or completion.
- `player.play()` resolves on completion or Stop and rejects on instrument errors. UI controls also show errors beside the score.

Existing applications that construct `new Player(artist)` and provide a MIDI.js global retain their legacy soundfont path. Passing a plugin selects it explicitly. [SpessaSynth documentation](https://spessasus.github.io/spessasynth_lib/)
