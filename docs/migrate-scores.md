# Convert a score to grammar v2

From the grammar development checkout, run `npm ci` and `npm run build-dev`. The converter reads one VexTab score from a file or standard input and writes a preview to standard output.

```sh
node scripts/migrate-score.mjs old.vextab
node scripts/migrate-score.mjs old.vextab > song-v2.vextab
```

A packed installation provides the same command as `npx vextab-migrate old.vextab`. Use a different output filename to keep the original. Open the result in the [playground](http://127.0.0.1:9005/guide/#playground/first-fret) and compare its notes, playback and print layout.

The converter uses the historical measured parser to resolve shorthand, timing, instrument, chord heads and ties. It emits checked v2. A fixed-layout-only instruction, ambiguous tuning or unsupported setting produces a source location for manual review. For example, choose the four open pitches for a blank four-string instrument. A legacy bend or annotation may need an explicit head or text lane. See the [15-step tutorial](../doc/tutorial.html) and [feature examples](../guide/features.html) for the replacement notation.

Use `{ language: 2 }` for a parser call or `data-language="2"` on an embed when copying a score out of this preview. Guide downloads contain the editable score text. The new guide keeps version 2 drafts separately. When you open a lesson or chapter with a saved version 1 draft, choose **Download previous v1 draft** to recover its original text.
