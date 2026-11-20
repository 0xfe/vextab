# VexTab 5.0 release qualification

VexTab 5 was an experimental release. This document records its design or results. See the [VexTab 6 guide](https://vexflow.com/vextab/guide/) for current notation.

VexTab 5.0.0 pins VexFlow 5.6.0. The npm dependency has the same integrity hash as the verified upstream GitHub tarball. VexTab now uses native slash stem anchors, positioned rests, structured augmentation dots, string-specific tab ties and repeat endings. Independent parts preserve chord names, notation lyrics, authored final barlines and time-signature visibility. [VexFlow release](https://github.com/vexflow/vexflow/releases/tag/5.6.0) · [Independent part limitations](../src/score/layout.ts)

## What to try

Open **Guitar duet** in the guide. Choose **Full score**, **Guitar 1** or **Guitar 2** and switch paper size. **Save print HTML** produces a complete HTML document. **Save SVG** saves the selected page. Both contain outlined Bravura and Academico glyphs and retain semantic measure and event metadata. The print outlines load on demand. The ordinary score and its fret cutouts use black ink on white paper in light and dark themes. [Duet source](../guide/scores/guitar-duet.vextab) · [Guide and embedding instructions](vt5-m4.md)

The four-bar duet fits one page in all six player and paper combinations. The upper voice begins on G4 and carries the tie across the barline. The lower voice begins on G3. A longer two-voice fixture with 24 forced systems occupied four pages on both sizes. On Letter the last page began at bar 22. On A4 it began at bar 24. The pages contained all 24 bars in order, and the browser exported the selected final page.

## Qualification results

| Surface | Observation |
| --- | --- |
| Chrome, Firefox and WebKit | The 67 QUnit tests passed in each engine. Packaged guide checks cover keyboard navigation, edits during IME composition, stale previews, independent editors, downloads and offline reopening. The 2× Canvas backing store matches twice the displayed width and height in all three engines. |
| First-load triplet | On the reported standalone page, the lower numeral went from 1.6 CSS pixels of overlap to 4 pixels of clearance. A whitespace edit leaves that clearance intact. The Chrome check measures the numeral’s ink against the filled beam. |
| Guitar tab | Fixed layout, flow and the independent Letter part draw open and two-digit frets in 11 pt Academico. Tests check opaque fret masks, side bearings and the vertical gap in a stacked chord. |
| Historical examples | All 28 examples and nine musical probes passed on the candidate. Step 11 now sets out articulation names and codes in shorter rows. Its test measures every text box against the 650-pixel viewport. |
| Reader | The maintainer followed Next event with VoiceOver in **Your first fret** and found the note with Select source. |
| Package and website integration | The installed tarball passed CommonJS and ES module parsing, strict TypeScript compilation, bundling and browser mounting. A clean build of the sibling website rendered all 27 editors on its VexTab landing page, tutorial and example page with the candidate. |

[Browser tests](../scripts/test-browser.mjs) · [Display checks](../scripts/test-display.mjs) · [Offline guide checks](../scripts/test-guide.mjs) · [Baseline runner](../scripts/test-baseline.mjs)

## Cost on the M0 fixtures

On macOS arm64 with Chrome 157, the release comparison measured the main production bundle at 1,444,972 bytes, against 1,308,014 for released 4.0.6. Median parse-and-draw times for the short exercise were 1.8 ms and 1.6 ms respectively. For 16 systems they were 20.15 ms and 17.95 ms. These are local samples. The [M0 report](vt5-baseline.md) describes the fixtures and method.

In a separate flow-editor check, mounting one bar took 13.6 ms and mounting 16 bars took 34.1 ms after the font-ready promise. Ten alternating edits had median times of 3.5 and 24.0 ms. Reflow between 360 and 600 pixels took 2.6 and 23.3 ms. Each editor retained one visible surface. Input after disposal caused no additional render. These lifecycle checks measure observable behavior and do not quantify heap retention.

## Public rollout

The numeric GitHub release builds the tarball and checksums. Publish that verified tarball to npm, then pin the same version in the website. The site builds its own legacy editors and maintains a separate tutorial. Update its step 7 wording to **fret/string** and check the historical URLs. Serve the packaged guide with its relative bundle paths and lazy print chunks intact. Check the guide, original-score links, duet downloads and the two README examples against the deployed build. [Release commands](developers.md) · [Milestone tracker](https://github.com/0xfe/vextab/issues/176)
