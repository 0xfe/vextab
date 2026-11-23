# Measured LilyPond qualification

The static reader resolves selected music without a LilyPond installation. It accepts Dutch, English and German pitch names with the qualified natural, sharp, flat and double alterations, major and minor keys, and absolute, fixed and relative octave entry. Music variables bind in source order. A variable inherits its definition's language and starts with its own default quarter duration. Within a relative chord the first head determines the octave reference for the next attack.

Select a movement with `score: 'print'` (the default), `'midi'`, or a zero-based score index. Books and bookparts retain score order. Each virtual include resolves relative to its containing filename. For example, `scores/song.ly` can include `"lib/theme.ly"` when the caller supplies `includes: { 'scores/lib/theme.ly': source }`. Included definitions keep their file, offsets and variable use sites in the optional source map.

## Native reference

Run from the repository root after building both projects.

```sh
npm ci --prefix importer
npm run build --prefix importer
npm run build
node issues/209/check-native.mjs
node issues/209/check-native.mjs --native
```

The first check reparses the emitted VexTab and compares every written pitch or rest, display staff, onset and duration with the checked-in native observations. The second also compiles the fixtures with GNU LilyPond **2.26.0** and its installed `event-listener.ly`. For a reviewed fixture change, `--native --write-reference` regenerates the TSV. Each row has the fixture, display staff, absolute onset and duration in whole notes, and MIDI pitch or `rest`. Chords contribute one row per head. The listener rounds times to eight decimal places. The VexTab parser supplies exact fractions until the comparison.

| Fixture | Native observations | Coverage |
| --- | ---: | --- |
| relative | 12 | Relative chord followed by B3, two levels of tuplets and inherited rhythm |
| parallel | 14 | Source declares 2.24.4. Two simultaneous clocks, relative pitches and durations across a branch boundary, English pitch names, variable use and fixed octave entry |
| context | 5 | The upper piano voice crosses to the lower staff and returns |
| endings | 7 | A written volta body, two numbered alternatives and a following measure |
| maple-excerpt | 40 | Printed pickup and first two full measures in both hands |
| maple-midi | 77 | The legacy MIDI score unfolds the same two bars on both passes |

The native harness adds an instrument name to each named staff so LilyPond writes separate staff observations. It runs on the reviewed source files listed here. Native LilyPond executes source code and belongs in the fixture qualification step.

## Joplin compatibility

Chris Sawer placed the Mutopia edition of *Maple Leaf Rag* in the public domain. The excerpt retains the source's 2.14.2 declaration, pitch spellings, relative anchors, inherited durations, opening forte, pickup and first two full bars of both parts. It closes the repeat after those two bars. The original layout and MIDI score wrappers are retained. The header, paper configuration, cosmetic text-padding override, remaining bars and original endings are excluded. [Original source](https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.ly) · [Pinned original digest](../206/fixtures.json)

The print selection returns a located warning for the omitted forte in partial mode. The MIDI selection recognizes the historical literal `\applyMusic #unfold-repeats`, expands the resolved bars, and reports the omitted MIDI output settings and forte. The native oracle selects the corresponding score wrapper, sets the declaration to 2.26.0, and uses `\unfoldRepeats` with a layout listener for the MIDI selection. These tests compare written events produced by that transformation. The 552-note first-strain playback comparison belongs to M4.

## Profile boundaries

- The reader handles sequential and simultaneous music, named voices, piano hands, staff changes, pickups, inherited and double-dotted durations, rests, skips, chords, whole-event ties and nested tuplets. Timing changes require measure boundaries. Ordered eighth-note grace heads attach to a pitched anchor. Other grace durations require partial mode and carry a warning.
- Volta bodies and endings occupy complete measures. Both the historical external alternatives and the modern trailing numbered blocks are qualified for one consecutive ending per pass. Bounded unfold creates written copies.
- Unknown duration-producing commands, arbitrary Scheme, unprovided includes, unsupported overlays and incomplete music return a located failure. Header and layout settings lie outside the music profile. Full-file qualification of older repertoire and expressive engraving remain later milestones.

## Extended target and upstream regressions

Select `targetProfile: 'extended'` for timed keys and clefs, literal metronome marks, written-to-sounding instrument transposition and StaffGroup brackets. A metronome mark in eighth notes is converted to quarter-note BPM before emission. Source pitches retain their written spelling when a transposition changes their sounding MIDI values.

Four unchanged input files from the LilyPond 2.26.0 source tree are pinned by commit and SHA-256. The regular check downloads only these fixtures, and accepts a local checkout in `LILYPOND_SOURCE_DIR`. The native check additionally runs the two successful inputs through the installed LilyPond 2.26.0 listener. [Qualification script](../210/lilypond-upstream.mjs) · [Pinned upstream regression suite](https://github.com/lilypond/lilypond/tree/3596756be0fac1f81066a99d2054329212172b2d/input/regression)

```sh
node issues/210/lilypond-upstream.mjs
node issues/210/lilypond-upstream.mjs --native
```

| Upstream file | Declared source version | Expected result |
| --- | --- | --- |
| `chord-repetition-times.ly` | 2.19.21 | Exact in the default profile. Compare 25 chord heads and rests, including a tie and triplets in two complete bars. |
| `tuplet-nest-beam.ly` | 2.17.11 | Eight native pitches, onsets and durations inside nested 7:4 and 5:4 tuplets. Pass `finalFragment: true` to admit its intentionally short final bar. |
| `staff-change-autobeam.ly` | 2.16.0 | A located failure at the standalone change to an implicit destination staff. Named piano-hand staff changes remain covered by the native context fixture. |
| `repeat-volta-specified-alternatives.ly` | 2.23.0 | A located failure at the first nonconsecutive pass number in the source's reordered pass list. Consecutive numbered and historical endings remain covered by the native endings fixture. |
