# VexTab 5 implementation plan

**The release demonstration should be one piece of music in several settings.** Enter a fingerstyle study as VexTab, read the bass under the melody in paired staff/tab, switch to rhythmic tab, narrow the screen, navigate to a tied note by keyboard, and print the guitar part. The same authored rhythm, pitches, strings and relationships should survive each step.

The [gap assessment](vt5-gaps.md) records the baseline, issue evidence and priority decisions. The milestones below are ordered by dependency. Start the guide with the first fixture and add a lesson when each feature becomes usable. Finalize the public syntax after trying it on complete pieces.

## M0 · Record the musical baseline and adopt VexFlow 5.4

[M0 results, compatibility checks and reproduction instructions](vt5-baseline.md)

1. Pin VexFlow 5.4.0 and update the lockfile in an isolated dependency change. Preserve the 4.0.6 tarball as the comparison point. The trial build passed 40 QUnit tests on both versions. Repeat CI, package and legacy entry checks on the actual locked dependency.
2. Extract fixture sources from the 24 historical tutorial snippets, both demos, the two playgrounds under `doc/`, and representative issue reports. Record each expectation as a musician would describe it, with the tuning, meter, intended voice and affected bar. Mark current failures explicitly. Treat reproduced, historical and already-working cases separately in the fixture results.
3. Start with six comparisons from the [baseline table](vt5-gaps.md#what-the-baseline-actually-does). Measure rational ticks for the tab triplet and mixed tuplet, capture the dotted slash exception, draw the trailing-bar example twice, locate the natural on the G, and measure the four aligned attacks from #99. Compare SVG coordinates after fonts load. Add a Canvas smoke check and a few opaque white-background visual references for engraving.
4. Identify the public compatibility surfaces from the shipped package. Include `VexTab.parse` and its return value, `Artist.render/draw`, `Vex.Flow`, `window.vextab`, the `VexTabDiv` global, both auto-render selectors and the legacy Canvas default. Record bundle size and render time for a short exercise and a long study on the same machine.

**Exit criterion.** The same corpus runs against the released baseline and the candidate dependency. Each observed change names a score and a musical effect. A green smoke suite alone cannot advance a known wrong note or duration. [Existing browser harness](../scripts/test-browser.mjs) · [VexFlow 5.4 changes](https://github.com/vexflow/vexflow/compare/5.3.0...5.4.0)

## M1 · Repair the existing language and renderer

[M1 results, notation reference and editable triplet lesson](vt5-m1.md)

- **Duration and beams.** Separate duration, dots, notehead and rest status before constructing a VexFlow note. Translate the two VexTab tuplet operands into capture count and musical ratio. Construct tuplets before voices and beams, including tab-only and hidden-stem timing. Give voices their actual meter. Use typed VexFlow options for stems, rest beams, stemlets, left bars and aligned rests. Define precedence for explicit beam brackets, auto grouping and beams disabled.
- **Pitch and attachments.** Preserve written head, accidental, string and fingering identity through chord expansion. Test notation by name and by fret, including key-signature cancellation and cautionaries. Protect the working #164 case. Establish expected endpoints for chord ties across a bar or after a tuplet. Fix any confirmed placement error at the stage that loses the association.
- **Drawing and boundaries.** Capture effective options per stave/voice. Finalize pending notes, bends and end bars once. Render from a consistent snapshot and create fresh layout-owned objects where VexFlow mutates them. Keep player data in step with the current draw. Exercise two Artists and switching width, scale and backend. Use a staff-relative position for rests. Verify that the four-string half-rest example draws at the requested height.
- **Editing failures.** Clear the public parser's validity on failure. Preserve original line/column positions for indented and CRLF source. Catch render-time failures as well as syntax errors in the editor. Keep the last complete preview visibly marked as stale until a successful edit. Reject invalid numeric options at the token and validate effective staff visibility after applying defaults. Preserve historical bracket-containing scores by documenting a compatibility mode for unmatched or formerly ignored syntax.
- **Review visual reports.** Check #163's start repeat, #88's ledger rests, #101's marks on opposite sides, #62's repaired slash/text example and #57's post-tuplet tie. Reproduce on the current build, minimize, then fix or record the working fixture. Replace only the legacy calls implicated in these paths. Retain the public compatibility shim.

**Exit criterion.** All P0 regressions pass with asserted ticks, attachment targets, bar types, beams or glyph positions. Three views of the same rhythm agree. Two draws equal one, invalid → valid restores the preview, and the historical examples have reviewed outcomes. Ship the first editable guide lesson using the triplet toggle.

## M2 · Give layout, the editor and print a shared score

[M2 results, integration reference and editable tied-chord lesson](vt5-m2.md)

Keep Jison and the existing fret/string notation. Extend the current semantic compiler in small slices. Begin with a two-bar paired score containing a rest, a chord and a tie. Compare it through both layout paths before moving other constructs.

| Boundary | Proposed contract | Compatibility decision |
| --- | --- | --- |
| Source → score | Preserve original source ranges. Represent staff, voice, bar, attack, chord members, exact onset/duration and span endpoints. Store written pitch, sounding pitch and physical string/fret separately. One attack can project into two staves with distinct rendering IDs that map to one source event. | Keep the existing parser/Artist entry points. Introduce a pure parse/validate entry separately. Keep provisional types internal until the fixtures exercise them. |
| Score → measures | Treat barlines as boundaries, including an opening repeat and a closing final bar. Track meter separately from its visibility. Keep an explicit pickup span, per-voice timing, and scoped key/tuning changes. | Preserve manually laid-out 4.x fragments and soft voices. For opt-in flow, explain incomplete or unequal bars at the source. Require an explicit pickup or deliberate fragment where balancing would change the music. |
| Measures → VexFlow | Map to declarative `EasyScoreCompositionSpec` note/tab descriptors, aligned measure arrays and continuous spans. Use a narrow typed adapter. Build after-layout attachments from source IDs. Retain the declarative input so independent print views can recompose it. | Keep the current fixed-row renderer for custom legacy marks until their equivalent works. Prototype a bent chord, timed text and an across-row tie early. Never silently omit an unsupported mark in flow or print. |
| Result → host | Provide diagnostics and mappings between original ranges, score IDs and the current layout. Rebuild geometry after resizing. Keep ranges tied to a source revision so a stale preview cannot select unrelated text. | `ScoreNavigation` consumes a formatted composition. Create it after layout. Select between paired projections by staff while retaining the musical event. |

**Exit criterion.** One two-bar source renders through the old façade and the declarative path with the same pitches, rational onsets, string positions and tie. A deliberate parse error leaves the previous result intact. Reflow and independent part rendering recover the source range of the same event. If a required mark cannot survive recomposition, keep fixed layout available and report which source construct blocks that view. [Composition contract](https://github.com/vexflow/vexflow/blob/5.4.0/src/easyscore/composition.ts) · [Publication input checks](https://github.com/vexflow/vexflow/blob/5.4.0/src/publicationview.ts)

## M3 · Deliver responsive scores and a small guitar vocabulary

[M3 results, syntax and editable guitar and lead-sheet studies](vt5-m3.md)

| Deliverable | Implementation choice | Musical acceptance test |
| --- | --- | --- |
| Continuous score | Opt in to measure-aware wrapping. Explicit stave/line breaks remain meaningful. Use continuous boundaries for repeats, rehearsal marks and numbering. Add first/second endings and ties as anchored spans. Add key changes at bar boundaries first, then qualify inline changes before documenting broader support. | A 12-bar study wraps at different bars on phone and desktop. Tab/notation barlines coincide. A tie, volta and mute that cross a break retain their endpoints. A too-wide bar produces a located diagnostic. |
| Fretted instruments and two voices | Use `FrettedInstrument` for tuning, capo, pitched/muted attacks and selected-string bends. Define compact, additive syntax for the first supported techniques. Introduce bass and melody as voices with separate durations. | Compare an open sixth string in standard and Drop D tuning. A capo changes the sounding pitch as documented. Sustain the bass through two treble attacks. A muted strike shows X while a silent position consumes only its specified time. |
| Guitar gestures | Start with a timed whole-tone bend/hold/release and a string-specific palm mute. A timed bend occupies one attack in 5.4. Keep legacy multi-note bend phrases on their existing path until group timing and positions match. Trial rasgueado after those pass. | A guitarist identifies the bent string, stationary pitch, peak and release beat, and can tell which bass notes remain muted after wrapping. Check the tab-only version as well. |
| Lead sheets | Use anchored chord symbols, measured lyric lanes and attachment obstacles. Keep positional text supported for old scores. Add quoted lyric text and a chord frame with explicit string order, open/muted strings and barre. | Chord changes align with the dotted slash rhythm. A comma survives a verse, a hyphen joins syllables, and the held lyric clears a lower voice. A diagram and the written voicing agree string by string. |

**Exit criterion.** The fingerstyle study and lead sheet below pass at 360 and 960 CSS pixels and after returning to the original width. Review the dense examples with a guitarist or engraver, including which note each technique acts on. If a specialist gesture needs more design, ship the verified vocabulary and list the rest as proposed. [Continuous spans](https://github.com/vexflow/vexflow/blob/5.4.0/src/continuousspan.ts) · [PhraseLayout](https://github.com/vexflow/vexflow/blob/5.4.0/src/phraselayout.ts) · [Guitar contracts](https://github.com/vexflow/vexflow/blob/5.4.0/docs/vf6/m8-guitar.md)

## M4 · Make the guide, demos and embedding experience release features

**Guide.** Follow the VexFlow guide's one-concept lessons, editable examples, stable lesson links, exercises and reset behavior. Use VexTab source everywhere a learner writes music. Keep lesson prose and plain-text scores independently editable. Give each score one stable ID with a title, learning goal, expected result and supported views. Load the same source into the guide, playground, demos and tests. [VexFlow guide](https://vexflow.com/guide/) · [Guide source and authoring conventions](https://github.com/vexflow/vexflow/blob/5.4.0/docs/guide.md)

| Guide sequence | What the reader should be able to do |
| --- | --- |
| First minute | Render a fret/string pair, change its fret, identify the new pitch, and switch between tab, notation and paired views. Follow either the hosted or embedded example. |
| Rhythm and pitch | Read durations, dots, rests, tuplets and beams. Compare 3/4 and 6/8. Read pitch/octave, flats, key signatures, chords and alternate tuning. |
| Guitar writing | Build hammer-ons, pull-offs, slides, vibrato, bends, fingerings and muted attacks. Work from a one-string lick to an independent bass line. |
| Complete pieces | Enter bars and voices, add lyrics and chord symbols, cross a system break, select a source note, and print a part. Explain diagnostics with a deliberately incomplete measure. |
| Reference and integration | Search keywords, defaults, scope and compact spellings. Link each entry to an editable example and its supported version. Cover the DOM embed, typed API, legacy migration, accessibility and export. |

**Demo repertoire.** Use short original scores with a musical question and one suggested edit. Each demo below has an observable check. Keep both existing integration demos as minimal copyable examples.

| Demo | Edit in the playground | Check in the preview |
| --- | --- | --- |
| Compound-time picking exercise | Switch a three straight eighths to a tuplet, then hide notation | Three eighths now occupy one quarter. Hiding notation preserves that duration. |
| A-major chord workshop | Reorder the four strings of the #164 chord | The natural stays on G. A fingering stays on its physical string. |
| Two-voice bossa study | Delay an upper chord while holding the alternating bass | The upper voice anticipates the barline and the bass lasts its written value. |
| Drop D bend study | Move the bend peak earlier and narrow the score | The stationary pitch holds. The mute continues on string six across the break. |
| Twelve-bar lead sheet | Edit a chord, a slash rhythm and one lyric syllable | The chord symbol, fret diagram and lyric remain legible at their intended beats. |
| Repeat-ending reading exercise | Force a break before the second ending | Both endings are readable, measure numbers survive, and keyboard selection returns to the source. |
| Guitar duet for print | Select guitar two and switch between Letter and A4 | Each part starts with its own identifying marks and retains the right measures and ties. |
| Embedding workbench | Mount two editors, paste invalid source into one, recover and resize | Errors, focus, rendering and current selection stay local to the edited instance. |

**Editor and reader.** Support mobile sizing, input/composition events, keyboard run/reset, local drafts with a storage-disabled fallback, copy source, and links to the original example. Clearly identify what a shared link opens. Add a labelled reading region with next/previous event and source selection using `ScoreNavigation`. Expose text summaries on Canvas too. Support dark display with legible fret cutouts and an opaque white print surface. [Reader API](https://github.com/vexflow/vexflow/blob/5.4.0/src/scorenavigation.ts)

**Package and docs.** Ship typed entry points for parsing and browser rendering, plus opt-in DOM auto-rendering. Keep the legacy UMD assets and attribute aliases covered by the packed-consumer tests. Move detailed grammar, API, migration and embedding reference into `docs/`. Keep the README to two working quick starts. Refresh `docs/developers.md` for visual tests, guide builds and release assets, `demos/README.md` for running examples, and `SECURITY.md` for supported score limits, text handling and optional audio. Align the license summary with maintainer-approved terms. Map the 15 historical tutorial steps to new lesson anchors and preserve old URLs.

**Exit criterion.** A first-time user can go from the README to an editable score, find a syntax error by keyboard, save source and reopen it. Every listed demo renders from its canonical VexTab file. A freshly installed package passes a typed bundler example and a DOM-free parser import. Test mounted, unmounted and remounted editors, mobile navigation and screen-reader event descriptions.

## M5 · Qualify the score, print output and release artifacts

1. Produce screen, full-score and part views of the duet from one source via `Publication`. For the print document supply matching outline fonts. Check margins, page turns, first/last bars, title and page count on A4 and Letter. Open the exported SVG/print document offline. Surface missing-font or overflow diagnostics before offering a finished export. [Publication workflow](https://github.com/vexflow/vexflow/blob/5.4.0/docs/vf6/m5.md)
2. Run representative notation and integration cases on Chromium, Firefox and WebKit, SVG and Canvas. Measure attack alignment, head/sign associations, span fragments and ink inside the viewport. Use tutorial step 11 at 650 px as the clipping regression. Exercise desktop/mobile widths, device scale 2, repeated resizes, paste/IME, mixed valid/invalid edits and two simultaneous embeds. Keep exact pixel comparisons limited to a pinned browser/font configuration. Spot-check the reader with a real screen reader.
3. Compare the short exercise and long study with M0 for first render, warm edit, reflow, bundle size and retained voices/listeners. Investigate regressions against the same hardware and font state. Check package import, legacy globals and tutorial examples from the extracted candidate tarball.
4. Coordinate the website update with the release owner. The sibling site builds its own playground and hosts a separate tutorial copy. Pin the tested VexTab artifact there, remove stale bundle references, and verify historical URLs and their new guide destinations. Follow the existing numeric-tag GitHub Release and checksummed-tarball npm workflow. Smoke-test the public guide, demos and both README quick starts against the published artifact. [Release instructions](developers.md)

**5.0 release gate.** P0 defects have passing regression tests. The first six musical demos, the printed duet and the embed workbench pass their stated checks. The language reference identifies supported syntax, compatibility behavior and limitations. A feature whose screen and print representations disagree stays out of the advertised export scope until it has an explicit diagnostic or a faithful implementation.

## After 5.0

First expand the workflows demonstrated by actual scores. Candidates are pre-bends and open slides, rasgueado/golpe, drum-kit notation with a legend, a piano grand staff and optional playback. Playback needs a tie-aware event stream, explicit pitch/mute semantics, user-gesture audio startup and keyboard controls. Check elapsed audio against the score through rests, tempo changes and tuplets. Give these additions their own listening or playing studies. Revisit file interchange and alternate grammars once the score model and migration story are stable.
