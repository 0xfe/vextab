# Importer qualification corpus

Each row is one named input and selection on the expressive target. Both columns show actual conversion status. Every emitted document must reparse. The outcome counts use partial mode. A case explicitly outside the static-language profile counts only in the last column. Each score counts once per listed feature, so feature rows overlap. A partial result can preserve the feature under study while reporting a loss elsewhere in that score. Versions are declarations from the decoded source when available.

| Cases | Exact | Partial | Failed | Out of profile |
| --- | ---: | ---: | ---: | ---: |
| All cases | 15 | 25 | 7 | 1 |
| Voices and time | 3 | 11 | 0 | 0 |
| Spelled pitch | 3 | 1 | 0 | 0 |
| Chords and tuplets | 3 | 3 | 1 | 0 |
| MXL | 2 | 4 | 2 | 0 |
| Staff changes | 2 | 1 | 0 | 0 |
| Repeats and endings | 1 | 9 | 2 | 0 |
| Lyrics and expression | 2 | 6 | 1 | 0 |
| Percussion | 1 | 0 | 1 | 0 |
| Guitar and TAB | 1 | 5 | 2 | 0 |
| Procedural music | 0 | 0 | 0 | 1 |

| Score or fixture | Source | Strict | Partial mode | Features under test |
| --- | --- | --- | --- | --- |
| voices.ly | LilyPond | exact | exact | Voices and time, Spelled pitch |
| measured.ly | LilyPond 2.26.0 | exact | exact | Chords and tuplets |
| voices.musicxml | MusicXML 4.0 | exact | exact | Voices and time, Spelled pitch |
| measured.musicxml | MusicXML 4.0 | exact | exact | Chords and tuplets |
| backup.musicxml | MusicXML 4.0 | failed | partial | Voices and time |
| divisions.musicxml | MusicXML 4.0 | failed | partial | Voices and time |
| hidden.musicxml | MusicXML 3.1 | failed | partial | Voices and time |
| 21c-Chords-ThreeNotesDuration.musicxml | MusicXML 4.0 | failed | partial | Chords and tuplets |
| 46e-PickupMeasure-SecondVoiceStartsLater.musicxml | MusicXML 4.0 | failed | partial | Voices and time |
| stored.mxl | MXL | exact | exact | MXL |
| deflated.mxl | MXL | exact | exact | MXL |
| relative.ly | LilyPond 2.26.0 | exact | exact | Spelled pitch |
| context.ly | LilyPond 2.26.0 | exact | exact | Staff changes |
| parallel.ly | LilyPond 2.24.4 | exact | exact | Voices and time |
| endings.ly | LilyPond 2.26.0 | exact | exact | Repeats and endings |
| song.musicxml | MusicXML 4.0 | exact | exact | Lyrics and expression |
| keyboard.musicxml | MusicXML 4.0 | exact | exact | Staff changes, Lyrics and expression |
| kit.musicxml | MusicXML 4.0 | exact | exact | Percussion |
| guitar.musicxml | MusicXML 4.0 | exact | exact | Guitar and TAB |
| 33g-Slur-ChordedNotes.musicxml | MusicXML 4.0 | failed | partial | Chords and tuplets, Lyrics and expression |
| 61j-Lyrics-Elisions.musicxml | MusicXML 4.0 | failed | partial | Lyrics and expression |
| 71c-ChordsFrets.musicxml | MusicXML 4.0 | failed | partial | Guitar and TAB |
| 71e-TabStaves.musicxml | MusicXML 4.0 | failed | failed | Guitar and TAB |
| 73a-Percussion.musicxml | MusicXML 4.0 | failed | failed | Percussion |
| testChangeTranspose.xml | MusicXML 4.0 | failed | partial | Staff changes, Spelled pitch |
| testTuplets1.xml | MusicXML 4.0 | failed | partial | Chords and tuplets |
| testIncompleteTuplet.xml | MusicXML 4.0 | failed | failed | Chords and tuplets |
| testLyricsVoice2a.xml | MusicXML 4.0 | failed | partial | Lyrics and expression |
| testTablature1.xml | MusicXML 4.0 | failed | failed | Guitar and TAB |
| Beach, soprano bars 1–6 | MusicXML 3.1 | failed | partial | Lyrics and expression |
| Haydn, movement II | MXL | failed | partial | MXL, Voices and time, Lyrics and expression |
| Haydn, all four movements | MXL | failed | failed | MXL, Repeats and endings |
| chord-mode.ly | LilyPond 2.26.0 | exact | exact | Chords and tuplets |
| Joplin, first strain | LilyPond 2.14.2 | failed | partial | Voices and time, Repeats and endings |
| Sor Op. 35 No. 22, print | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Repeats and endings |
| Sor Op. 35 No. 22, midi | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Repeats and endings |
| Bach BWV 999, print | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Voices and time |
| Bach BWV 999, midi | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Voices and time |
| Joplin, complete Maple Leaf Rag, print | LilyPond 2.14.2 | failed | partial | Voices and time, Repeats and endings |
| Joplin, complete Maple Leaf Rag, midi | LilyPond 2.14.2 | failed | partial | Voices and time, Repeats and endings |
| Haydn, movement I | MXL | failed | partial | MXL, Repeats and endings |
| 45a-SimpleRepeat.musicxml | MusicXML 4.0 | failed | partial | Repeats and endings |
| 45b-RepeatWithAlternatives.musicxml | MusicXML 4.0 | failed | partial | Repeats and endings |
| 45d-Repeats-MultipleEndings.musicxml | MusicXML 4.0 | failed | failed | Repeats and endings |
| Echigo-Jishi, complete song | MXL | failed | partial | MXL, Lyrics and expression |
| Bach BWV 269, complete chorale | MXL | failed | partial | MXL, Voices and time, Repeats and endings |
| Schumann, Dichterliebe No. 1 | MXL | failed | failed | MXL, Lyrics and expression |
| Computed LilyPond music | LilyPond 2.26.0 | failed | failed | Procedural music |
