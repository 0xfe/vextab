# M0 · VexTab 6.0.0 engraving baseline

Pin **VexFlow 5.7.0** on the `uplevel` branch. In the altered-chord study, two native chord symbols went from 39.59 SVG units of overlap to 4.16 units of clearance. VexTab’s literal chord labels already had 39.85 units of clearance on both versions. The ensemble, lyric and part-printing cases below produced the same results on both engines. [VexFlow release](https://github.com/vexflow/vexflow/releases/tag/5.7.0) · [Issue and screenshots](https://github.com/0xfe/vextab/issues/195)

## Reproduce

Use the Node version in `.nvmrc`, installed Chrome, and network access to GitHub and npm. From the repository root run

```sh
npm ci
npm run test:vt6-baseline
```

Set `CHROME_BIN` to use a specific Chrome executable. Each run writes a new directory under `build/vt6-m0/`. The command fails if a verified input changes, a known defect stops reproducing on the frozen sources, or a musical or layout assertion fails. Use the fixture sources again with the working tree when implementing M1 and M2. Give the repaired behavior its own assertion through the current public API. [Fixtures](capture.mjs) · [Browser measurements](browser.js) · [Assertions](check.mjs)

| Run | Browser bundle | Embedded VexFlow |
| --- | --- | --- |
| `release` | Production bundle and guide scores from the VexTab 6.0.0 GitHub Release | 5.6.1 · `aec04448` |
| `control` | Rebuild of VexTab `5c3c0c5d` using its own lockfile | 5.6.1 · `aec04448` |
| `trial` | Same source, compiler and lockfile. Replace only the installed VexFlow package before the second build | 5.7.0 · `105ecaf2` |

On the recorded machine the shipped and rebuilt browser bundles were byte-identical. The 5.7.0 npm tarball also matched the GitHub Release tarball byte for byte. The runner checks each downloaded archive’s SHA-256 before extraction and checks the embedded VexFlow version before measuring. [Input URLs and digests](prepare.mjs)

The run directory contains `inputs.json`, `environment.json`, and one JSON file per build with its bundle hash, VexFlow build ID, font status, exact score sources, event ownership, row maps, coordinates, publication results and timing samples. The five white-background PNGs per build show independent parts, the shared native score, the verse, native chord symbols and literal labels. Geometry is in SVG user units at device scale 1.

## What the musician sees

| Passage | Measured on the release and rebuilds | Intended result and owner |
| --- | --- | --- |
| Four-bar ensemble, 800 → 360 → 800 px | At 800 both VexTab parts fit four bars. At 360 the melody needs four systems and the bass fits one. Bar 1 ends at x=350.00 and x=140.87 respectively. The live embed restores its initial layout. | M2 presents a conductor score with one row map. Each extracted part keeps its own breaks. |
| Same passage in native `EasyScore.compose` | One composition with two staves fits two bars per system at 800 and one at 360. Corresponding downbeats and right barlines coincide in every bar, including after the return to 800. | M2 can reuse native horizontal layout on either dependency. |
| Two lyrics on C4 | Both marks survive parsing. Only “two” appears on screen **and on paper**. Neither surface reports a diagnostic. | M1 locates the ambiguous second mark. M4 adds explicit verse and elision syntax. |
| *Slow River*, 560 px | Bars 2–4 share a row. The baselines of “roll”, “to” and “sea” are 556.265, 509.953 and 507.121. The verse jumps **49.144** units. The printer selects the opening chord frame at line 7, column 42. | M1 gives the verse a shared baseline under the bass voice and prints the complete diagram. |
| Explicit beam and silent skip | All four eighths belong to one screen beam. The skip consumes one quarter and draws no ink. Independent notation printing selects the complete beam at column 18 and the skip at column 24. | M1 preserves beaming, silence and exact time in the extracted part. |
| Bossa and guitar duet | Bossa wraps 1 → 2 → 1 systems. Its TAB part prints on one page with 13 note groups. The two-voice duet prints on one notation page with 16. Both print without diagnostics. | M1 and M2 keep these working cases alongside the failures. |

The ensemble has 32 melody eighths, repeating C4 D4 E4 F4 G4 F4 E4 D4, against four whole-note C3s. The runner checks each note’s part, staff, voice, bar, rational onset and duration. It checks all 36 reading events on each live resize against their authored IDs and pitches. The native control independently checks the written pitches, durations and positions on both staves.

The harmony study places `C#maj13(#11,b9)/G` on the last beat of bar 1 and `Dbmaj13(#11,b9)/Gb` on the downbeat of bar 2. At 800 px their bounds share a system. At 190 px the measures split, so horizontal clearance between the two labels has no musical meaning. Returning to 800 restores the original bounds. The native control attaches `ChordSymbol` to each note. The literal control goes through `parseScore`, v2 projection and `renderScore`. [Upstream spacing case](https://github.com/vexflow/vexflow/issues/375) · [VexTab lead-mark projection](../../src/score/lead.ts)

## Capability inventory

“Screen” in the M0 measurements means Chrome SVG. “Part” means pages returned by `renderScorePart`. The separate package suite also exercises Canvas, reading and playback. The following rows name the evidence for each operation. The broader backlog includes additional notation and output combinations. [Grammar coverage](../../docs/vt6-baseline.md#grammar-coverage-and-design-priorities)

| Musical operation | v2 spelling or available interface | Native path | Output coverage, fixture and milestone |
| --- | --- | --- | --- |
| Read simultaneous attacks across instruments | Two top-level `staff { … }` blocks | One `EasyScore.compose` across staves | Independent screen parts and all 36 reading events verified. Conductor screen and print missing. M2 · four-bar ensemble. |
| Extract one instrument | `partIndex` in the render call | Per-part composition and `Publication` | Independent screen and part supported. Named selection and written/concert pitch need M2. [Part-selection tests](../../tests/grammar2-views.ts) |
| Align hands of one piano | `piano { upper { … } lower { … } }` | Connected staves in one composition | Shared piano, hand extraction and head marks covered. Cross-staff beamed chords need M4. [Piano tests](../../tests/piano.ts) |
| Keep one rhythmic owner for paired guitar views | `guitar`, named voices and `tabStems on` | Fretted notation and TAB notes, ties and `Publication` | Bossa screen and TAB part verified. M2 keeps the pair together inside a larger score. [Bossa](../../guide/scores/bossa.vextab) |
| Read two independent voices on one staff | `voice melody stem up`, `voice bass stem down` | EasyScore voices, ties, rehearsal marks | Duet notation and part verified. M1 preserves the page during projection changes. [Guitar duet](../../guide/scores/guitar-duet.vextab) |
| Keep explicitly chosen beam members | `beam { :8 C4 D4 E4 F4 }` | Native beam attached during screen preparation | Group verified on screen. Part refuses the source span. M1 · beam. |
| Advance time silently | `:q C4 skip` | Native timed note with drawing disabled | Screen ink and duration verified. Part refuses the skip. M1 · skip. |
| Put two syllables on one attack | Two `lyric` marks | Per-voice EasyScore verses. Native elision available in 5.7 | Second mark wins on screen and paper. M1 · duplicate lyric. M4 · Handy elision. |
| Keep a verse on its system | `lyric "roll" extend=2` | EasyScore verse and extender descriptors | Per-measure baseline drifts. M1 · *Slow River* bars 2–4. |
| Print a chord frame and barre | `frame (x 0 2 2 1 0) barre=2/4..3` | Native `FretDiagram` with VexTab’s diagram key | Screen diagram, located part refusal. M1 · *Slow River* opening. |
| Space a literal chord label | `symbol "…"` | EasyScore measure `chords` | Screen ink and reflow verified on both versions. M4 preserves arbitrary text. M0 · literal harmony. |
| Transpose structured harmony | Literal symbol and VexTab transposition today | Native structured harmony and transposition in 5.7 | Native spacing qualified. Typed root, quality and slash bass through authoring and extraction need M4. [Transposition tests](../../tests/transpose.ts) |
| Place a sign or fingering on a chord head | `Fn4[showSign]`, `A4[finger 4 right]` | Accidentals, modifiers and fresh publication note hooks | Covered piano cases print. Other fretted/special heads have located refusals. M1 · Sor study. [Head-mark tests](../../tests/piano.ts) |
| Author page size, layout and player turns | `break system` today. Paper options on the host API | `Publication` and selected view | Working one-page controls. Source editions, part cues and turns need M3 · Haydn quartet. [Edition design](../../docs/vt6-plan.md#m3--author-pages-and-extracted-editions) |
| Rehearse repeats with instrument routing | Written repeats, endings and part-local events | VexTab performance builder and transport | Written-order playback covered. Performed repeats and part routing need M4 · Joplin strain. [Playback tests](../../tests/playback.ts) |

## Cost of rendering and editing

Warm medians in milliseconds on an Apple M3, macOS 27.0.1 arm64, Node 26.13.1 and Chrome 157.0.8103.79. Each part has four quarter notes per bar. Draw and print process every part. Edit replaces the first C4 with B4 in the live editor and redraws at 360 px. Reflow resizes the live embed from 800 to 360. Each cell uses five samples after one warm-up. These synchronous API timings provide a comparison point for M5. They exclude browser presentation and PDF export.

| Build | Parts × bars | Parse | Draw | Edit | Reflow | Print |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Shipped 5.6.1 | 1 × 16 | 0.2 | 6.3 | 7.6 | 6.5 | 8.1 |
| Shipped 5.6.1 | 4 × 16 | 0.4 | 23.7 | 25.8 | 24.0 | 32.3 |
| Shipped 5.6.1 | 4 × 64 | 1.1 | 96.7 | 100.7 | 99.5 | 140.6 |
| Rebuilt 5.6.1 | 1 × 16 | 0.2 | 6.9 | 7.7 | 7.1 | 9.9 |
| Rebuilt 5.6.1 | 4 × 16 | 0.4 | 27.2 | 28.9 | 27.1 | 36.8 |
| Rebuilt 5.6.1 | 4 × 64 | 1.1 | 99.7 | 104.1 | 100.5 | 135.7 |
| Trial 5.7.0 | 1 × 16 | 0.1 | 7.9 | 6.8 | 6.6 | 8.9 |
| Trial 5.7.0 | 4 × 16 | 0.3 | 23.3 | 24.0 | 21.1 | 30.3 |
| Trial 5.7.0 | 4 × 64 | 1.0 | 87.5 | 92.4 | 87.9 | 116.7 |

For the dependency decision, the npm-installed 5.7.0 candidate also passed lint, typechecking, corpus and migration checks, the packed CommonJS/ESM/TypeScript/browser consumer, and the historical comparison with 28 examples per build. The packaged suite passed all 124 browser tests in Chrome, Firefox and WebKit. [Test commands](../../docs/developers.md)
