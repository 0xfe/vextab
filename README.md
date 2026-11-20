# VexTab

VexTab is a text language for writing guitar tablature and standard notation. VexTab 6 includes an editable user guide, responsive scores and independent printed parts.

## Write your first score

Open [Your first notes](https://vexflow.com/vextab/guide/#tutorial) or edit this phrase in the [playground](https://vexflow.com/vextab/guide/#playground/first-fret). The frets share the first string and each gets a quarter note.

```vextab
guitar { 0-2-3-2/1 | }
```

VexTab 6 reads **grammar v2** by default. Guitar, staff, piano and drum parts use blocks. Each voice can have its own rhythm. Use aliases for repeated markings and named patterns for repeated phrases. [Language reference](https://vexflow.com/vextab/guide/#reference/grammar-v2) · [Interactive guide](https://vexflow.com/vextab/guide/) · [6.0 release notes](https://github.com/0xfe/vextab/releases/tag/6.0.0)

## Open an existing score

VexTab 5 was an experimental release and used grammar v1 by default. VexTab 6 can still read that grammar. Set `data-language="1"` on an HTML embed, or call `parseScore(source, { language: 1 })` in JavaScript. For the original fixed-layout Artist, use `new VexTab(artist, { language: 1 })`.

To convert a score with VexTab 6 installed, run `npx vextab-migrate old.vextab > new.vextab`. [Migration guide](docs/migrate-scores.md)

## Run locally

Use the Node.js version in `.nvmrc`, then run `npm ci` and `npm start`. Open the [local project index](http://127.0.0.1:9005/) for the guide, demos, tests, tools and downloads.

## Embed an editable score

The [developer quickstart](https://vexflow.com/vextab/guide/#quickstart) covers installing VexTab, embedding it in an application and configuring playback.

Download [div.prod.js](https://github.com/0xfe/vextab/releases/download/6.0.0/div.prod.js), save this HTML beside it and open it in a browser. The script includes VexFlow and the engraving fonts.

```html
<!doctype html>
<meta charset="utf-8">
<div class="vextab-auto" editor="true">play { tempo 96 }
meter 4/4
guitar { :q 0/1 2/1 3/1 2/1 | }</div>
<script src="./div.prod.js"></script>
```

See the [interactive guide](https://vexflow.com/vextab/guide/) and [integration reference](https://vexflow.com/vextab/guide/#reference) for typed imports, keyboard controls, print, and migration from fixed layout. The [developer guide](docs/developers.md) covers testing and releases. [Engineering reports](https://vexflow.com/vextab/reports/) track code quality and illustrate changes since VexTab 4.0.0. [GitHub Release downloads](https://github.com/0xfe/vextab/releases) · [Security and score limits](SECURITY.md) · [Illustrated change report](https://vexflow.com/vextab/reports/ai2026/)

## License

VexTab is free for non-commercial use. Contact Mohit Muthanna Cheppudira about commercial use. [License](LICENSE)
