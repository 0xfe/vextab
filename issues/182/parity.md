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

## Remaining comparisons

Use the [feature inventory and its source scores](inventory.md#what-to-verify-in-the-migrated-scores) for the rest of milestone 3. In particular:

- Cover changing meter, fragments, empty staves, rhythmic slashes and beam controls.
- Cover transposition, chord diagrams and the remaining historical guitar gestures.
- Cover independently timed text, stave and label colors, typography and navigation symbols.
- Review any proposed replacement for a historical feature before treating it as covered. The current printer reports a diagnostic for fingerings or accents on fretted heads in an independent tab part.
