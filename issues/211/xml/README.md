# MusicXML expressive fixtures

The five unchanged MusicXML 4.0 files in this directory come from the unofficial MusicXML test suite, an MIT-licensed fork of the LilyPond regression corpus. [Pinned upstream revision](https://github.com/w3c-cg/musicxmlTestSuite/tree/0618bdee1bfcb965ffdd9f4e52271c909d744fd1/xmlFiles) · [License](LICENSE) · [SHA-256 file digests](SHA256SUMS)

| Source | Checked observation |
| --- | --- |
| 33g, chorded slurs | The two slurs cross. They join attacks 1–3 above and 2–4 below. |
| 61j, elisions | The two-syllable elision retains its text. The three-syllable elision retains every word and reports the flattened second connector and formatting. |
| 71c, fret diagrams | Eight single A4 melody notes retain their pitches. A separate six-string C chord diagram starts at the first attack. The second chord adds a sharp eleventh. Diagram ranges outside four frets and string counts outside four to eight produce warnings. |
| 71e, TAB | Part P1 keeps its six open pitches, ten played heads, frets 0–17 and the order and spelling of the three-head chord. |
| 73a, percussion | Part P2 supplies display positions without an instrument playback map. The importer locates the unpitched hit rather than assigning an arbitrary GM key. |

The additional exporter checks use the unchanged MuseScore and Finale files in the [M3 manifest](../../210/exporters.json). MuseScore 0.7.0's voice-2 vocal fixture retains its voice ownership, pitches, onsets and four syllables. Its TAB stress file declares positions incompatible with its pitches and tuning. The reader diagnoses the first inconsistent note. In Finale v25's Amy Beach passage, the soprano retains the opening pianissimo and a two-attack extender under the slur on “prayer,”.

Run the following from the repository root after building the importer and VexTab.

~~~sh
python3 issues/210/fetch-exporters.py
node issues/211/musicxml.mjs
node issues/210/movement.mjs --expressive
npm test --prefix importer
~~~

The movement check compares all 1,990 visible attacks and rests with the independent Python oracle across the 109 bars of Haydn's second movement. Expressive import retains all 18 grace attacks. Slurs that start on a grace note and finish on a measured note cannot keep both anchors in this profile. Partial mode reports each missing endpoint. The unselected four-movement archive reaches unsupported MusicXML repeat endings.

## Profile boundaries

- The expressive profile supports explicit numbered slurs and hairpins, one primary beam per voice, per-head ties and releases, borrowed before/after grace timing, scalar dynamics, plain text, a complete pair of sustain-pedal actions, common articulations, forced signs, and common ornaments. Grace attacks with individual time shares, mixed before/after stealing, or a fixed make-time value require a richer playback model. Secondary beams, feathering, note-specific stem overrides and positioned or styled text require additional engraving controls.
- Lyric numbers identify independent verse lanes. Explicit extender endpoints must remain in the selected voice. The target supports one elision connector per syllable and extenders up to 99 events.
- Root, quality, degree alterations and slash bass are structured harmony. Four-fret guitar diagrams support four to eight strings and one barre. A diagram above an unrelated melody carries no played string assignments.
- Guitar pitches, open-string tuning, capo and physical positions must agree. A string number alone can annotate a pitched voice. Fretted hammer-ons, pull-offs and slides need an adjacent played destination on the same string. Simple positive bends support half-semitone increments. Changes of tuning or capo, pre-bends, release envelopes and incompatible physical positions are diagnosed.
- Unpitched attacks require declared playback keys and a display pitch. Instrument labels, GM keys, staff lines, stem direction and normal, cross, circled-cross and triangle heads are retained. Named hits can use distinct display variants with the same MIDI key. A percussion or TAB view cannot anchor a pitched ornament.
- Direction offsets resolve against the source divisions at that point. A direction needs an event at the specified staff, voice and onset. A closing sustain-pedal action can also coincide with the final note end. Selecting part of an open audible tie or pedal span produces a diagnostic.

The MusicXML mordent with a vertical stroke maps to VexFlow’s `mordentInverted` glyph. Grace time shares refer to their specified previous or following sounding note. [MusicXML mordent](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/mordent/) · [MusicXML grace timing](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/grace/)
