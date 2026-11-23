# M4 · Expressive imports, voices and instruments

An importer targeting VexTab 6.4.0 can preserve a tie on one chord head, place lyrics under their owning voice, draw overlapping slurs and hairpins, and play the written drum or fretted position. Select the `expressive` profile explicitly. The import result reports the minimum host version and a source location for each known loss. [Importer API](../../importer/README.md) · [VexTab grammar](../../docs/grammarv2.md)

## Source and surface checks

| Source | What to look or listen for |
| --- | --- |
| [One-bar vocal score](fixtures/song.musicxml) | C4 sounds once across the first two chords. The other two chord heads attack separately. The slur ends on A4 while the crescendo continues to B4. Both printed and screen views retain the two syllables. |
| [Two-staff piano](fixtures/keyboard.musicxml) | Four eighths alternate between the hands under one beam. One voice owns all four attacks. Playback follows C5, E3, D5 and G3 in order. |
| [Acoustic snare](fixtures/kit.musicxml) | A cross head appears on both surfaces. MusicXML’s one-based unpitched key 39 reaches the player as GM note 38. |
| [Guitar double stop](fixtures/guitar.musicxml) | The capo is on fret two. Both heads occupy fret one relative to the capo, on strings one and two. The playback plugin receives G4 and D4. |
| [Joplin · Maple Leaf Rag](fixtures/joplin-first.ly) | Both endings of the first strain produce 552 attacks. Compare every sounding pitch, onset and release with the published Mutopia MIDI, preserving multiplicity for simultaneous notes. |
| [Sor · Op. 35 No. 22](fixtures/sor-opening.ly) | The first eight bars retain three voices and a bass tie. Compare pitches, onsets and releases with native LilyPond for each voice, then inspect the fingerings, printed edition and guitar TAB. Strings specified in the source edition take precedence over inferred positions. |

The four short MusicXML cases are repository-authored controls. The Joplin and Sor excerpts retain the musical text of the source editions. Five unchanged community MusicXML fixtures exercise crossing slurs, elisions, diagrams, explicit TAB and percussion without a MIDI map. Two historical MuseScore files and a Finale v25 passage cover differences between exporters. [Upstream results and source rights](xml/README.md) · [LilyPond editions, reference generation and mode coverage](LILYPOND.md)

The repertoire test operates on imported VexTab, through the same public parser that hosts use.

## Reproduce

Use the versions in `.nvmrc` and the project lockfiles, and a local Chrome installation. Run the following commands from the repository root.

~~~sh
npm ci
npm ci --prefix importer
npm run build-dev
npm test --prefix importer
python3 issues/210/fetch-exporters.py
node issues/211/musicxml.mjs
node issues/210/movement.mjs --expressive
node issues/211/browser.mjs
node issues/211/check-lily-repertoire.mjs
node issues/211/sor-proof.mjs
node issues/210/timing.mjs --joplin
~~~

`browser.mjs` opens each source with both the extended and expressive profiles, prints the expressive part and checks the notes received by a playback plugin. It writes comparison screenshots under `build/importer-m4/`. With GNU LilyPond 2.26.0 installed, `node issues/211/sor-proof.mjs --native` places the source engraving and the imported notation and TAB on one sheet.

## Scope

Named slurs, beams and hairpins pair within a logical voice. A piano voice can cross between staves. A chord head can release before its neighbors while another remains tied into the next event. Distinct written rhythms use separate voices. A grace group can borrow an explicit fraction of its principal’s elapsed time. MusicXML make-time grace notes and indefinite holds need a different time model.

A drum needs a recognizable kit entry or an explicit MIDI assignment. Fretted MusicXML needs enough information to check the physical position against the sounding pitch. Partial mode preserves the music around a supported omission and reports it. Unresolved pitch or timing can still prevent conversion.

In the Sor comparison, the opening bass B carries into the second bar under a moving eighth-note voice. The paired VexTab view shows the written fingerings and generated fret numbers. Its line breaks and automatic stems differ from the source engraving, and both staves of the paired view display the opening Allegretto heading. [Glen Larsen’s source edition after N. Simrock](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1850)

## Size and speed

The package has independent MusicXML, MXL and LilyPond entry points. Each bundles only its own reader and the shared text writer. The package test enforces a 96 KiB tarball limit and gzip limits of 32 KiB for MusicXML, 40 KiB for MXL and 24 KiB for LilyPond. Fixtures, reference tools, Chrome and VexFlow belong to the test project and stay outside the importer package.

On an Apple M3 with Node 26.13.1 and Chrome 158.0.8127.37, the complete Joplin first strain converted in 5.8 ms at p95 in Node and 4.8 ms in a Chrome worker. The public Node reparse took 3.4 ms at p95. These measurements use 21 fresh processes or worker realms and exclude input I/O. The separate Haydn benchmark starts with the original four-movement MXL and selects the second movement. [M0 budgets](../206/README.md)

The alpha tarball is 88,616 bytes packed and 261,918 bytes installed. On the same runner, expressive MXL conversion took 84.14 ms at p95 in Node and 76.70 ms in a Chrome worker. Node public reparse took 13.13 ms at p95. Node peak RSS growth through reparse was 39.45 MiB at p95.

**Chrome worker memory remains above the release target.** One conversion grew renderer RSS by 33.14 MiB. The same worker doing 21 consecutive conversions grew by 173.52 MiB on the combined branch. Seven isolated runs measured 165.02–166.06 MiB. The budget is 128 MiB. The browser reader streams inflated chunks directly into SAX, releases completed partwise measures, and verifies length and checksum before returning a document. The sustained-worker gate and its reproduction steps are tracked under M5. [Memory qualification issue](https://github.com/0xfe/vextab/issues/214)

~~~sh
node issues/210/timing.mjs --expressive
node issues/210/memory.mjs --expressive --once
node issues/210/memory.mjs --expressive
~~~
