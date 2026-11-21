# M2 · A conductor score and four extracted parts

`renderConductor` composes all instruments on one native VexFlow sheet. A score may contain single staves, grand staves and paired guitar notation/TAB. Authored parts and staves can carry stable IDs, display names and written-to-sounding intervals. Screen, print, reading and playback retain the same source event. [Public API and grammar](../../docs/grammarv2.md#conductor-scores-and-named-parts) · [Screenshots and issue](https://github.com/0xfe/vextab/issues/197)

## Haydn’s theme

The editable example contains the pickup through bar 20 of Joseph Haydn’s *String Quartet in C major*, Op. 76 No. 3, Hob. III:77, movement II, *Poco adagio, cantabile*. It uses OpenScore’s CC0 transcription 20428156. The principal theme is in G major and cut time. In the VexTab reader the pickup is measure 1, so printed source bar 20 is reader measure 21. [VexTab score](../../guide/scores/haydn-emperor-theme.vextab) · [OpenScore edition files](https://github.com/OpenScore/StringQuartets/tree/2614b0b2958dd1ce3f52e172a43e5f4d0e29570f/scores/Haydn%2C_Joseph/String_Quartet_in_C_major%2C_Hob.III77%2C_Op.76_No.3) · [Catalogue and individual parts](https://fourscoreandmore.org/openscore/stringquartets/)

The score retains pitches, durations, rests, chords, principal-note slurs, staccatos, fermatas, key, clefs, pickup, final partial measure and the edition’s playback tempo. Grace notes, ornamental turns, dynamics and expressive text await the repertoire work. A slur starting on an omitted grace begins on the following measured note. Only the source edition’s first voice carries measured music here. Its auxiliary violin voice positions ornamental turns.

| Written part | Measured attacks and rests | Clef |
| --- | ---: | --- |
| Violin I | 94 | Treble |
| Violin II | 78 | Treble |
| Viola | 76 | Alto |
| Violoncello | 69 | Bass |

The edition check compares each chord’s ordered pitches and each exact duration against MusicXML, bar by bar. Rests are timed events. The first violin’s sustained final G and the cello’s G two octaves below it share the final half bar.

## What the tests measure

- At 800 px the quartet occupies five shared systems. At 360 px it occupies twenty. Every staff’s right barline and each simultaneous attack agree within 0.01 SVG units. Restoring 800 px restores the initial row map.
- All 317 reading events keep their authored IDs. Each independently paginated part contains its own events in source order. The same note resolves to the same character range from the conductor, extracted screen or printed page.
- The four-bar M0 melody and bass keep four independent melody systems and one bass system at 360 px. Their conductor view has four paired systems. Resizing a live editor preserves the current source revision and its selectable bass notes.
- A grand staff and a paired guitar use native brace and bracket groups in one composition. A guitar displayed twice produces one sounding attack. A B-flat clarinet’s written D4 sounds concert C4 under both player selections.
- Unequal measure spans identify the conflicting source meter or barline before changing the host. The two independent parts in the 3/4 versus 2/4 example both play for six beats and print with their own bar counts. [Regression cases](../../tests/conductor.ts)

## Reproduce

From the repository root, use the pinned Node version and an installed Chrome. The optional edition check downloads the pinned MusicXML archive, or accepts its local path.

```sh
npm ci
npm test
python3 issues/197/check-edition.py
node issues/197/inspect.mjs
```

The inspection command writes the row maps, right barlines and four white-background screenshots to `build/vt6-m2/`. Chrome 157.0.8103.79 produced the measurements above with the bundled Bravura and Academico fonts at device scale 1.
