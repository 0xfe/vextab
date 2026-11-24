# VexFlow engraving migration

The eleven repertoire scores that motivated this work are the acceptance fixtures. Compare the same source on VexTab `1eb710d` with VexFlow 5.9.0 and on the migration with the pinned VexFlow 5.10.0 npm release. The npm and GitHub tarballs are identical. The tarball SHA-256 is `14ff96f0ad070923bd0f33c1ef9b73687f8186b24e86b2b9f00cdf8fe07368be`. The VexTab review branch starts at `f90dc2d`.

## What changed

| Public VexFlow API | Downstream work retired | Repertoire check |
| --- | --- | --- |
| Composition `engraving.prepareNote` and `place` | Replaying commit hooks, discovering a private factory, injecting publication callbacks. | Select an All of Me chord after reflow and trace Haydn’s bar-23 cello cue back to violin II. |
| `verticalSpacing: 'profile'` and native stroke ink | Local ledger and curve sampling, rolled-chord geometry, grand-staff refitting and page-gap changes. | Liszt’s rolled chord, Joplin’s cross-staff notes and the Ballade’s Letter edition. |
| `stemPolicy: 'active-voices'`, typed skips, beams and tuplets | Splitting beams across inactive voices and repositioning brackets after formatting. | The Consolation pickup points up. In written measure 7, six eighths share a down-beam against three up-stem quarters. Friska retains its written level beams. |
| Continuous slurs | Native layout chooses attachments and handles reflow. Two remaining endpoint cases have stock reproductions below. | Soleá across a system break and Haydn’s extracted part. |
| Typed heads, accidentals and fingerings | Fingering-column selection, measured local offsets and replacement of generated signs. | Reverse the Étude third at bar 5. Extract Sor’s marked guitar part. |
| `textLanes: 'system'`, named verses and timed directions | Local harmony and lyric baseline refits and manual cross-system connector adjustments. | Handy’s two verses and the Friska’s timed direction. |
| Event ossias and text-style pedals | Miniature ossia factory, hand-placed pedal signs. | The Ballade retains its three-note alternate reading, mordent and 16 pedal pairs. |
| Screen and page head-occurrence indexes | Searching exported SVG for pitched and TAB heads to drive playback. Silent beats still anchor the playhead. | Select either projection of an All of Me chord. A Haydn cue links to its donor without adding an attack. |
| `continuous.opening` | Separate diagram wrapping, swing miniature factory and injected first-system indent. | Pocket Change’s swing equation, the Soleá diagram key and the opening piano brace. VexTab retains the Ballade’s raised lettering and editorial credit columns. |

For example, a numeric fingering now travels with its typed notehead. VexTab supplies the digit and position once. VexFlow assigns it to the correct pitch, measures its clearance and recreates it on the printed page. The initial migration at `cca2569` removed 1,154 lines and added 501 across production sources, webpack and both loaders relative to `f90dc2d`. The new 41-line loader is included in that count.

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

## Open upstream cases

- A TAB slur ending across a forced A4 break can report a collision. [VexFlow #471](https://github.com/vexflow/vexflow/issues/471)
- A harmony on a notation staff asks for ink from its companion TAB staff and reports unsupported geometry. [VexFlow #472](https://github.com/vexflow/vexflow/issues/472)
- Pitched slurs need an alternative attachment around fingered beams and an opposite-side retry for an undirected phrase. Authored sides remain fixed. [VexFlow #473](https://github.com/vexflow/vexflow/issues/473)
- Two separately selectable directions can occupy the same bar-edge position. VexTab still reserves space and draws that subset of timed text. [VexFlow #474](https://github.com/vexflow/vexflow/issues/474)
- Hairpins and deep ledger notes outside the wedge span can spread the Chopin piano hands. [VexFlow #475](https://github.com/vexflow/vexflow/issues/475)
- Two tuplet numerals can collide in paired notation and rhythmic TAB. Those scores use envelope spacing pending the native fix. [VexFlow #476](https://github.com/vexflow/vexflow/issues/476)

Repeat the linked controls on the next stock release. Remove the matching workaround as each control and its repertoire passage pass. The two webpack targets can go when the first three controls pass without rewriting VexFlow.
