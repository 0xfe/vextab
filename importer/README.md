# vextab-import

Convert a measured MusicXML or LilyPond passage into editable VexTab grammar v2. The M1 preview reads one complete measure on one concert-pitch staff, with one or two voices. Each format is a separate module that runs in Node 22.18+ or a browser worker.

~~~js
import { importLilyPond } from 'vextab-import/lilypond';

const result = importLilyPond(String.raw`{ \key g \major \time 2/4 fis'4 f' }`);
if (result.status === 'exact') console.log(result.documents[0].text);
~~~

Use `importMusicXML` from `vextab-import/musicxml` for a decoded XML string or UTF-8 bytes. Both functions accept `{ filename, mode, sourceMap }`. The result names the minimum compatible VexTab version (6.2.3). Source and diagnostic ranges are half-open UTF-16 offsets in the decoded input. Each document lists the source voice IDs and their generated names in first-appearance order. Event mappings cover explicit notes, rests and skips. Gaps reconstructed from a MusicXML backup carry no source token.

| Input | M1 coverage |
| --- | --- |
| MusicXML 4.0 / 3.1 partwise | Matching part definition and ID, part name, one measure, opening integer divisions, simple meter, major key, treble clef, note/rest, independent voice IDs and partial backups. |
| LilyPond | A single brace expression or `\new Staff { … }`, optional 2.24.x/2.26.x declaration, Dutch absolute pitches, major key and simple meter. Two simultaneous voice blocks use an explicit voice separator and an explicit first duration in the second block. |
| Rhythm and pitch | Undotted whole through 256th notes, inherited LilyPond durations, visible rests, silent gaps, single/double alterations. The two voices share a complete measure. |

Strict mode is the default. Unsupported music or an incomplete measure returns `failed` and an empty document list. With `mode: 'partial'`, a recognized staccato mark can be omitted with a warning and the event’s timing retained. Both modes fail on an unknown expression whose timing or meaning cannot be determined. MXL archives, multiple measures, chords, tuplets, relative LilyPond pitches, includes and transposing instruments belong to subsequent milestones.

From the repository root, run `npm ci --prefix importer` and `npm test --prefix importer`. Run `npm pack` inside the package to build a local tarball. The package builds its own typed, self-contained entry points and includes the notices for bundled code. VexTab uses the importer only in integration tests.
