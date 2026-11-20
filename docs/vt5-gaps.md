# VexTab 5 gaps and priorities

Historical VexTab 5 report. Its examples use the version 1 grammar. See the [current tutorial](../doc/tutorial.html) for grammar v2.


**Fix the music first.** A guitarist should be able to hide the standard staff without changing the rhythm, resize a lesson without duplicating voices, and read the same pitches in the tab and notation. Once those hold, the highest-value 5.4 feature is a guitar score that wraps at barlines and keeps its musical relationships across a line break. The [milestone plan](vt5-plan.md) builds toward that score.

## What the baseline actually does

Reviewed on November 19, 2026 at VexTab 4.0.6 (`5db6d8b`), pinned to VexFlow 5.3.0. The review covered the grammar, semantic compiler, Artist builders, both DOM integrations, player, tutorial, demos, tests, packaging and all **58 open GitHub issues**. The numbers below refer to that issue snapshot. Both VexTab 4.0.6 and VexFlow 5.4.0 were available from npm. [VexTab source](https://github.com/0xfe/vextab/tree/5db6d8b) · [Issue tracker](https://github.com/0xfe/vextab/issues) · [VexFlow release](https://github.com/vexflow/vexflow/releases/tag/5.4.0) · [Registry entry](https://registry.npmjs.org/vexflow/5.4.0)

Compared the published VexTab browser bundle with a temporary build of the same checkout using the released VexFlow 5.4.0 ESM entry. In headless Chrome both passed all 40 QUnit tests, and all 24 score snippets extracted from the historical tutorial parsed and drew to SVG. The published package also passed the repository's playground, legacy Canvas and packed-entry checks. Many render tests only assert that drawing completed. A score can pass with a wrong duration or misplaced mark. [Test suite](../tests/tests.ts) · [Browser checks](../scripts/test-browser.mjs) · [Tutorial](../doc/tutorial.html)

| Score or action | Observation | Priority implication |
| --- | --- | --- |
| Enable tab stems, write three eighths followed by `^3^`, hide notation | Both versions produced zero tab tuplets and 2,048 ticks per eighth. On the baseline, enabling notation produced a tab tuplet and 4,096/3 ticks per eighth. | **P0.** Hiding a staff changes musical time. [#45], [#131] |
| Write a quarter and an eighth, then `^3,2^` | Both kept durations of 4,096 and 2,048 ticks. Together they should occupy one quarter, 4,096 ticks. The second argument counts captured events. | **P0.** Keep the existing spelling and fix its interpretation. [#100] |
| Render `stave` with `notes :qSd X/5` | Both rejected the constructed duration `qsd`, even in notation-only mode. The original slash/text example therefore fails before its reported alignment can be measured. | **P0.** Model the dot and notehead type independently, then check the chord label's onset. [#62] |
| Draw the same Artist twice after a trailing bar | Both left two voice entries for a single written voice. The baseline also appended a second player group. | **P0.** Resizing, printing and live editing need repeatable draws. |
| Render the A-major chord from [#164] | In both SVGs the natural's baseline was at the G head (y = 70), with E at 80. For the first unsorted chord from [#161], the baseline build attached the flat to E/4 at source index 2. The SVG flat landed at the E head (y = 80). | Keep these as pitch/head regression fixtures. Check the remaining chords and cautionary variants. Preserve the author's chord order. |
| Add or remove the final bar from [#99] | On 5.3 the four tab and staff attacks had matching x coordinates in both versions of the snippet. | Preserve the working case. Investigate the distinct repeat-bar report [#163]. |
| Toggle `beam-rests` for eighth-note C, rest, D, E | The two baseline runs gave identical beam membership. An unmatched opening beam bracket also parsed successfully. | Test actual beam membership and malformed groups. [#58], [#104], [#107] |
| Render tutorial step 11 at its declared 650 px width | In the baseline SVG, the left edges of “Marcato”, “LH pizzicato” and “Snap pizzicato” fell at x = 729, 882 and 1,108 respectively. The example passed the draw check with those labels entirely outside the viewport. | **P1.** Measure annotation extents and warn on overflow. Break the tutorial's long articulation key into readable musical phrases. |
| Add a positioned half rest (`notes :h #2#`) with a four-string tuning | The baseline threw “String number must be between 1 and 4:6”. The rest builder queries string six to turn a staff position into a pitch. | **P0.** Position rests from staff coordinates independently of the tuning. |
| Reuse a parser after success, then parse invalid input | On the baseline the call threw and `isValid()` still returned true. `strings=bananas` also passed a separate parse and draw. With default tablature visibility, `stave notation=false` accepted music and created neither staff. | Test public API recovery and option validation alongside the DOM editor. |

The shortest fixture for the first timing failure is already valid VexTab. Toggle only `notation` and compare the total duration of the three attacks.

```vextab
options tab-stems=true
tabstave notation=false
notes :8 1-2-3/1 ^3^
```

These measurements cover specific inputs. Historical reports below still need their own reproduction on the supported backend, with the original tuning, voice structure and meter where relevant.

The assessment below records the pre-M1 behavior. [M1 fixes and reviewed examples](vt5-m1.md)

## P0 · Correctness and regression coverage

| Gap | Evidence and work to prioritize | Acceptance example |
| --- | --- | --- |
| Duration, tuplets and slash heads | `makeTuplets` exits when the standard staff is absent and passes legacy `num_notes`. The grammar supports one dot. A slash gets concatenated into the duration before the dot. Represent base value, dot count, head type, captured event count and ratio explicitly. Account for rests and reject groups that cross an unintended voice or bar. [Notes](../src/artist/NoteBuilder.ts) · [Tuplets](../src/artist/ArticulationBuilder.ts) · [#152] | Tab only, notation only and paired views agree on every rational onset. Cover mixed values, double dots, silent tab rests and compound-meter tuplets. [#84] |
| Meter, beams and voices | The stave builder obtains meter-aware default beam groups, but the renderer constructs soft 4/4 voices and passes snake-case beam, stem and rest options to camel-case VexFlow APIs. The grammar emits beam boundaries and the dispatcher ignores them. Voice options are validated but discarded when switching voices on an existing stave. [Grammar](../src/vextab.jison) · [Compiler](../src/vextab/VexTabParser.ts) · [Renderer](../src/artist/ArtistRenderer.ts) · [#39], [#58], [#83], [#84], [#104], [#105], [#107] | In 6/8, six straight eighths group 3+3. Authors can hide the meter, disable beams, or specify a group. A rest joins only under the chosen policy. Opposing voices retain their stems on isolated quarters as well as beamed notes. |
| Repeatable drawing and option scope | Drawing pops a trailing bar, pushes pending voices and appends playback data. The same interior BarNote instance serves tab and score. Staves set `left_bar` and the renderer writes `formatted` directly. Its beam pass reads final global customizations even when notes were built with earlier settings. [Stave builder](../src/artist/StaveBuilder.ts) · [Renderer](../src/artist/ArtistRenderer.ts) · [Artist](../src/artist/Artist.ts) · [#99], [#163] | Render twice, resize narrow then wide, change backend. Compare event count, stem setting per stave, bar types, aligned attacks, and final ink bounds. Include begin/end/both repeats inside and at the edges of a line. |
| Pitch, attachments and ties | Fretted pitches use a mutable key manager. Written pitches use a separate literal path. Fingerings, signs and ties rely on indices across several arrays. Tie lookup walks earlier tab notes within one stave. Test chord permutations, explicit naturals, octave changes and voice order before choosing a fix. Evaluate 5.4’s per-staff, per-bar accidental state separately from literal spelling. [WrittenAccidentalState](https://github.com/vexflow/vexflow/blob/5.4.0/src/notationspelling.ts) [Notes](../src/artist/NoteBuilder.ts) · [Articulations](../src/artist/ArticulationBuilder.ts) · [#27], [#31], [#57], [#161], [#164] | Name the head, sign, physical string and tie endpoints in the expected result. Include repeated pitches on different strings, a bar reset, and a triplet followed by a tie. Verify glyph positions as well as object associations. |
| Tests that can detect wrong music | Keep parser negatives, equivalence tests and packaged browser smoke tests. Add small musical assertions and a curated visual set for modifier collisions, rest positions, scaling and clipping. Several Artist calls bypass type checks via the legacy `any` namespace. [Compatibility shim](../src/vexflow.ts) · [Tests](../tests/tests.ts) | A deliberately wrong ratio, attachment index or beam group fails its own assertion even if the picture still renders. A visual change identifies the score, bar and backend for review. |

## P1 · What musicians and integrators should gain in 5.0

| Outcome | Current gap and opportunity | First useful scope |
| --- | --- | --- |
| Read a whole piece at any width | Each stave declaration creates a fixed-width group at the next y coordinate. VexFlow 5.4 adds continuous layout over aligned measures, including courtesy signatures, measure numbers, groups, repeat boundaries and span fragments. [#160], [#154], [#56], [#27], [#36], [#85] · [Continuous layout](https://github.com/vexflow/vexflow/blob/5.4.0/src/continuouslayout.ts) | Opt-in flow for bar-delimited music, explicit breaks, start-of-measure key changes, tied notes and first/second endings. Keep hand-laid fragments and unmetered exercises usable. Surface a clear overflow diagnostic for an indivisible wide bar. |
| Write idiomatic guitar parts | Today's bends infer labels from integer fret changes, ghost subsequent notes, and rely on previous-note indices. VexFlow 5.4 supplies paired staff/tab attacks, capo, dead strings, timed bends, string-specific palm mute and finger strokes. [#23], [#24], [#25], [#35], [#153] · [Instrument profiles](https://github.com/vexflow/vexflow/blob/5.4.0/src/instrumentprofile.ts) · [Guitar studies](https://github.com/vexflow/vexflow/blob/5.4.0/docs/vf6/m8-guitar.md) | Start with Drop D, capo, selective mute, a measured bend/release, and independent bass and melody voices. Preserve existing bend chains. Pre-bends, open-ended slides and general transposition need separate spelling and playback decisions. |
| Engrave a lead sheet | Free text uses timed TextNote voices. Commas split syllables, spaces split option values and vertical positions depend on hand tuning. A staff-line position for a whole/half rest is also fragile with custom tuning because positioned rests consult string six. [Text builder](../src/artist/TextBuilder.ts) · [#30], [#62], [#79], [#88], [#89], [#101] | Add quoted text, anchored lyric syllables, hyphens, melismas and chord symbols. Use a measured lane for marks above/below. Check slash and text timing, rest ledger lines, multiple verses and arrows under chords. Pair named chord shapes with the 5.4 fret diagram. [Phrase layout](https://github.com/vexflow/vexflow/blob/5.4.0/src/phraselayout.ts) · [FretDiagram](https://github.com/vexflow/vexflow/blob/5.4.0/src/fretdiagram.ts) |
| Edit, diagnose and read a score accessibly | `parse` trims each line and loses original columns. Some grammar nodes have no locations. Some accepted syntax disappears, including the top-level slur data. The editor listens to keyup, sets fixed pixel sizes and has no reliable range selection or announced status. [Parser](../src/vextab/VexTab.ts) · [DOM integration](../src/div.ts) · [#17], [#121], [#162] | Preserve source ranges through expansion. Support paste, IME, keyboard navigation, light/dark themes, and focusable errors. Select a note in the preview to find its source. Give SVG and Canvas users a reading order with measure, voice, duration, pitch or string/fret. [ScoreNavigation](https://github.com/vexflow/vexflow/blob/5.4.0/src/scorenavigation.ts) |
| Embed from a modern app | The main UMD entry imports Div, which touches `window` and registers a DOM-ready callback. The manifest points to one browser bundle with no declared types or exports map. The measured 4.0.6 main production JS alone is 1,308,014 bytes uncompressed. [Package](../package.json) · [Entrypoints](../webpack.config.js) · [#55], [#70], [#106] | Typed, DOM-independent parse entry, explicit browser rendering, and standalone legacy script. Test a bare import, a clean bundler app, two embeds on one page, and old markup. Measure transfer before and after. |
| Learn by editing real music | The historical tutorial has 15 steps and usable material. Step 7 reverses fret/string. The two demos are the README integrations. The site checkout's playground pins 4.0.5 and its static tutorial references a releases-directory URL. [Website playground](https://github.com/0xfe/vexflow.com/blob/ab302d9/src/playground/editor.js) · [Website tutorial](https://github.com/0xfe/vexflow.com/blob/ab302d9/static/vextab/tutorial.html) · [Tutorial](../doc/tutorial.html) · [Demos](../demos/README.md) · [#59] | One versioned collection of runnable VexTab scores powers progressive lessons, demos and regression checks. Coordinate the website consumer and keep historical tutorial links working. |
| Print and share the result | A tall drawing lacks page margins, page breaks and part selection. 5.4 Publication accepts a declarative composition and produces independent SVG pages and print HTML. It rejects native tickables in the publication source. [Publication](https://github.com/vexflow/vexflow/blob/5.4.0/docs/vf6/m5.md) | Print the same study on A4 and Letter, select its guitar part, export source and portable SVG. Track source measures and attachments across print, screen and part views. |

## P2 · Follow-on work and issue dispositions

| Request | Suggested disposition |
| --- | --- |
| Grand staff [#10], four-part writing [#102] and mixed-duration chords [#153] | Document two voices for simultaneous attacks with different releases. Add grouped treble/bass staves after measure alignment is proven. A keyboard-specific language can wait for actual scores. |
| Percussion [#64], rhythm without staff lines [#144], breath mark [#21] | Try a small named kick/snare/hat map with a generated legend and a staffless rhythm view. For breath marks, exercise the existing TextNote glyph path first. [PercussionMap](https://github.com/vexflow/vexflow/blob/5.4.0/src/instrumentprofile.ts) |
| Player failures and dependencies [#54], [#66], [#71], [#86] | The Div exports Player but does not instantiate it. Player expects MIDI.js, Paper.js, host soundfonts and a Canvas context. Its 25 ms timer dispatches at most one due onset per refresh. Document current setup, then build optional playback from exact musical events, with accessible controls, stop/dispose and load errors. Keep synthesis out of the engraving dependency path. [Player](../src/player.ts) |
| Further notation and language ergonomics [#23], [#24], [#25], [#35], [#78], [#81], [#74], [#121] | Trial pre-bends and slides with a guitarist. For transpose, define concert pitch, written pitch and whether fingering changes. Teach existing flat syntax (`@`, `@@`) before reserving `b`, which already denotes a bend. Test readable shortcuts and per-note color against current scores and print contrast. |
| Alternate formats [#94], [#103] | Record ABC, MusicXML and MIDI interchange as separate projects. A typed score representation gives converters an eventual target. MIDI alone leaves spelling, fingering and voice choices ambiguous. |
| Historical support, ownership and licensing [#63], [#65], [#70], [#75] | Recheck high-DPI Canvas against SVG at device scale 2. Give Meteor users a tested package entry. Route Google Docs add-on behavior to its owner. Ask the maintainer to reconcile licensing language across LICENSE, README, npm and the guide before launch. |

**Release cut.** Fix every confirmed P0, deliver the editable guitar and lead-sheet workflows, and qualify the guide and embedding paths. Rank advanced techniques, richer playback, percussion and interchange independently. The [implementation plan](vt5-plan.md) gives the fallback if continuous layout or publication cannot yet represent a technique faithfully.

[#10]: https://github.com/0xfe/vextab/issues/10
[#17]: https://github.com/0xfe/vextab/issues/17
[#21]: https://github.com/0xfe/vextab/issues/21
[#23]: https://github.com/0xfe/vextab/issues/23
[#24]: https://github.com/0xfe/vextab/issues/24
[#25]: https://github.com/0xfe/vextab/issues/25
[#27]: https://github.com/0xfe/vextab/issues/27
[#30]: https://github.com/0xfe/vextab/issues/30
[#31]: https://github.com/0xfe/vextab/issues/31
[#35]: https://github.com/0xfe/vextab/issues/35
[#36]: https://github.com/0xfe/vextab/issues/36
[#39]: https://github.com/0xfe/vextab/issues/39
[#45]: https://github.com/0xfe/vextab/issues/45
[#54]: https://github.com/0xfe/vextab/issues/54
[#55]: https://github.com/0xfe/vextab/issues/55
[#56]: https://github.com/0xfe/vextab/issues/56
[#57]: https://github.com/0xfe/vextab/issues/57
[#58]: https://github.com/0xfe/vextab/issues/58
[#59]: https://github.com/0xfe/vextab/issues/59
[#62]: https://github.com/0xfe/vextab/issues/62
[#63]: https://github.com/0xfe/vextab/issues/63
[#64]: https://github.com/0xfe/vextab/issues/64
[#65]: https://github.com/0xfe/vextab/issues/65
[#66]: https://github.com/0xfe/vextab/issues/66
[#70]: https://github.com/0xfe/vextab/issues/70
[#71]: https://github.com/0xfe/vextab/issues/71
[#74]: https://github.com/0xfe/vextab/issues/74
[#75]: https://github.com/0xfe/vextab/issues/75
[#78]: https://github.com/0xfe/vextab/issues/78
[#79]: https://github.com/0xfe/vextab/issues/79
[#81]: https://github.com/0xfe/vextab/issues/81
[#83]: https://github.com/0xfe/vextab/issues/83
[#84]: https://github.com/0xfe/vextab/issues/84
[#85]: https://github.com/0xfe/vextab/issues/85
[#86]: https://github.com/0xfe/vextab/issues/86
[#88]: https://github.com/0xfe/vextab/issues/88
[#89]: https://github.com/0xfe/vextab/issues/89
[#94]: https://github.com/0xfe/vextab/issues/94
[#99]: https://github.com/0xfe/vextab/issues/99
[#100]: https://github.com/0xfe/vextab/issues/100
[#101]: https://github.com/0xfe/vextab/issues/101
[#102]: https://github.com/0xfe/vextab/issues/102
[#103]: https://github.com/0xfe/vextab/issues/103
[#104]: https://github.com/0xfe/vextab/issues/104
[#105]: https://github.com/0xfe/vextab/issues/105
[#106]: https://github.com/0xfe/vextab/issues/106
[#107]: https://github.com/0xfe/vextab/issues/107
[#121]: https://github.com/0xfe/vextab/issues/121
[#131]: https://github.com/0xfe/vextab/issues/131
[#144]: https://github.com/0xfe/vextab/issues/144
[#152]: https://github.com/0xfe/vextab/issues/152
[#153]: https://github.com/0xfe/vextab/issues/153
[#154]: https://github.com/0xfe/vextab/issues/154
[#160]: https://github.com/0xfe/vextab/issues/160
[#161]: https://github.com/0xfe/vextab/issues/161
[#162]: https://github.com/0xfe/vextab/issues/162
[#163]: https://github.com/0xfe/vextab/issues/163
[#164]: https://github.com/0xfe/vextab/issues/164
