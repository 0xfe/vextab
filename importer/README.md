# VexTab file importers

Install `vextab@7` to use these entries. Existing `vextab-import` users can switch package paths and keep their converter calls.

Convert measured MusicXML, compressed MXL or static LilyPond into editable VexTab grammar v2. Import the entry for the format you use. Each entry runs in Node 22.18+ and modern browser workers. Conversion is independent of the renderer.

~~~js
import { importMusicXML } from 'vextab/import/musicxml';
import { importMXL } from 'vextab/import/mxl';
import { importLilyPond } from 'vextab/import/lilypond';

const xml = importMusicXML(xmlTextOrBytes);
const compressed = await importMXL(new Uint8Array(archiveBytes));
const lily = importLilyPond(String.raw`\relative c' { \time 2/4 <c e g>4 d8 e | f2 | }`);

if (lily.status === 'exact') console.log(lily.documents[0].text);
~~~

Browse the [importer lessons and score gallery](https://vexflow.com/vextab/guide/#importing). To run them from this checkout, use `npm start` in the repository root and open the [local guide](http://127.0.0.1:9005/guide/index.html#importing).

## Compatibility

Read `result.target.minimumVersion` before opening the document. The standard, extended and expressive profiles start at VexTab 6.2.3, 6.3.0 and 6.4.0 respectively. A score that relies on newer grammar or playback reports the version it needs. Per-attack stems, directed ties, note velocities and named beams crossing a barline require VexTab 6.6.0. `capacity: 'large'` also requires the consuming editor or parser to enable that capacity.

The [qualification report](https://github.com/0xfe/vextab/blob/master/issues/212/README.md) lists the tested source editions, historical versions, known losses and package measurements. The [corpus matrix](https://github.com/0xfe/vextab/blob/master/issues/212/coverage.md) reports strict and partial results per score.

## Coverage

| Entry | Measured-score preview |
| --- | --- |
| MusicXML | 4.0 partwise and timewise scores and selected 3.1 files. Accepts decoded text and UTF-8 or UTF-16 bytes. Reads persistent divisions, keys and meter, partial backups and forwards, written and elapsed rhythm, chords, rests, pickups, tuplets and basic ties. |
| MXL | Accepts archive bytes and imports the first declared score from the container manifest. Stored and deflated members are supported, with a default 1 MiB XML limit. An explicit selection or the extended target admits up to 8 MiB of score XML. The async entry uses the platform inflater. |
| LilyPond | Resolves static variables and virtual includes, simultaneous voices, named piano staves, absolute, relative and fixed pitch, inherited duration, pickups, tuplets and bounded repeats. Use `score` to select a zero-based score index or a `'print'` or `'midi'` score. Supply include text as `includes: { 'theme.ly': source }`. |
| Output | Independent voices, chord heads, staff assignment, barline key and meter changes, and supported repeat forms. The default output targets VexTab 6.2.3. The extended profile targets 6.3.0. |

**Strict conversion is the default.** A known loss fails strict conversion. With `{ mode: 'partial' }`, the reader may return editable music together with a warning at each known loss. Unknown music with unresolved timing fails in both modes. Check `result.diagnostics` before presenting partial output to a musician.

Each result identifies the minimum target version. Each document lists the written measure labels and voice IDs for its imported staves. Pass `filename` for diagnostic labels and `sourceMap: true` to map generated tokens back to half-open UTF-16 offsets in the decoded source. Gaps reconstructed by the writer have no source token.

## Import a movement or a part

The full OpenScore Haydn archive contains four movements and restarts its printed measure numbers. Select the second movement by its **one-based, inclusive positions** in each source part. Add `parts: ['P4']` to select only the cello. LilyPond selects a score block with the separate `score` option.

~~~js
const result = await importMXL(archiveBytes, {
  filename: 'haydn.mxl',
  targetProfile: 'extended',
  capacity: 'large',
  mode: 'partial',
  selection: { firstMeasure: 129, lastMeasure: 237 },
});
~~~

The extended profile emits supported timed clefs, keys, tempo, instrument transposition, and brace or bracket groups. Inspect the diagnostics for omitted material. The host must support the declared target version and explicitly enable large capacity. For example, a VexTab 6.3.0 host can call `parseScore(result.documents[0].text, {capacity: 'large'})` after checking the result. A host mounting an editor can pass `{capacity: 'large'}` to `Div` or set `data-capacity="large"` on the element.

The repertoire checks cover the complete 109-bar Haydn second movement and selected Joplin print and MIDI passages. The upstream regression suites also exercise source constructs that produce located diagnostics. [Whole-movement and exporter checks](../issues/210/README.md) · [LilyPond native and upstream comparisons](../issues/209/README.md) · [MusicXML feature fixtures](../issues/208/README.md) · [Roadmap](../doc/importer.md)

## Build and verify

From the repository root run `npm ci --prefix importer` and `npm test --prefix importer`. Run `npm pack` in the repository root to build the installable tarball. The package contains the typed format entries and bundled-code notices. Once the root development build is available, `node issues/207/consumer.mjs` installs that tarball into a fresh project and checks the public exports in Node and Chrome workers.

## Expressive imports

Pass `targetProfile: 'expressive'` for a VexTab 6.4.0 host. This profile includes timed staff changes and adds individual chord-head ties and releases, numbered slurs and hairpins, explicit beams, vocal syllables, harmony, grace groups and instrument-specific notation. A melody can carry lyrics and a chord symbol at the same onset. A drum head carries a kit identity and a MIDI key. A guitar head retains its physical string and fret as well as its written pitch.

~~~js
const result = importMusicXML(xml, { targetProfile: 'expressive', mode: 'partial' });
if (result.status !== 'failed') {
  const editableScore = result.documents[0].text;
  // Present result.diagnostics alongside the score when the status is partial.
}
~~~

For a LilyPond guitar edition on a conventional staff, request `guitar: true` to produce paired notation and TAB. Source-assigned strings take precedence. The reader chooses playable positions for the remaining notes. [Repertoire, test cases and known limits](../issues/211/README.md)
