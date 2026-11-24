# VexTab

VexTab is a text language for writing guitar tablature and standard notation. VexTab includes an editable user guide, responsive scores and independent printed parts.

## Write your first score

Open [Your first notes](https://vexflow.com/vextab/guide/#tutorial) or edit this phrase in the [playground](https://vexflow.com/vextab/guide/#playground/first-fret). The frets share the first string and each gets a quarter note.

```vextab
guitar { 0-2-3-2/1 | }
```

VexTab reads **grammar v2** by default. Guitar, staff, piano and drum parts use blocks. Each voice can have its own rhythm. Use aliases for repeated markings and named patterns for repeated phrases. [Language reference](https://vexflow.com/vextab/guide/#reference/grammar-v2) · [Interactive guide](https://vexflow.com/vextab/guide/) · [6.2 release notes](https://github.com/0xfe/vextab/releases/tag/6.2.0)

## Open an existing score

VexTab 5 was an experimental release and used grammar v1 by default. VexTab can still read that grammar. Set `data-language="1"` on an HTML embed, or call `parseScore(source, { language: 1 })` in JavaScript. For the original fixed-layout Artist, use `new VexTab(artist, { language: 1 })`.

To convert a score with VexTab installed, run `npx vextab-migrate old.vextab > new.vextab`. [Migration guide](docs/migrate-scores.md)

## Run locally

Use the Node.js version in `.nvmrc`, then run `npm ci` and `npm start`. Open the [local project index](http://127.0.0.1:9005/) for the guide, demos, tests, tools and downloads.

## Embed an editable score

The [developer quickstart](https://vexflow.com/vextab/guide/#quickstart) covers installing VexTab, embedding it in an application and configuring playback.

In VexTab 7, load the full VexFlow browser build first, then VexTab. These version-pinned jsDelivr scripts work in ordinary HTML. For offline use, download both files and point the tags at your local copies.

```html
<!doctype html>
<meta charset="utf-8">
<div class="vextab-auto" editor="true">play { tempo 96 }
meter 4/4
guitar { :q 0/1 2/1 3/1 2/1 | }</div>
<script defer src="https://cdn.jsdelivr.net/npm/vexflow@5.11.0/build/cjs/vexflow.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/vextab@7.0.0/dist/runtime/vextab.js"></script>
```

Install `vextab@7` in a bundled app and import `Div` from `vextab/browser`, or import `vextab/auto` to mount the markup above. npm installs the matching VexFlow dependency.

The optional `vextab/import/musicxml`, `vextab/import/mxl`, and `vextab/import/lilypond` entries convert MusicXML, compressed MXL and LilyPond into editable VexTab. Run `npm start` to try the [importing lessons](http://127.0.0.1:9005/guide/index.html#importing) and [score gallery](http://127.0.0.1:9005/guide/gallery/index.html). [Package API and compatibility](importer/README.md)

See the [interactive guide](https://vexflow.com/vextab/guide/) and [integration reference](https://vexflow.com/vextab/guide/#reference) for typed imports, keyboard controls, print, and migration from fixed layout. The [developer guide](docs/developers.md) covers testing and releases. Compare engravings and explore new features since VexTab 4.0.0 in [What's New?](https://vexflow.com/vextab/reports/whatsnew/), or inspect a release’s test coverage and bundle sizes in the [quality archive](https://vexflow.com/vextab/reports/). [GitHub Release downloads](https://github.com/0xfe/vextab/releases) · [Security and score limits](SECURITY.md)

## License

VexTab is free for non-commercial use. Contact Mohit Muthanna Cheppudira about commercial use. [License](LICENSE)
