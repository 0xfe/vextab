# VexTab 6.0.0

VexTab 6 makes grammar v2 the default for score files, browser embeds, and the JavaScript API. A four-note guitar phrase fits on one line.

```vextab
guitar { 0-2-3-2/1 | }
```

- Use aliases, comments, named patterns, and finite repeats to organize a score. Set the meter for one staff or change it at a barline.
- Write independent voices, piano grand staffs, guitar notation and tablature, and drum parts. The guide, tutorial, demos, and downloadable scores use the new grammar.
- Tablature hides stems by default. Add `tabStems on` to a guitar part or voice to show its rhythm. VexFlow 5.6.1 fits TAB clefs and time signatures to the actual string count.
- Render the same parsed score on screen or as a printed part. Play it with native Web Audio or supply a SpessaSynth instance through the playback plugin API.

## Upgrading from VexTab 5

Run `npx vextab-migrate old.vextab > new.vextab` with VexTab 6 installed. The converter checks the result and identifies constructs that need manual editing. To keep using an existing v1 score, set `data-language="1"` on its embed or pass `{ language: 1 }` to `parseScore`. Fixed-layout Artist integrations use `new VexTab(artist, { language: 1 })`.

[Migration guide](https://github.com/0xfe/vextab/blob/master/docs/migrate-scores.md) · [Playback plugins](https://github.com/0xfe/vextab/blob/master/docs/playback.md)
