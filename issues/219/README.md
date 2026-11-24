# Importer M6 qualification

The milestone starts from the merge of the importer and the native VexFlow 5.10.1 renderer in `1a05525`. The gallery includes the complete first movement of Beethoven’s Fifth and can switch between an individual instrument and the full score. [Build the local gallery](../212/gallery/README.md)

| Source edition | Verified result |
| --- | --- |
| *Echigo-Jishi* and Haydn’s *Emperor* Quartet I | The third note of the song and the second viola note in the quartet’s third displayed bar retain their source up-stems. In both SVG views each stem rises 34.25 units from the right edge of its head, 11.05 units from the glyph origin. The original fix for automatically beamed notes remains covered as well. |
| Bach, BWV 846, Fugue in C major | Both cross-bar beams and all 53 authored tie directions survive conversion. All four voices still agree with native LilyPond on pitch and time. [Original edition, native observations and counts](../212/complex-lilypond/README.md) |
| Bach, Brandenburg Concerto No. 3, I, violin I | The complete printed part covers 137 bars on six pages and reports zero engraving diagnostics. |
| Schubert, *Gretchen am Spinnrade*, piano | The complete printed part covers 120 bars on ten pages and reports zero engraving diagnostics. |
| Beethoven, Symphony No. 5, I | All 18 parts retain all 502 bars. The source and reparsed VexTab agree on 10,029 pitches, 5,159 visible rests, 10,029 authored stems and 682 explicit velocities. The independent player comparison checks 10,922 principal notes through the repeat and six trills. First oboe prints with 783 noteheads on four pages, including its ten-quarter cadenza under the printed 2/4 meter in bar 268. [MusicXML oracle and remaining conversion losses](../212/complex-musicxml/README.md) |

## Two remaining fugue ties

The merged renderer reported nine curve collisions in the complete printed fugue. Preserving the side of each written tie reduces this to two. The native controls use the installed VexFlow package directly and keep the original pitches, stems and tie directions.

| Written location | Obstacle | Independent control |
| --- | --- | --- |
| Tenor D5, bar 10 | The following soprano F-sharp accidental intersects the tie fitter’s clearance area. | Replacing F-sharp with F-natural clears the diagnostic. |
| Alto G3, bars 23–24 | The lower voice shares the tie’s starting head. The native fitter includes the other voice’s G head as an obstacle. | Moving the bass head to E3 clears the diagnostic. |

Both warnings remain available in the print result. The tests keep the original musical readings and write white-background comparison images under `build/importer-fidelity/`.

## Reproduce

Use the Node version in `.nvmrc`, Python 3 and Chrome, starting from the repository root.

```sh
npm ci
npm ci --prefix importer --ignore-scripts
npm run build-dev
npm test --prefix importer
node issues/219/engraving.mjs
node issues/219/native-ties.mjs
node issues/212/lilypond/check.mjs
node issues/212/complex-musicxml/check.mjs
node issues/212/complex-musicxml/browser.mjs
```

MusicXML downloads are pinned by checksum and live in the build directory. Subsequent oracle runs accept `--offline`. The optional importer and its three format entries remain separate from the host npm package.
