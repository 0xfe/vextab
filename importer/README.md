# vextab-import

Convert measured MusicXML, compressed MXL or static LilyPond into editable VexTab grammar v2. Import the entry for the format you use. Each entry runs in Node 22.18+ and modern browser workers. Conversion is independent of the renderer.

~~~js
import { importMusicXML } from 'vextab-import/musicxml';
import { importMXL } from 'vextab-import/mxl';
import { importLilyPond } from 'vextab-import/lilypond';

const xml = importMusicXML(xmlTextOrBytes);
const compressed = await importMXL(new Uint8Array(archiveBytes));
const lily = importLilyPond(String.raw`\relative c' { \time 2/4 <c e g>4 d8 e | f2 | }`);

if (lily.status === 'exact') console.log(lily.documents[0].text);
~~~

## Coverage

| Entry | Measured-score preview |
| --- | --- |
| MusicXML | 4.0 partwise and timewise scores and selected 3.1 files. Accepts decoded text and UTF-8 or UTF-16 bytes. Reads persistent divisions, keys and meter, partial backups and forwards, written and elapsed rhythm, chords, rests, pickups, tuplets and basic ties. |
| MXL | Accepts archive bytes and imports the first declared score from the container manifest. Stored and deflated members are supported, with a 1 MiB selected-score limit. The async entry uses the platform inflater. |
| LilyPond | Resolves static variables and virtual includes, simultaneous voices, named piano staves, absolute, relative and fixed pitch, inherited duration, pickups, tuplets and bounded repeats. Use `score` to select a zero-based score index or a `'print'` or `'midi'` score. Supply include text as `includes: { 'theme.ly': source }`. |
| Output | Independent voices, chord heads, staff assignment, barline key and meter changes, and supported repeat forms. Score size follows the VexTab 6.2.3 default compiler profile. |

**Strict conversion is the default.** A known loss fails strict conversion. With `{ mode: 'partial' }`, the reader may return editable music together with a warning at each known loss. Unknown music with unresolved timing fails in both modes. Check `result.diagnostics` before presenting partial output to a musician.

Each result identifies the minimum target version. Each document lists the written measure labels and voice IDs for its imported staves. Pass `filename` for diagnostic labels and `sourceMap: true` to map generated tokens back to half-open UTF-16 offsets in the decoded source. Gaps reconstructed by the writer have no source token.

The repertoire qualification covers a 42-measure Haydn quartet excerpt and the pickup and opening two bars of a Joplin piano score. Whole-work capacity and timed clef changes belong to M3. The issue notes detail the imported features, source editions and known losses. [MusicXML fixtures and Haydn comparison](../issues/208/README.md) · [LilyPond fixtures and native comparison](../issues/209/README.md) · [Roadmap](../doc/importer.md)

## Build and verify

From the repository root run `npm ci --prefix importer` and `npm test --prefix importer`. Run `npm pack` inside `importer/` to build the installable tarball. The package contains the typed format entries and bundled-code notices. Once the root development build is available, `node issues/207/consumer.mjs` installs that tarball into a fresh project and checks the public exports in Node and Chrome workers.
