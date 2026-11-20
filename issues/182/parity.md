# Grammar v2 feature parity

Milestone 3 follows one score from parsing to the screen, the printed page, the player and the editor. Both languages use the measured score renderer. The browser suite compares the musical results of equivalent phrases. The [sketchbook](../../experiments/grammarv2/preview.html) lets you edit and inspect the v2 examples.

| Verified example | What the test observes |
| --- | --- |
| Drop D, capo 2, open slide, pre-bend and chord bend | Both drawing backends accept the score. Fret positions and performed pitches, bend phases and durations agree with v1. Tab prints independently. |
| Two guitar voices with reordered chord heads | The same strings sustain through a barline in both languages. The bass voice prints independently and keeps its four source targets. |
| Four-string custom tuning and pickup | An eighth-note pickup leads into 2/4. Both languages play the same pitches and timing, and the tab-only part prints on four lines. |
| Independent piano hands with fingerings, natural, accent and bass tie | v1 and v2 have the same attack positions at two widths and the same sustained pitches. The printed hands retain their own marks and source targets. |
| Tuplet with syllables and alternate endings | The three eighths occupy a quarter. The first and second endings cover the intended written bars. Playback traverses written bars once, as in v1. |
| Groove alongside a pitched part | Kit chords retain drum identities. The injected playback plugin receives simultaneous pitched notes from multiple instruments. |
| Editing repeated notes | Expanded events have distinct identities and select the authored attack. Invalid input selects the offending text. An earlier revision cannot select notes in a later edit. |

[Browser assertions](../../tests/grammar2-views.ts) · [Clean package consumer](../../scripts/test-consumer.mjs)

## Historical scores

| Feature | Evidence |
| --- | --- |
| Blank staves, fragments, pickups and meter changes | An empty four-string staff engraves in both backends and prints without introducing a rest or a playback event. A fragment of three eighths plays for 1½ beats. Measured voices reject mismatched lengths. |
| Slash heads, rest placement, beams and system breaks | The lead sheet alternates a pitched chord with unpitched slash heads. The guitar fixture groups six eighths in two beats. A forced break and a new meter share the same bar boundary. |
| Transposition, keys and fret diagrams | The Am/E example moves its chord root, bass, diagram, barre and sounding frets together. A negative fret identifies the source error. A scoped playback octave keeps the printed fret. |
| Hammer-ons, pull-offs, taps, slides, strokes, vibrato, bends and palm mute | A guitar fragment compares the fixed legacy renderer with the v2 renderer. The mute retains its endpoints through reflow. Independent bend envelopes can raise two strings while a third holds its pitch. |
| Harmony and lyrics | The opening bar from *Slow River* matches the v1 pitches, onsets, durations and chord names in two voices. It preserves the frame, lyric punctuation and syllable connector. |
| Timed text and navigation signs | Four text events fit over one held note. Coda and segno markers occupy no musical time. A line or font change applies from its authored position. Screen and print use the same text cells. |
| Ink, fingerings and editing | Stave, attack, chord and text ink are distinct. Clicking a timed label selects its token. A named tie can sustain a matching pitch into another voice. |

The [historical browser fixtures](../../tests/grammar2-parity.ts) exercise these cases through the public APIs. The [sketchbook examples](../../experiments/grammarv2/preview.mjs) include the guitar fragment, a meter change, a transposed diagram and an independent text lane. The full teaching corpus is scheduled for milestone 4.

## Reading and printing the examples

- Fixed v1 scores use the Artist engraver. V2 uses measured layout for fixed widths and reflow. Staff spacing, automatic stems and curve placement can differ. Use a written pitch such as `x/3[write B3]` to place a silent dead head independently of its string.
- Screen engraving supports explicit beam groups and chord frames. Asking the independent part printer for one reports the source of the feature. The existing restrictions for silent positions and special fretted head marks also apply. [Independent part coverage](../../guide/reference.html#publication-scope)
- A printed tab part identifies connected guitar attacks and vibrato with playing instructions. Repeats continue to play in written order. Performed repeat traversal is a separate capability.
