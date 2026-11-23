# M2A measured MusicXML

Run `npm test --prefix importer` after installing the importer's development dependencies. Build VexTab and run `node issues/208/check.mjs` from the repository root to check the compiled score against the independent quartet edition.

| Fixture | Origin and observation |
| --- | --- |
| `backup.musicxml`, `divisions.musicxml` | W3C community suite cases 03b and 03c. The second voice enters on beat two. Divisions change twice across two measures. |
| `21c-Chords-ThreeNotesDuration.musicxml`, `46e-PickupMeasure-SecondVoiceStartsLater.musicxml` | Same suite. Seven ordered three-head chords have different written values. A pickup precedes a late entry. A separate hand-authored test gives two notes of a single chord unequal durations. |
| `hidden.musicxml` | VexFlow 5.9.0 MusicXML 3.1 fixture derived from OSMD. Unequal spellings of an invisible rest leave the final notes at 5/8 in both measures. See the accompanying OSMD notice. |
| `stored.mxl`, `deflated.mxl` | Repository-authored. Both package `importer/test/voices.musicxml` after an unrelated preview. The container names the first rootfile `music/custom.xml`. |
| `haydn-excerpt.mxl` | CC0 OpenScore transcription 20428156. Extracts measures 129 through 170 by ordinal, retaining the inherited opening clef of each part. |

The four W3C community fixtures use the upstream MIT license included in the fixture directory. Pinned source revisions and byte digests are listed in [the upstream suite](https://github.com/w3c-cg/musicxmlTestSuite/tree/0618bdee1bfcb965ffdd9f4e52271c909d744fd1/xmlFiles), [the VexFlow fixture catalogue](https://github.com/vexflow/vexflow/tree/5.9.0/tests/web/fixtures), [the M0 manifest](../206/fixtures.json), and [the fixture checksums](fixtures/SHA256SUMS).

To reproduce the compressed quartet extract, run `python3 issues/208/prepare-haydn.py path/to/sq20428156.mxl`. The script checks the SHA-256 of the complete archive. The 42 written measures in each of four parts preserve all 772 principal attacks and rests. The comparator checks every bar-relative onset, ordered head spelling and duration. Twelve auxiliary source records account for four ornament anchors and eight invisible rests. Six grace notes receive located loss diagnostics. Coordinates, beams, expressive marks and direction elements also receive diagnostics. [Pinned OpenScore edition and independent comparator](../197/check-edition.py) · [Printed reference](../198/README.md)

## Supported profile

The plain reader accepts decoded text, UTF-8 and signature-detected UTF-16. The MXL reader handles stored and raw-deflated ZIP members with a bounded streaming inflater. It checks member paths, declared and actual byte counts, and CRC-32. The archive limit is 16 MiB with up to 256 members and 32 MiB of declared expanded data. Both entries currently limit selected score XML to 1 MiB. ZIP64, multi-disk, and encrypted archives produce diagnostics.

Integer divisions, simple meters, major/minor keys, persistent attributes, backups, forwards, multiple voices, declared staves, pickups, dotted notes, single-ratio tuplets, whole-event ties and two-pass repeats are supported. A two-staff keyboard identified by `instrument-sound` retains voice ownership and cross-staff display. Other multi-staff groups require partial mode. Shorter untied chord heads can acquire a separate simultaneous voice in partial mode. The diagnostic records the change and the shorter release is preserved. Unsupported mid-bar meter, key or clef changes, nested tuplets and independent ties on individual chord heads produce errors.
