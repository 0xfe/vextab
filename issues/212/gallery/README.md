# Local importer gallery

Open an edition to read, play or edit the imported VexTab. Each page offers the original input and the converted document for download. Use the view menu on ensemble pages to switch instruments. Beethoven opens on the first oboe, which carries the cadenza in bar 268. The Haydn pages use separate movement selections from the same complete archive. Import notes below each score list the markings the conversion changed or omitted.

From the repository root, use the Node version in `.nvmrc`, Python 3 and Chrome.

```sh
npm ci
npm ci --prefix importer --ignore-scripts
npm run build-dev
npm run build
npm --prefix importer run build
node issues/212/musicxml-full.mjs --held-out
node issues/212/complex-musicxml/check.mjs
node issues/212/lilypond/check.mjs
node issues/212/gallery/build.mjs --previews
python3 -m http.server 8765 --bind 127.0.0.1 --directory build/importer-m5/works
```

Visit [the local gallery](http://127.0.0.1:8765/). Omit `--previews` to generate the gallery without Chrome or thumbnails. The first qualification run downloads and verifies the additional MusicXML sources. Generated scores, downloaded archives and screenshots stay in `build/`.

The verification reports cover the exact editions, the musical events checked and the known engraving differences. [Complete orchestral and piano MusicXML](../complex-musicxml/README.md) · [Four-voice LilyPond fugue](../complex-lilypond/README.md)
