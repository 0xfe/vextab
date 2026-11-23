# M3 · Complete movements and timed staff changes

VexTab 6.3.0 on the `importer` branch can open a complete quartet movement, change a clef or key inside a bar, and preserve the written notes of a transposing part while playing its sounding pitches. The importer emits this syntax when the caller selects `targetProfile: 'extended'`. The default output still targets 6.2.3. [Importer API and selection example](../../importer/README.md) · [Grammar and capacity options](../../docs/grammarv2.md)

## Evidence

| Source | What the test checks |
| --- | --- |
| OpenScore’s CC0 Haydn quartet, exported by MuseScore Studio 4.7.4 | Start with the original four-movement MXL. Select source bars 129–237 inclusive, the complete second movement. An independent Python reader reconstructs exact onsets, durations and head spellings. All 1,990 visible attacks and rests match across four parts and 109 bars. Partial conversion reports 18 omitted grace notes. A separate selection extracts the cello. [Comparison](movement.mjs) · [Source checksum and oracle](movement-oracle.py) |
| Live editor, conductor, player and print | Open all four parts, edit the source, start playback and paginate the first violin. Check the written bar numbers on every printed page. A separate size control checks that only a host opting into large capacity accepts longer input. [Browser check](browser.mjs) · [Capacity tests](capacity.mjs) |
| Transposing clarinet and violin | Reparse the MusicXML, verify the group bracket on screen and in conductor print, and verify its absence in the clarinet edition. Inside the first bar, a bass clef and a sharp signature appear between the written attacks. The clarinet’s written C4 and F♯4 sound as B♭3 and E4. The tempo drops to 60 on beat three. [Score](ensemble.musicxml) |
| MuseScore’s upstream MusicXML suite and a Finale export | Run the pinned exporter files through the importer and public parser. Check musical observations and the source locations of known losses. The historical MuseScore fixtures still identify their original exporter in their metadata. [Manifest and checksums](exporters.json) · [Assertions](exporters.mjs) |
| LilyPond’s upstream suite | Import unchanged source from the pinned 2.26.0 tree. Compare 33 native pitch/rest, onset and duration observations across the nested-tuplet and repeated-chord cases. The standalone cross-staff and reordered-ending cases assert the source token and diagnostic in both strict and partial mode. [Native reference and scope](../209/README.md) · [Upstream runner](lilypond-upstream.mjs) |

The selected Haydn movement imports in partial mode. The complete archive also contains partial chord ties outside the qualified profile. Source selection uses one-based measure positions because printed bar numbers restart between movements. Printed lyrics and TAB positions, other expression marks, and more complex repeat navigation have their own later milestones.

## Reproduce

Use the Node version in `.nvmrc`, Python 3 and Chrome. From the repository root run the following commands. The native recheck also needs GNU LilyPond 2.26.0. The standard CI check uses its recorded observations.

~~~sh
npm ci
npm ci --prefix importer
npm run build-dev
npm test --prefix importer
node issues/210/capacity.mjs
python3 issues/210/fetch-exporters.py
node issues/210/exporters.mjs
node issues/210/lilypond-upstream.mjs
node issues/210/movement.mjs
node issues/210/browser.mjs
~~~

The original Haydn archive and independent comparison run offline. The exporter downloader verifies the digest of each cached file under `build/importer-m3/`. The LilyPond runner can fetch the four pinned sources or read them from `LILYPOND_SOURCE_DIR`. Pass `--native` to repeat the native comparison.

## Timing

Run `node issues/210/timing.mjs` to sample the selected movement in 21 fresh Node processes and 21 Chrome workers. The benchmark times module loading, conversion including decompression, and Node public reparse separately. Input file I/O, process startup and browser navigation are outside those timers. The browser qualification reports editor opening time separately.
