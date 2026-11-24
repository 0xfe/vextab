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

| Score or fixture | Source | Strict | Partial mode | Features under test | Warnings or failure in partial mode |
| --- | --- | --- | --- | --- | --- |
| voices.ly | LilyPond | exact | exact | Voices and time, Spelled pitch | 0 |
| measured.ly | LilyPond 2.26.0 | exact | exact | Chords and tuplets | 0 |
| voices.musicxml | MusicXML 4.0 | exact | exact | Voices and time, Spelled pitch | 0 |
| measured.musicxml | MusicXML 4.0 | exact | exact | Chords and tuplets | 0 |
| backup.musicxml | MusicXML 4.0 | failed | partial | Voices and time | 2 |
| divisions.musicxml | MusicXML 4.0 | failed | partial | Voices and time | 3 |
| hidden.musicxml | MusicXML 3.1 | failed | partial | Voices and time | 9 |
| 21c-Chords-ThreeNotesDuration.musicxml | MusicXML 4.0 | failed | partial | Chords and tuplets | 1 |
| 46e-PickupMeasure-SecondVoiceStartsLater.musicxml | MusicXML 4.0 | failed | partial | Voices and time | 1 |
| stored.mxl | MXL 4.0 | exact | exact | MXL | 0 |
| deflated.mxl | MXL 4.0 | exact | exact | MXL | 0 |
| relative.ly | LilyPond 2.26.0 | exact | exact | Spelled pitch | 0 |
| context.ly | LilyPond 2.26.0 | exact | exact | Staff changes | 0 |
| parallel.ly | LilyPond 2.24.4 | exact | exact | Voices and time | 0 |
| endings.ly | LilyPond 2.26.0 | exact | exact | Repeats and endings | 0 |
| song.musicxml | MusicXML 4.0 | exact | exact | Lyrics and expression | 0 |
| keyboard.musicxml | MusicXML 4.0 | exact | exact | Staff changes, Lyrics and expression | 0 |
| kit.musicxml | MusicXML 4.0 | exact | exact | Percussion | 0 |
| guitar.musicxml | MusicXML 4.0 | exact | exact | Guitar and TAB | 0 |
| 33g-Slur-ChordedNotes.musicxml | MusicXML 4.0 | failed | partial | Chords and tuplets, Lyrics and expression | 6 |
| 61j-Lyrics-Elisions.musicxml | MusicXML 4.0 | failed | partial | Lyrics and expression | 8 |
| 71c-ChordsFrets.musicxml | MusicXML 4.0 | failed | partial | Guitar and TAB | 5 |
| 71e-TabStaves.musicxml | MusicXML 4.0 | failed | failed | Guitar and TAB | Bar 1. Two simultaneous heads occupy one physical string. |
| 73a-Percussion.musicxml | MusicXML 4.0 | failed | failed | Percussion | Bar 1. Unpitched hit requires a named instrument with a declared midi-unpitched key. |
| testChangeTranspose.xml | MusicXML 4.0 | failed | partial | Staff changes, Spelled pitch | 17 |
| testTuplets1.xml | MusicXML 4.0 | failed | partial | Chords and tuplets | 61 |
| testIncompleteTuplet.xml | MusicXML 4.0 | failed | failed | Chords and tuplets | Bar 2. Written value disagrees with elapsed MusicXML duration. |
| testLyricsVoice2a.xml | MusicXML 4.0 | failed | partial | Lyrics and expression | 19 |
| testTablature1.xml | MusicXML 4.0 | failed | failed | Guitar and TAB | Bar 1. String, fret, tuning and capo disagree with the declared sounding pitch. |
| Beach, soprano bars 1–6 | MusicXML 3.1 | failed | partial | Lyrics and expression | 148 |
| Haydn, movement II | MXL 4.0 | failed | partial | MXL, Voices and time, Lyrics and expression | 7277 |
| Haydn, all four movements | MXL 4.0 | failed | failed | MXL, Repeats and endings | Bar 56. Sound navigation changes the performed measure sequence. |
| chord-mode.ly | LilyPond 2.26.0 | exact | exact | Chords and tuplets | 0 |
| Joplin, first strain | LilyPond 2.14.2 | failed | partial | Voices and time, Repeats and endings | 6 |
| Sor Op. 35 No. 22, print | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Repeats and endings | 61 |
| Sor Op. 35 No. 22, midi | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Repeats and endings | 59 |
| Bach BWV 999, print | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Voices and time | 4 |
| Bach BWV 999, midi | LilyPond 2.16.1 | failed | partial | Guitar and TAB, Voices and time | 4 |
| Joplin, complete Maple Leaf Rag, print | LilyPond 2.14.2 | failed | partial | Voices and time, Repeats and endings | 17 |
| Joplin, complete Maple Leaf Rag, midi | LilyPond 2.14.2 | failed | partial | Voices and time, Repeats and endings | 18 |
| Haydn, movement I | MXL 4.0 | failed | partial | MXL, Repeats and endings | 14678 |
| 45a-SimpleRepeat.musicxml | MusicXML 4.0 | failed | partial | Repeats and endings | 3 |
| 45b-RepeatWithAlternatives.musicxml | MusicXML 4.0 | failed | partial | Repeats and endings | 4 |
| 45d-Repeats-MultipleEndings.musicxml | MusicXML 4.0 | failed | failed | Repeats and endings | Bar 6. Expected one consecutive pass number per MusicXML ending. |
| Echigo-Jishi, complete song | MXL 4.0 | failed | partial | MXL, Lyrics and expression | 568 |
| Bach BWV 269, complete chorale | MXL 3.0 | failed | partial | MXL, Voices and time, Repeats and endings | 642 |
| Schumann, Dichterliebe No. 1 | MXL 4.0 | failed | failed | MXL, Lyrics and expression | Bar 26. Written value disagrees with elapsed MusicXML duration. |
| Computed LilyPond music | LilyPond 2.26.0 | failed | failed | Procedural music | Bar 1. Computed Scheme music is outside the static LilyPond profile. |
