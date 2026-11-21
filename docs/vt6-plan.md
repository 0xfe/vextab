# VexTab 6 implementation plan

A musician should be able to edit one source, read an aligned conductor score, rehearse it, and print a part with the right notes, markings and page turns. Start with the four-bar melody and bass from the baseline. It is small enough to debug, and native VexFlow already aligns it on the version VexTab ships. [Baseline and reproducer](vt6-baseline.md#reproduced-on-the-release)

| Milestone | Deliverable | Depends on |
| --- | --- | --- |
| M0 | Reproducible release and native VexFlow comparisons | Start here |
| M1 | Existing music survives screen rendering and part extraction | M0 fixtures |
| M2 | A conductor view and independently reflowable named parts | M0 ensemble control |
| M3 | Page editions authored in VexTab | M1 print path and M2 part identities |
| M4 | Tested grammar and playback for expressive scores | M1 shared notation and M2 ownership where needed |
| M5 | Four editable repertoire demos, guide and qualified package | M3 editions and M4 repertoire features |

M1 and M2 can proceed independently after their M0 fixtures exist. Build each demo as soon as its first feature is usable. Use the capability inventory to track the wider grammar backlog while the four scores determine delivery order.

## M0 · Capture the release

Completed 21 November 2026. The release fixtures reproduce on a clean checkout. The isolated trial qualified VexFlow 5.7.0 for this branch. [Run, findings and capability inventory](../issues/195/README.md)

1. Add a test for two lyric marks on one attack and the four-bar ensemble fixture. Capture the released 6.0.0 result, the intended musical result and a direct VexFlow control for the ensemble. Record exact pitches, owners and bar membership at 800, 360 and 800 px again.
2. Add *Slow River* bars 2–4 at 560 px, an explicitly beamed bar and a silent skip sent to the part printer. Keep the working bossa and guitar duet beside them. Record parse, draw, edit, reflow and print timings for representative generated scores. Save white-background crops with the source, browser, fonts, dependency versions and measured geometry.
3. Start the capability inventory by musical operation. For each operation record the v2 spelling, native VexFlow path, supported outputs, failing fixture and milestone. Trial VexFlow 5.7.0 against the 5.6.1 pin with both native chord symbols and VexTab’s literal chord labels. Make the dependency decision in its own change. [Comparison method](vt6-baseline.md#test-and-visual-review-plan)

**Done when** a fresh checkout reproduces the dropped lyric, baseline jump, print refusals and independent wrapping. The native ensemble control aligns corresponding barlines. The dependency trial identifies which differences come from VexFlow.

## M1 · Preserve authored music on screen and paper

Implemented on `uplevel`. The *Slow River* verse and diagram and the fingered Sor opening now survive independent printing. [M1 evidence and native engraving audit](../issues/196/README.md)

1. Trace marks from `ScoreV2` through part projection. Fix ambiguous duplicate lyrics with a diagnostic pointing to the second mark. Audit other repeated marks lowered into a single field. Fit a verse across the whole system so its syllables share a baseline and extenders clear the bass voice.
2. Give screen rendering and `Publication` the same instructions for constructing beams, silent positions, forced accidentals, head-specific marks and chord frames. Test a reordered chord and render each part twice to catch misplaced or duplicated modifiers.
3. Audit remaining custom drawing for TAB endings, free-end slides, timed text, color and hidden clefs. Replace a workaround when the native control preserves its ink, spacing, source selection and print behavior. Record a bounded fixture and the missing native capability for each retained fallback. [Rendering audit](vt6-baseline.md#where-engraving-decisions-live)

**Done when** *Slow River* prints with its chord frame and a readable verse. The Sor opening prints in notation and TAB with the intended fingering on its head. Explicit beams and skips preserve grouping and time on both surfaces. Every supported mark survives extraction or produces a source-located diagnostic for an unsupported combination.

## M2 · Align instruments in one conductor score

Implemented on 21 November 2026. The full Haydn theme uses four named parts and one native system. [Repertoire, checks and visual evidence](../issues/197/README.md)

1. Give parts and staves optional stable IDs, names and written-to-sounding intervals. Preserve the existing single-instrument and `partIndex` calls. Keep rhythmic ownership, displayed staff and playback instrument distinct.
2. Add an explicit conductor view that builds one native composition for parts with matching measure spans. Include a grand staff and paired guitar notation/TAB within a group. Extracted parts use the same source IDs and choose their own breaks.
3. Start Haydn’s quartet theme. Add a B-flat clarinet control and a negative case with two bars of 3/4 against three of 2/4. Locate an unsupported conductor grid in the source and keep the independently renderable parts usable. [Ensemble design](vt6-baseline.md#an-ensemble-and-a-printed-edition)

**Done when** the quartet shares one row map at 360 and 800 px, corresponding barlines and simultaneous attacks align, and all four parts print independently. Selecting a note in the score or part finds the same authored event. A written D on B-flat clarinet sounds as concert C in either view.

## M3 · Author pages and extracted editions

1. Trial edition syntax on the quartet. Map paper size, margins, staff size, title, running furniture and page numbers onto VexFlow’s publication options. Define how a source edition and a caller’s explicit options combine.
2. Add system and page breaks, preferred and forbidden turns, rest compression and single-measure cues. Use distinct references for “start page at bar 9” and “turn after bar 8.” Report impossible turns, overflow and missing anchors at the relevant source.
3. Engrave the Haydn theme and first variation. Compare an A4 conductor score with a Letter part, then swap paper sizes. Inspect physical dimensions in the PDF and compare one phrase from each part against the source edition.

**Done when** one source produces both paper sizes and four independent parts. A part-specific turn leaves the conductor’s breaks intact. A cue stays silent, retains its source and preserves the player’s rest. Outlined SVG opens offline and the printed pages keep their margins, headings and final bar.

## M4 · Extend the grammar in musical slices

Each slice adds an authoring example, typed model fields, a native rendering control and a regression through the public API. Run the relevant playback check whenever an operation changes sound. [Upstream changes and issue mapping](vt6-baseline.md#upstream-changes-to-adopt-and-to-track)

| Slice | Implementation | Acceptance passage |
| --- | --- | --- |
| Voice and harmony | Named verses, elision, cross-bar lyric connectors, structured root/quality/slash bass, dynamics and niente hairpins. | Handy’s first sung chorus keeps every syllable. Transpose a slash chord and check both root and bass. Break a hairpin and count one circle. |
| Piano and rhythm | Cross-staff assignment, shared stems, continuous and feathered beams, nested tuplets and alternating tremolos. | Joplin’s first strain aligns the syncopated right hand with the bass. Short companion cases test the advanced beam and tremolo operations and preserve exact ticks. |
| Guitar and other instruments | Bends through ties, continuous glissandi with head endpoints, grace groups, ornaments and custom percussion mappings. | The Sor study sustains the melody over the accompaniment. A companion bend releases on the same string without a second attack. A percussion hit retains its identity across print and playback. |
| Performance | Per-part routing, tempo and dynamic changes, selectable performed repeats and endings. Retain written-order playback for existing callers. | The Joplin repeat revisits the correct attacks. Playing a conductor score adds no attacks for doubled TAB or cues. The playhead returns to the same written source on a repeat. |

**Done when** the Sor, Joplin and Handy passages pass musician review. Each delivered operation has evidence for its applicable outputs. Keep specialist work such as multi-bar ossias, figured bass and general polymetric pagination in the inventory with its native dependency and smallest acceptance case. [Grammar coverage](vt6-baseline.md#grammar-coverage-and-design-priorities)

## M5 · Qualify the repertoire, guide and package

1. Finish the four editable demos. Give each one canonical source, exact edition and bar range, attribution, editorial changes, a listening or reading task, and downloadable print. Use those same sources in the guide and tests. [Repertoire and editions](vt6-baseline.md#repertoire-for-the-first-demos)
2. Update the guide with conductor and part selection, concert and written pitch, edition syntax, feature limits and diagnostics. Check keyboard selection, touch at device scale 2, readable staff size on a phone, and a screen-reader walkthrough.
3. Run semantic and geometry checks on each feature change. For qualification, exercise Chromium, Firefox and WebKit, SVG and Canvas, and A4/Letter print exports. Review changed crops at reading size and log the musical reason for each accepted reference. Compare parse, draw, edit, reflow and print timings against M0 on the same generated scores and hardware.
4. Run the corpus, legacy compatibility suite and clean packed-consumer checks. Confirm parser imports, browser embeds, playback and exported parts work from the package. [Developer commands](developers.md) · [Packed consumer](../scripts/test-consumer.mjs)

**Done when** a musician can edit, rehearse, navigate and print each demo from the packaged build. The qualification record links the reviewed scores, browser and print results, compatibility checks, and remaining feature limits.
