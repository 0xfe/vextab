# Guide demo engraving comparison

## VexFlow 5.10.1

Compared the same 19 demo sources at their authored widths or a 960-unit fallback against the 5.10.0 PR at `629c59d`. All 19 retained their reading-event counts and screen system starts. All 34 conductor and part pages retained their page and system breaks. All 19 conductor views and every printed edition reported zero diagnostics.

| Passage | Result with the published patch |
| --- | --- |
| Ballade, opening | Staff gap 125 → 89 units. Both wedges remain. The beamed chord’s finger 5 stays by the notehead. |
| Étude, bars 9–11 | Staff gap 180 → 167. The right-hand wedges sit closer to the upper staff and clear the left-hand slur. A diagnostic render without slurs measures 134, and one without wedges measures 132. |
| Compound-time picking | Native profile spacing leaves eight units between the two printed triplet numerals. The earlier fallback left about 25. Both are legible. |
| Friska, system two | The three gaps stay at 70 / 90 / 70. The bass direction keeps four units of clearance from the following beam. |
| Soleá, All of Me and Haydn | All render with the stock TAB geometry and slur fitter. The Haydn publication still contains 14 pages across the conductor and four parts. |

The other 12 demos retain their previously accepted layouts. The full gallery includes the previous build for comparison.

## VexFlow 5.10.0 baseline

Reviewed all 19 entries marked as demos in the guide. The comparison includes every screen system and 34 printed pages per build across conductor scores and separate ensemble parts. Screen widths use the authored layout width or 960 units. All printed editions retain their page and system breaks. This is a visual review of those widths and editions.

The live localhost lesson runs the working master checkout with VexFlow 5.9.0. PR #215 uses the exact npm release 5.10.0. Sixteen older demos use VexTab 6.2.3 at `f90dc2d` as their historical reference. The two Liszt studies and the local Chopin Étude use the 5.9.0 renderer at `1eb710d`. The live Consolation has subsequent score edits. Historical-to-PR comparisons use identical sources for all 19.

The initial eleven-demo check used a 1,080-unit fallback and missed two responsive line-break changes visible at 960. It also missed placement regressions that preserve both the page count and the musical event count.

| Demo | Assessment | Passage reviewed |
| --- | --- | --- |
| Liszt · Hungarian Rhapsody No. 2 | Fixed | The bar 9 bass instruction inflated the live second-system gap to 213 units. After moving its measurement to the bass staff, the three gaps are 72 / 70 / 78 on master and 70 / 90 / 70 on the PR. The PR also clears the following beam and preserves the explicitly empty hand names. |
| Chopin · Ballade No. 3 | Fixed fingering · open spacing | A lone digit now attaches to the written head. In bar 1, finger 5 sits about 2 units above the upper head on screen and paper. Multi-digit chords still stack in pitch order. The native ossia adds a bass clef. The larger space between hands around hairpins remains open. |
| Chopin · Étude in thirds, Op. 25 No. 6 | Open spacing | The fourth system, bars 9–11, expands from 138 to 180 units on the PR. Removing only the wedges in a diagnostic render gives 134. The one-page edition, fingered thirds and double accidentals survive. The metronome half note now uses a music glyph. |
| Compound-time picking | Fixed | The printed 3 on the notation staff overlapped the 3 on rhythmic TAB. Both projections now retain the numeral with about 25 units of ink clearance on screen and paper. |
| Handy · The St. Louis Blues | Fixed | The migration used the singer’s spacing mode for the whole ensemble. Selecting profile spacing for the piano as well reduces the four piano gaps from 143–183 units to 50–65. Both verse lanes remain distinct. The conductor and two players keep their page breaks. |
| Liszt · Consolation No. 5 | Acceptable with source caveat | The pickup, measure 7 bass beam and sustained quarters retain their roles on the common score. Suppressed hand labels stay suppressed. The live checkout has a separately edited score and slur routing, so its edition is identified separately. |
| Sor · Study in B minor | Acceptable reflow | At a 960-unit screen width the opening fits on two systems instead of three. The printed two-system edition retains all eight bars, altered pitches and guitar fingerings. The tighter paired staves remain distinguishable. |
| Haydn · Emperor Quartet | Acceptable reflow · existing master warning | At 960 units the conductor uses 24 systems instead of 23. The five-page conductor and all four separate parts retain the same page and system starts in print. The prior and current master emit a slur collision on the system starting at bar 6. The PR clears it. |
| Joplin · Maple Leaf Rag | Acceptable | The cross-staff passage uses less vertical space. The hand crossing, beam, repeats and printed one-page form are intact. |
| Pocket Change · Bebop piano | Acceptable | The opening title, swing equation and brace use native placement. The printed swing mark, triplet and eight screen systems remain legible. |
| All of Me · Chord-melody guitar | Acceptable | The diagram key and swing mark occupy less opening space. Notation and TAB move closer together while the chord grips, harmony and one-page edition remain intact. |
| Soleá · Flamenco guitar | Acceptable | Tighter notation and TAB spacing preserves the seven systems at 960 units, the ligado continuations, rasgueado markings, chord key and one-page print. |
| A-major chord workshop | Acceptable | A narrower gap separates the two projections. The natural, circled TAB fingering and corresponding notation fingering remain distinguishable. |
| Two-voice bossa | Acceptable | The two rhythmic staves move closer. Melody and bass retain distinct stems, rests and tied tones. |
| Drop D turnaround | Acceptable | The bend, palm-mute span, repeats and endings survive the tighter paired-staff layout on both systems. |
| Slow river | Acceptable | The diagram key moves closer to the score and native lyric lanes change connector lengths. The chord names, syllables and extenders remain present in both systems. |
| Read the endings | Acceptable | The first and second endings and repeat dots remain visible. The rhythmic TAB staff is closer to the notation. |
| Guitar duet for print | No material change | Voice direction, sustained notes and ties retain the same single-system score and printed form. |
| Two independent editors | Acceptable | The notation/TAB pair is more compact. Both editors use the same source. The packaged guide interaction checks exercise them independently. |

At 5.10.0 the Chopin grand-staff hairpin spacing was an open engraving regression. The rhythmic TAB tuplet used envelope spacing pending the native fix. Both have stock 5.10.0 reproductions. [Hairpin control](https://github.com/vexflow/vexflow/issues/475) · [TAB tuplet control](https://github.com/vexflow/vexflow/issues/476)
