# VexFlow engraving migration

The eleven repertoire scores that motivated this work are the acceptance fixtures. Compare the same source on VexTab `1eb710d` with VexFlow 5.9.0 and on the migration with the VexFlow 5.10.1 release. The npm and GitHub tarballs are identical. The tarball SHA-256 is `df35e4864c4e0042ab298628c900634d29eaab7b466aaa6d8df230f25e24729d`. The VexTab review branch starts at `f90dc2d`.

## What changed

| Public VexFlow API | Downstream work retired | Repertoire check |
| --- | --- | --- |
| Composition `engraving.prepareNote` and `place` | Replaying commit hooks, discovering a private factory, injecting publication callbacks. | Select an All of Me chord after reflow and trace Haydn’s bar-23 cello cue back to violin II. |
| `verticalSpacing: 'profile'` and native stroke ink | Local ledger and curve sampling, rolled-chord geometry, grand-staff refitting and page-gap changes. | Liszt’s rolled chord, Joplin’s cross-staff notes and the Ballade’s Letter edition. |
| `stemPolicy: 'active-voices'`, typed skips, beams and tuplets | Splitting beams across inactive voices and repositioning brackets after formatting. | The Consolation pickup points up. In written measure 7, six eighths share a down-beam against three up-stem quarters. Friska retains its written level beams. |
| Continuous slurs | Native layout chooses attachments and handles reflow. The stock fitter also clears TAB breaks and beams at violin slur endpoints. | Soleá across a system break and Haydn’s extracted part. |
| Typed heads, accidentals and fingerings | Fingering-column selection, measured local offsets and replacement of generated signs. | Reverse the Étude third at bar 5. Extract Sor’s marked guitar part. |
| `textLanes: 'system'`, named verses and timed directions | Local harmony and lyric baseline refits and manual cross-system connector adjustments. | Handy’s two verses and the Friska’s timed direction. |
| Event ossias and text-style pedals | Miniature ossia factory, hand-placed pedal signs. | The Ballade retains its three-note alternate reading, mordent and 16 pedal pairs. |
| Screen and page head-occurrence indexes | Searching exported SVG for pitched and TAB heads to drive playback. Silent beats still anchor the playhead. | Select either projection of an All of Me chord. A Haydn cue links to its donor without adding an attack. |
| `continuous.opening` | Separate diagram wrapping, swing miniature factory and injected first-system indent. | Pocket Change’s swing equation, the Soleá diagram key and the opening piano brace. VexTab retains the Ballade’s raised lettering and editorial credit columns. |

For example, a numeric fingering now travels with its typed notehead. VexTab supplies the digit and position once. VexFlow assigns it to the correct pitch, measures its clearance and recreates it on the printed page. The initial migration at `cca2569` removed 1,154 lines and added 501 across production sources, webpack and both loaders relative to `f90dc2d`. That count includes the 41-line compatibility loader. The 5.10.1 integration deletes that loader and its webpack rule. The complete migration removes 1,233 production and build lines and adds 550, a net reduction of 683 against the review base.

## Reproduce the comparisons

Build the guide with the candidate dependency installed, then run the packaged browser suite. The repertoire runner also accepts a separate directory of canonical score files and an extracted package's `dist` directory.

```sh
npm run build-dev
npm run build
npm run typecheck
npm run lint
npm run test:corpus
node scripts/test-browser.mjs
node issues/213/repertoire.mjs /path/to/eleven/guide/scores dist
```

The runner opens each full score through its guide lesson or loads it into the piano editor when the checkout does not list the lesson. A missing score fails the run. Eight fixtures are on the review branch. The two Liszt files are from VexTab `1eb710d`. The independent Chopin Étude draft used for both builds has SHA-256 `4ac6972ea346b869a824e0127ba743ee8e2c575fac9ad9e6238efc8bfb7471d0`. Use those revisions to reproduce the comparison.

At the original 1,080-unit fallback width, all eleven retained their baseline reading-event, system and page counts. A visual review at a 960-unit fallback identified two screen reflows and additional engraving defects. See the [19-demo comparison and all printed editions](visual-review.md). Ten editions fit one page and the Haydn cello part takes two. The migrated conductor views and editions reported zero diagnostics at authored widths. The ordinary browser suite covers Canvas and SVG, reflow, independent parts, playback, and A4 and Letter printing. The unchanged upstream composition, engraving, phrase, publication and EasyScore rendering controls were run separately against the stock release.

## Authoring trial

In the packaged guide editor, replace the first occurrence of `(B4[finger 1 above] D#5[finger 3 above])` with `(D#5[finger 3 above] B4[finger 1 above])` in the Étude ascent. Commit the edit with Control+Enter. The two heads exchange written order, and each retains its pitch, finger and editable source in the extracted right hand. The change touches one source location and needs zero offsets or repeated edits in the part. The author used the same score spelling on both versions. The demonstrated saving is in maintaining engraving code. An independent reader and maintainer walkthrough remains open.

## Stock VexFlow 5.10.1 controls

| Upstream fix | VexTab change | Result |
| --- | --- | --- |
| [TAB slur continuation](https://github.com/vexflow/vexflow/issues/471) | Delete the patched continuation endpoint search. | The stock four-note phrase clears its forced A4 break. Soleá renders on screen and paper without diagnostics. |
| [Harmony over paired TAB](https://github.com/vexflow/vexflow/issues/472) | Delete the geometry patch that manually collected TAB fret ink. | The stock harmony example, All of Me conductor and printed guitar pass. |
| [Violin slur attachments](https://github.com/vexflow/vexflow/issues/473) | Delete the patched endpoint trials and opposite-side retry. | The stock violin phrase and the Haydn conductor and parts pass. Authored slur sides remain explicit. |
| [Bar-edge directions](https://github.com/vexflow/vexflow/issues/474) | Supply a typed direction and source ID for each sign. Remove local width reservation, note metrics overrides and the custom drawing loop. | Two start signs, a beat label and two end signs retain five independent source selections at two screen widths and in the extracted part. Smooth beat text retains its silent reading anchor. |
| [Grand-staff hairpins](https://github.com/vexflow/vexflow/issues/475) | Use the upstream spacing fix with the original score text. | Ballade’s opening staff gap falls from 125 to 89 units. Étude system four falls from 180 to 167, with the wedge clearing the upward bass slur in bar 11. |
| [Rhythmic TAB tuplets](https://github.com/vexflow/vexflow/issues/476) | Remove the score-wide switch to envelope spacing. | Both tuplet numerals in Compound-time picking retain eight units of clearance, on screen and paper. |

The importer’s [Echigo-Jishi beam fix](https://github.com/0xfe/vextab/commit/26976af1cc679852974b554b480b4ae962f8bcd4) is covered in `tests/expression.ts`. VexTab passes the explicit beam range to VexFlow. Its native beam builder chooses a single direction for A4–A4–B4–A4, including the B on the middle line. The original regression test checks automatic and explicitly down-stemmed groups. The extracted notation part checks all four drawn stems as well.

VexFlow’s stock publication suite passes all 35 tests against the GitHub release bundle. The [full demo comparison](visual-review.md) covers the VexTab passages and editions. The second-reader and second-maintainer walkthroughs remain open.
