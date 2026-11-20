# VexTab

VexTab is a text language for writing guitar tablature and standard notation. VexTab 5 includes an editable user guide, responsive scores and independent printed parts.

## Play your first score

From a checkout, use the Node.js version in `.nvmrc` and run:

```sh
npm ci
npm start
```

Open the [project index](http://127.0.0.1:9005/) for demos, tests, tools, and downloads. Start with the [15-step VexTab tutorial](http://127.0.0.1:9005/guide/) or open [Your first fret](http://127.0.0.1:9005/guide/#lesson/first-fret). Press **Play** at the bottom center of the score, change a fret, switch to tab and select the note from the keyboard. Explore [eight editable studies](http://127.0.0.1:9005/guide/#studies) or [search the API and notation reference](http://127.0.0.1:9005/guide/#reference).

The current checkout adds per-string pre-bends, stave and note colours, and SoundFont playback to the 5.0.0 release. Try them in [Features](http://127.0.0.1:9005/guide/#features). For your own instrument or toolbar, see [Playback plugins](docs/playback.md).

## Embed an editable score

The [developer quickstart](http://127.0.0.1:9005/guide/#quickstart) covers installing VexTab, embedding it in an application and configuring playback.

Build the development bundles with `npm run build-dev`. Put this HTML beside `dist/div.dev.js` and open it in a browser. The script includes VexFlow and the engraving fonts.

```html
<!doctype html>
<meta charset="utf-8">
<div class="vextab-auto" layout="flow" editor="true">options tab-stems=true player=true
tabstave notation=true time=4/4
notes :q 0-2-3-2/1 |</div>
<script src="./div.dev.js"></script>
```

See the [user guide and integration reference](docs/vt5-m4.md) for typed imports, keyboard controls, print, and migration from fixed layout. The [developer guide](docs/developers.md) covers testing and releases. [GitHub Release downloads](https://github.com/0xfe/vextab/releases) · [Security and score limits](SECURITY.md) · [Historical tutorial](doc/tutorial.html)

## License

VexTab is free for non-commercial use. Contact Mohit Muthanna Cheppudira about commercial use. [License](LICENSE)
