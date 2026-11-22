# Performers

A performer interprets the same written notes on each press of Play. It shapes the pulse, attack strength and timing of graces. Try changing just the performer in the guide’s editable guitar phrase, or add the following line before the first instrument of a score. [Listen in the guide](../dist/guide/index.html#features/playback)

```vextab
play { tempo 176 performer parker swing eighths }
```

| Performer | What to listen for |
| --- | --- |
| `human` (default) | A careful student’s steady reading. Unmarked beat lengths vary by at most 1%, with a small change in touch. |
| `bach` | A steadier pulse, more weight on the beat and crisp graces. Try it on running counterpoint. |
| `chopin` | Broader tempo arcs, more dynamic contrast and more time for a grace group. Try a lyrical piano line. |
| `parker` | A Charlie Parker–inspired bebop feel. Eighths swing more at moderate tempos. The lead leans behind the beat and gives offbeats extra weight. |
| `ragtime` | Straight subdivisions, a firm pulse and a little extra weight on offbeats. Try Maple Leaf Rag. |
| `blues` | A loping shuffle with more room at phrase ends and a lead that sits behind the beat. Try The St. Louis Blues. |
| `robot` | The original timeline, velocities, grace allocation and legacy MIDI.js behavior. Written tempo changes, hairpins and ties still play. |

The names describe editable interpretations. Their parameter values are listening choices in this implementation. The classical presets draw on recorded performance traditions, and the bebop preset draws on ensemble studies.

## Written swing

`play { swing eighths }` prints a beamed eighth-note pair equated to a triplet quarter and eighth above the first system. The notes stay written as ordinary eighths. The performed ratio eases toward straight eighths at faster tempos. `swing off` selects even eighths and removes the lead’s downbeat displacement. Omit the directive to inherit the performer’s feel. A robot with explicitly swung eighths plays a repeatable long–short pattern. [Play Pocket Change](../dist/guide/index.html#lesson/pocket-change)

The player’s `swing` option overrides the score for a listening comparison. A standalone sequencer can pass `'eighths'` or `'off'` as the third argument to `createPerformer`.

## What the score controls

- Written repeats, tempo changes, dynamics and hairpins are resolved before the performer shapes the result. Nearby beats share a small, slowly changing tempo deviation. A bounded, center-weighted distribution varies touch and grace length on each take.
- Phrases run up to four performed bars. A slur ending at the barline can end a phrase sooner. A fermata stretches the beat containing its release for the whole ensemble. Accents add weight and staccato shortens the sounding note. Ties and pedal can carry sound through a written release.
- Swing operates on full quarter beats. The performer leaves a beat’s subdivisions even when that part contains triplets, sixteenths or irregular grace attacks. A compound meter in an ensemble keeps the overlapping bars straight. The first part supplies the conducting grid and acts as the jazz lead. A piano’s hands share one part.
- Chord heads strike together. Grace groups borrow from the principal note, with a shorter allowance for slashed graces and a time cap on long notes. Timing changes move bends, note releases and the visual playhead along with the music.

## Use it from JavaScript

A score can name a preset. A host can override it for one player or embed, including a legacy Artist. Omit the seed for a fresh take. An HTML embed can set `data-performer="bach"`.

```ts
import { Player, performerProfiles } from 'vextab/browser';

const player = new Player(score, {
  performer: { ...performerProfiles.parker, pocket: -.02 },
  seed: 42,
});
await player.play();
```

A positive `pocket` delays the lead downbeat. A negative value anticipates it. Both meet the rhythm section on the swung offbeat. Use `rubato` and `drift` for the phrase and take-to-take beat-length variation, `swell` and `touch` for velocity, and `beatAccent` for onbeat or offbeat emphasis. `swing` ranges from zero to one. `grace` is the nominal fraction of the principal note available to a grace group.

### Use it with a VexFlow score or another sequencer

The standalone entry accepts note events in seconds and runs in Node or the browser. A VexFlow application can keep its own score, renderer, audio engine and source IDs. Convert voice ticks to seconds using the written tempo map, then pass all parts to the same take. The result contains the performed times to schedule in the host.

```ts
import { createPerformer, type Performance } from 'vextab/performer';

const phrase: Performance = {
  duration: 1,
  events: [60, 62, 64, 67].map((pitch, i) => ({
    source: 'melody-' + i,
    time: i * .25,
    duration: .25,
    notes: [{ pitch, duration: .25, velocity: 80 }],
  })),
};
const take = createPerformer('parker', 42);
const [melody] = take.perform([phrase], [{ duration: 1, quarter: .5 }]);
```

Supply a bar for each performed visit when the meter or tempo changes. Each bar gives its duration and quarter-note length in seconds. Optional fields include `beatOffset` for pickups, `swingable`, `phraseEnd` and `fermatas` as release offsets in seconds. Without bars, the transformer assumes four-quarter bars at 120 BPM. Pass a third argument to `perform` to change that fallback tempo. Input events should be in onset order.

## Research behind the implementation

- KTH’s rule-based performance work groups notes into phrases and coordinates timing with dynamics. This implementation uses an explicit phrase contour so a listener can follow the same gesture across several beats. [KTH phrasing rules and sound examples](https://www.speech.kth.se/music/performance/Texts/phrasing.htm)
- Fabian’s analysis of Bach solo violin recordings treats articulation, timing and dynamics as interacting choices across performers. Kosta, Bandtlow and Chew aligned beats, loudness and written markings across roughly 2,000 recordings of Chopin mazurkas. These studies motivated separate controls for pulse, metric emphasis and loudness. The presets are hand-tuned. [Fabian’s Bach performance study](https://www.openbookpublishers.com/books/10.11647/obp.0064) · [MazurkaBL](https://www.tenor-conference.org/proceedings/2018/12_Kosta_tenor18.pdf)
- Friberg and Sundström measured how the long–short eighth ratio changes with tempo in jazz recordings. Nelias and colleagues tested how delaying a soloist’s downbeats while aligning offbeats changes perceived swing. The player therefore exposes swing and lead placement as independent controls. [Friberg and Sundström’s ensemble measurements](https://www.speech.kth.se/music/performance/Texts/ensemble_swing.htm) · [Downbeat delays in jazz](https://doi.org/10.1038/s42005-022-00995-z)
