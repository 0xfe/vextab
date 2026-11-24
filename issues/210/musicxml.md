# M3 MusicXML qualification

The extended profile targets VexTab 6.3.0. Select it explicitly for timed clefs, keys, sounding intervals, tempo and staff groups. The default writer still targets 6.2.3. A selection can fit default capacity while using extended notation.

~~~js
import { importMXL } from 'vextab-import/mxl';

const movement = await importMXL(archive, {
  targetProfile: 'extended',
  capacity: 'large',
  mode: 'partial',
  selection: { firstMeasure: 129, lastMeasure: 237 },
});
~~~

Measure ordinals start at one and include both endpoints. The Haydn edition reuses printed measure labels across movements. Add `parts: ['P4']` to select the cello. The reader carries the preceding meter, clef, key, sounding interval and score-wide tempo into the selection. It reads tempos from excluded parts as well. A selection that cuts through a tie, repeat or ending receives a diagnostic. The source archive contains one four-movement score, so no implicit movement selection takes place.

The unselected, default reader limits score XML to 1 MiB. An explicit part or measure selection, or the extended target, permits up to 8 MiB of XML. MXL member checks run before inflation. The XML byte decoder uses bounded chunks and skips note detail outside the selection. Partwise files release each source part's element tree after resolving it. Timewise files collect measure records by part. `capacity: 'large'` raises the target ceilings to 1 MiB of source, 131,072 tokens and 32,768 expanded events. The caller also selects large capacity when opening the result in VexTab.

## Complete movement

The archived OpenScore Haydn Op. 76 No. 3 is CC0. Its MusicXML identification names MuseScore Studio 4.7.4. The complete second movement contains 109 written measures in each of four parts. The offline oracle independently reads the original archive with Python's XML and ZIP libraries. It compares all 1,990 visible attacks and rests across eight voices with the result of the public VexTab parser. Checks cover measure ordinal, exact onset, exact elapsed time, and ordered pitch spellings. The source contains another 26 invisible rests, 24 chord continuations and 18 grace notes. Invisible rests keep their elapsed time. Grace notes receive located omissions. A separate cello import checks the same movement bounds and conductor tempo.

Run `node issues/210/movement.mjs` from the repository root after building the importer and the VexTab parser. The original full archive and its SHA-256 are the same ones used in the [M0 manifest](../206/fixtures.json). The second movement includes the entire theme and all four variations. The complete four-movement source also includes individual chord-head ties outside the current import profile.

## Upstream exporter controls

| Source file | What the check establishes |
| --- | --- |
| MuseScore `testChangeTranspose.xml` | Two clarinets use written C5 and C♯5 with active sounding intervals of −3 and −2 semitones. |
| MuseScore `testTuplets1.xml` | Seven bars include quarter triplets, eighth quintuplets and mixed chord values. Tuplet display details are diagnosed where the target lacks the spelling. |
| MuseScore `testIncompleteTuplet.xml` | Integer source divisions encode durations of 56 and 57 while the first written 9:8 sixteenth requires 512/9 divisions. The importer locates the disagreement at the first note in measure 2, voice 1. |
| MuseScore `testLyricsVoice2a.xml` | All four pitches in the second part's second voice survive. Its four text omissions point to the original lyric elements. |
| MuseScore `testTablature1.xml` | Partial mode emits all six source pitches on a conventional staff and reports loss of TAB display and technical information. |
| Finale `prayer_of_a_tired_child.musicxml` | Six soprano measures from Amy Beach's score compile with their E-flat signature, dotted rhythm and chromatic G-flat. The source identifies Finale v25 for Mac and MusicXML 3.1. |

The five MuseScore regression inputs identify MuseScore 0.7.0 and declare MusicXML 4.0 in the pinned test-suite revision. The files exercise archived regression cases. The modern OpenScore source provides a second MuseScore exporter version. The Finale engraving credits Michael Scott Cuthbert. Fetches verify every SHA-256, including cached copies. Sources and rights are recorded in the [exporter manifest](exporters.json).

~~~sh
python3 issues/210/fetch-exporters.py
node issues/210/exporters.mjs
~~~
