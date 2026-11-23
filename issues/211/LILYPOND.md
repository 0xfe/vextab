# LilyPond acceptance passages

Both excerpts retain their original note and command tokens. The tests import the print score using the expressive target and partial mode. Located warnings identify source engraving instructions the importer cannot reproduce. The default import profile still rejects these passages.

| Edition | Excerpt and rights |
|---|---|
| Scott Joplin, *Maple Leaf Rag* | Chris Sawer’s 2011 Mutopia transcription of the original 1899 edition. The typesetter placed the transcription in the public domain. The excerpt retains both hands from the opening pickup through the first strain and its two endings, plus both score blocks. [LilyPond source](https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.ly) · [Published MIDI](https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid) |
| Fernando Sor, Op. 35 No. 22 | Glen Larsen’s 2013 Mutopia transcription of N. Simrock’s edition. The excerpt retains the first eight bars of all three original voices and both score blocks, including the original inactive TAB example. The excerpt, adaptation and observations retain [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). [LilyPond source](https://www.mutopiaproject.org/ftp/SorF/O35/sorf_op35_no22/sorf_op35_no22.ly) |

For both pieces, the extraction removes the publication header and the later music and closes the shortened variable definitions. The regeneration script verifies a SHA-256 digest for each complete input and reconstructs each committed source excerpt byte for byte. For Sor, `guitar: true` opts into a combined notation and TAB projection. The physical positions honor authored string numbers. Where a string number is absent, the importer assigns a playable low-fret position within each chord. These editorial assignments do not reconstruct a particular guitarist’s left-hand performance across voices.

## Playback verification

From a clean checkout, install dependencies, build the host and importer, then run the offline comparison.

```sh
npm ci
npm ci --prefix importer
npm run build-dev
npm run build --prefix importer
node issues/211/check-lily-repertoire.mjs
```

The test parses the emitted text, follows the player’s performed repeat traversal and compares the literal playback schedule with checked-in native reference data. Every row records attack, MIDI key and release, with 1,536 ticks per whole note. Multiplicity matters when multiple voices play the same pitch. The comparison covers the 552 played notes in Joplin across 33 measure visits and 70 notes in Sor. A separate three-bar fixture compares root-position chord-mode realizations to native MIDI. It checks each Sor voice individually and the complete ensemble.

To rebuild the reference data, install GNU LilyPond 2.26.0 and use the pinned test-only Python MIDI parser. The Joplin oracle reads the published MIDI. For Sor the script feeds each original voice into its own native MIDI staff so coincident unisons retain their individual releases. It passes the temporary source through `convert-ly` for the installed LilyPond version. Source excerpts used by the importer retain their original version.

```sh
mkdir -p build/lily-originals
curl -L https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.ly -o build/lily-originals/maple.ly
curl -L https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid -o build/lily-originals/maple.mid
curl -L https://www.mutopiaproject.org/ftp/SorF/O35/sorf_op35_no22/sorf_op35_no22.ly -o build/lily-originals/sor.ly
uv run --with mido==1.3.3 issues/211/lily-reference.py \
  --maple-midi build/lily-originals/maple.mid --check-sources build/lily-originals
git diff --exit-code -- issues/211/fixtures
```

## Static music modes

- Named `Lyrics` contexts resolve `\lyricsto` to one voice. `\addlyrics` attaches verses to the preceding voice or staff. Literal syllables, hyphens, extenders, skips and automatic slur, tie and manual-beam melismas retain measured anchors.
- A `ChordNames` context reads common literal `\chordmode` qualities and slash basses. It needs a matching event onset on an unambiguous staff. Standalone or staff-level sounding `\chordmode` expands root-position major, minor, diminished and augmented triads and dominant, major, minor and diminished sevenths. Native LilyPond octave placement and diatonic spelling are retained. Sounding inversions, other modifiers and Scheme chord functions produce a diagnostic.
- `DrumStaff` and `\drummode` retain chord membership, source aliases, MIDI keys and the default kit’s head shape and line for the mapped instruments. Partial mode reports the omitted open or stopped signs of the explicitly opened or closed hi-hat. Other kit styles and unmapped sounds produce a located error.
- `TabStaff` selects a TAB view. Standard, drop-D, open-G, DADGAD and literal `\stringTuning` chords use sounding open-string pitches. An optional `guitar: {capo: 2}` sets a caller-supplied capo. Single-note guitar glissandi require the same physical string.
- Grace note groups retain their order and slash style. `\afterGrace` retains the written placement fraction, including the default three-quarters point. Non-eighth grace durations receive a normalization diagnostic. Unresolved span endpoints and unplayable explicit string constraints fail conversion.

