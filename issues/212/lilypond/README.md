# Full LilyPond editions

The fixtures are complete, byte-pinned Mutopia source files. The importer reads their declared LilyPond versions directly. Native LilyPond 2.26.0 supplies the independent written and performed observations. BWV 999 was held out from the M4 repertoire. M4 covered eight bars of Sor and the first strain of Joplin.

| Complete edition | Declared version | Transcription and rights |
|---|---|---|
| [Sor, Op. 35 No. 22](sor.ly) | 2.16.1 | Glen Larsen’s 2013 transcription of the N. Simrock guitar edition. The fixture, observations and adaptation retain [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). [Mutopia source](https://www.mutopiaproject.org/ftp/SorF/O35/sorf_op35_no22/sorf_op35_no22.ly) |
| [Bach, Prelude BWV 999](bwv999.ly) | 2.16.1 | Jakob Bagterp’s D-minor lute/guitar transcription. The typesetter placed it in the public domain. [Pinned Mutopia source](https://github.com/MutopiaProject/MutopiaProject/blob/2144afd6f52d56c5b6995b8b589ef1268b3139f0/ftp/BachJS/BWV999/Bach_Prelude_BWV999/Bach_Prelude_BWV999.ly) |
| [Joplin, Maple Leaf Rag](maple.ly) | 2.14.2 | Chris Sawer’s public-domain transcription of the 1899 edition. Both piano hands, four written repeats, endings, the opening pickup and the shortened final bar are present. [Mutopia source](https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.ly) · [Published MIDI](https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid) |

## Results

All six output selections import in expressive partial mode at default capacity. The guitar editions use `guitar: true`. Joplin uses `finalFragment: true` to preserve the short final ending. Sor and Joplin have separate print and MIDI scores. Bach’s score contains both output blocks.

| Work and selected output | Written bars | Performed visits | Written noteheads and rests | Performed heads | Warnings |
|---|---:|---:|---:|---:|---:|
| Sor print | 48 | 80 | 419 | 692 | 61 |
| Sor MIDI | 48 | 80 | 419 | 692 | 59 |
| Bach print | 43 | 43 | 680 | 509 | 4 |
| Bach MIDI | 43 | 43 | 680 | 509 | 4 |
| Joplin print | 85 | 145 | 1,642 | 2,566 | 17 |
| Joplin MIDI | 145 | 145 | 2,831 | 2,566 | 18 |

Strict mode stops at the first known loss and returns zero documents for all six selections. Across twelve calls (three works, two selections, two modes), the score outcomes are 0 exact, 6 partial, 6 failed and 0 outside the profile. A partial score still must match every written and performed reference row.

- **Sor** retains the independent releases of the three voices and the printed fingerings. In bar 44 the edition requests finger zero and string four for a B above the open D. The importer preserves the printed zero, uses the fret required by the explicit string and reports the conflict. The remaining warnings cover stem, voice, tie direction, notehead-merging instructions and pitched-rest placement.
- **Bach** resolves the historical `deutsch.ly` language include, including B-flat from `b` and B-natural from `h`. It retains the nylon-guitar program, and the MIDI selection takes its opening metronome mark from the output block. Global staff size, two voice engraving presets and the final barline style account for the four warnings.
- **Joplin** retains the B section’s dynamic and the trio heading. Font, placement, manual breaks, stems and the final barline account for visible losses. The MIDI selection also reports its legacy MIDI configuration block. The source’s literal unfold transformation resolves the repeat graph independently for each hand. The published MIDI and native unfolded notes agree on all 2,566 attacks and releases.

Each head tied out of Joplin’s trio body has a distinct destination in each ending. The existing 6.4.0 grammar accepts multiple named ties from that head. The 6.5.0 player retains a sounding head across the forward jump into the later ending. Imported scores with a surviving branched tie require 6.5.0. A 6.4.0 player can reattack the second-ending head. The explicitly unfolded score has separate ties on each pass.

### Feature probes

The 18 probes below run separately from the full scores and earlier regression suites. Out-of-profile cases must return a located unsupported error and zero documents. The other failure probes check malformed input, timing or resource limits. [Executable probe definitions](coverage.mjs)

| Family | Total | Exact | Partial | Failed | Out of profile |
|---|---:|---:|---:|---:|---:|
| Repeats and endings | 5 | 3 | 0 | 1 | 1 |
| Historical literal commands | 7 | 2 | 3 | 1 | 1 |
| Version declarations | 3 | 2 | 0 | 0 | 1 |
| Invalid and bounded inputs | 3 | 0 | 0 | 3 | 0 |
| Total | 18 | 7 | 3 | 5 | 3 |

The reader also accepts the static 2.24 and 2.26 profiles and the named 2.16.0, 2.17.11, 2.19.21 and 2.23.0 declarations covered by earlier cases. This full-edition qualification applies to the two declared versions in the table. Arbitrary Scheme, external filesystem includes, segno jumps, nested volta structures and an unresolved tie leaving a nonfinal ending remain outside this gate. Historical language include names select the built-in static pitch-language table. A caller’s explicit virtual file takes precedence.

## Reproduce

After building VexTab and the separate importer in the repository root, run both offline checks.

```sh
npm ci
npm ci --prefix importer
npm run build-dev
npm run build --prefix importer
node issues/212/lilypond/check.mjs
node issues/212/lilypond/coverage.mjs
```

The whole-edition test opens the emitted text with the public parser and the same projection and repeat traversal used for engraving and literal playback. It checks each voice independently. Written rows compare onset, duration, display staff, diatonic name, chromatic alteration and octave, including rests. Performed rows compare MIDI pitch and exact attack and release in ticks. Both use 1,536 ticks per whole note. The native `treble_8` guitar pitch is converted back from the printed octave for this comparison. The MIDI comparisons also check measured total performance duration. They exclude velocity, timbre and expressive deviations from the literal score.

For independent regeneration, install LilyPond and `convert-ly` 2.26.0. The Python script verifies each original file’s SHA-256, converts a temporary copy for the native engine, and feeds the original voice definitions into separate observed staves. Each voice gets its own MIDI rendering to retain coincident pitches and releases. A background silent staff lets Joplin cross staves during observation. Native `\unfoldRepeats` supplies the performed form and the written observations for Joplin’s explicitly unfolded selection. The importer itself receives the original bytes. [Native observer](observe.ily) · [Reference generator and hashes](reference.py)

```sh
uv run --with mido==1.3.3 issues/212/lilypond/reference.py
curl -L https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid -o build/maple.mid
uv run --with mido==1.3.3 issues/212/lilypond/reference.py --published-maple-midi build/maple.mid
```

Use `--write` to regenerate the TSV files. Each row begins with the original voice name. `W` identifies written observations, `U` written observations after explicit unfolding and `P` performed observations.

