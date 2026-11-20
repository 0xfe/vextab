# Convert a score to grammar v2

VexTab 5 was an experimental release. Its default language, grammar v1, also appears in earlier scores. VexTab 6 defaults to grammar v2. During migration you can select the v1 reader for each existing score.

From the VexTab 6 checkout, run `npm ci` and `npm run build-dev`. The converter reads one VexTab score from a file or standard input and writes a preview to standard output.

```sh
node scripts/migrate-score.mjs old.vextab
node scripts/migrate-score.mjs old.vextab > song-v2.vextab
```

A packed installation provides the same command as `npx vextab-migrate old.vextab`. Use a different output filename to keep the original. Open the result in the [playground](https://vexflow.com/vextab/guide/#playground/first-fret) and compare its notes, playback and print layout.

The converter uses the historical measured parser to resolve shorthand, timing, instrument, chord heads and ties. It emits checked v2. A fixed-layout-only instruction, ambiguous tuning or unsupported setting produces a source location for manual review. For example, choose the four open pitches for a blank four-string instrument. A legacy bend or annotation may need an explicit head or text lane. See the [14-step tutorial](../doc/tutorial.html) and [feature examples](../guide/features.html) for the replacement notation.

VexTab 6 reads the converted score by default. To keep an existing v1 score in use during migration, pass `{ language: 1 }` to the parser or set `data-language="1"` on its embed. Guide downloads contain the editable score text. The new guide keeps version 2 drafts separately. When you open a lesson or chapter with a saved version 1 draft, choose **Download previous v1 draft** to recover its original text.

## Rendering an existing score in 6.0

- For a measured v1 score, use `parseScore(source, { language: 1 })`. To use the original fixed-layout Artist, construct `new VexTab(artist, { language: 1 })`.
- For new scores, `parseScore(source)` and `new VexTab().parse(source)` return a checked v2 score. Pass it to `renderScore`, `renderScorePart` or the player.
- Tablature hides stems by default, both on its own and beside standard notation. To draw stems and beams on tab, add `tabStems on` to the guitar part or an individual voice. The notes keep their written durations in either setting.
