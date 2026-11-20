# VexTab 5 musical baseline

VexTab 5 was an experimental release. This document records its design or results. See the [VexTab 6 guide](https://vexflow.com/vextab/guide/) for current notation.

M0 pins VexFlow 5.4.0. In the November 19 comparison, all 28 existing examples drew and the four known musical defects reproduced on both versions. The four pairs of reference PNGs matched byte for byte on the same machine. [Milestone plan](vt5-plan.md) · [Tracking issue and reference images](https://github.com/0xfe/vextab/issues/176)

## Musical results

Each probe uses standard guitar tuning, the first voice and the first bar in 4/4. One quarter lasts 4,096 VexFlow ticks. Fractions below are exact. The natural and alignment measurements use the SVG after the music fonts load. [Scores and expected observations](../tests/baseline/music.mjs)

| Score | Musical expectation | VexFlow 5.3.0 and 5.4.0 |
| --- | --- | --- |
| Tab-only triplet, #131 | Three eighths share one quarter | **Reproduced defect.** Each attack lasts 2,048 ticks. The tab has no triplet number. |
| Paired triplet | Showing the staff preserves that rhythm | **Working control.** Each tab attack lasts 4,096/3 ticks. In the reference image, the lower number crowds the footer. |
| Mixed tuplet, #100 | A quarter and an eighth under a triplet share one quarter in a 2:1 ratio | **Reproduced defect.** The attacks last 4,096 and 2,048 ticks. |
| Dotted slash, #62 | A dotted quarter slash lasts 6,144 ticks | **Reproduced defect.** Construction throws on the duration `qsd`. This prevents checking the original chord-label placement. |
| Draw twice after a final bar | A single written voice remains one voice on each staff | **Reproduced defect.** The second draw leaves two tab voices, two notation voices and two player groups. |
| A-major chord, #164 | The natural cancels G sharp | **Working.** The chord modifier selects G/4 and the single natural glyph is at the G head, with zero vertical offset. |
| Four attacks with and without a final bar, #99 | Tab and staff agree at every onset | **Working.** All four horizontal offsets are zero in both variants. |
| Opening repeat, #163 | Review the extra left line in the historical report | **Historical, pending review.** The candidate and release images agree. The desired repeat-bar appearance still needs an engraving decision. |

## Corpus and compatibility

The runner reads the 24 historical tutorial examples, both demos, and both playgrounds in their own pages. It uses the production bundles from each distribution. The JSON result includes the actual source, heading, expected musical phrase, page, example number and backend. The examples exercise visible output and editor errors. The dedicated probes above assert the musical details. [Page fixtures and expectations](../tests/baseline/examples.mjs)

| Surface | Check |
| --- | --- |
| Browser API | `window.vextab`, `Vex.Flow.Renderer`, an array of stave elements returned by `VexTab.parse`, and both `Artist.render` and `Artist.draw` |
| Modern embed | `.vextab-auto` renders an SVG and retains the editable source |
| Legacy embed | `VexTabDiv` and `.vex-tabdiv` render the original tutorial and playgrounds. The default playground draws ink on Canvas. Its SVG counterpart renders from the same source. |
| Package | Existing QUnit, error recovery/display and packed production entry checks run alongside the musical comparison. [Browser suite](../scripts/test-browser.mjs) |

## Size and warm render time

Local run on macOS arm64, Node 26.13.0 and Chrome 157.0.8103.79. The short exercise has eight attacks on a paired staff/tab system. The long study repeats it over 16 systems. Each measurement creates a fresh Artist, parses, draws SVG and requests layout. The table shows medians of ten samples after a warm-up. Treat small timing differences as machine and run variation.

| Package | Main production JS, uncompressed | Short exercise | Long study |
| --- | ---: | ---: | ---: |
| Released VexTab 4.0.6 with VexFlow 5.3.0 | 1,308,014 bytes | 1.65 ms | 18.35 ms |
| M0 candidate with VexFlow 5.4.0 | 1,379,932 bytes | 1.65 ms | 19.10 ms |

The dependency upgrade adds 71,918 uncompressed bytes (5.5%) to the main bundle. The production build emits Webpack's bundle-size warnings.

## Reproduce

From the repository root, with Chrome installed, run these commands after `npm ci`.

```sh
npm run build
npm run test:baseline
```

CI passes the unpacked candidate's `dist` directory to the same command. The runner downloads and verifies the original release, then prints a temporary directory containing the tarball, extracted distribution, JSON results and opaque white PNGs. For offline comparison, set `VEXTAB_BASELINE_TGZ` to a previously downloaded tarball. The SHA-256 digest must be `1887533456cd748c4abd4bd4a1e9ff23a003f25e8f8ef34ac9175b0bd96ff6cd`. [Original release](https://github.com/0xfe/vextab/releases/tag/4.0.6)

M1 fixes should set `fixed: true` on the corresponding probe once the candidate meets its musical expectation. CI will then require the corrected observation for the candidate and reproduce the original defect on 4.0.6. A different exception or tick count fails the comparison.
