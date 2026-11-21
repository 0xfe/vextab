# M3 · Haydn quartet editions

The [editable source](../../guide/scores/haydn-emperor-variation.vextab) covers the theme and Variation I from Haydn’s Op. 76 No. 3, movement II. The pickup is VexTab measure 1, the variation pickup is 22, and the final half measure is 42. Violin II takes the theme in the variation. Viola and cello rest throughout it. The source uses OpenScore’s CC0 transcription 20428156. [Pinned source edition](https://github.com/OpenScore/StringQuartets/tree/2614b0b2958dd1ce3f52e172a43e5f4d0e29570f/scores/Haydn%2C_Joseph/String_Quartet_in_C_major%2C_Hob.III77%2C_Op.76_No.3)

The theme retains the [M2 editorial choices](../197/README.md). Variation I includes the principal pitches, rhythms, triplets, staccatos and measured-note slurs. The transcription omits grace notes, ornament signs, expressive text and dynamics. Slurs meeting a grace or a fragment boundary are adapted to the available measured notes. The double bar separates theme and variation. A final bar closes this excerpt.

| Edition | A4 pages | Letter pages | Reading check |
| --- | ---: | ---: | --- |
| Conductor | 8 | 6 | Four labeled staves. Variation starts on a fresh page at measure 22. |
| Violin I | 3 | 3 | Broken-chord sixteenths and two triplets. The variation uses short systems for slur clearance. |
| Violin II | 2 | 2 | Receives the theme at the variation pickup. |
| Viola | 2 | 2 | Variation starts on page two. The violin cue precedes a numbered rest. |
| Cello | 2 | 2 | The player turns after resting through the pickup, one measure later than the conductor. |

The VexFlow 5.7.0 publication adapter passes complete native span descriptors into the cue composition before VexFlow formats it. This preserves the second violin’s four-note slur over the unchanged cello rest. Spans crossing the edge of the quoted bar remain in the full-size score. The adapter checks the same pinned insertion point used for M1 cue drawing. [Adapter](../../scripts/vexflow-publication-loader.cjs) · [Regression tests](../../tests/editions.ts)

The MusicXML comparison covers all 772 principal attacks and rests, including ordered chord heads and exact rational durations. The browser check traces each printed event and cue back to that transcription. Both paper sizes retain all 42 written measures, page furniture and physical margins. Chromium produced A4 MediaBoxes of 209.89 × 297.01 mm and Letter MediaBoxes of 215.90 × 279.40 mm. All 32 pages opened individually as outlined SVG with networking disabled.

## Reproduce

Use the repository toolchain, a Chrome installation and the locked development font files. The score inspection runs offline. The edition comparison downloads the pinned archive or accepts a local MXL path.

```sh
npm ci
npm test
python3 issues/197/check-edition.py --variation
node issues/198/inspect.mjs
uv run --no-project --with pymupdf python issues/198/check-pdf.py
```

The inspection writes ten PDFs and individual SVG pages under `build/vt6-m3/`. Pass the production bundle as the first argument to verify a packaged build. [Authoring and precedence](../../docs/grammarv2.md#print-editions) · [Issue and visual comparisons](https://github.com/0xfe/vextab/issues/198)
