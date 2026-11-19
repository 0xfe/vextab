# Writing rhythm in VexTab 5

Start the development server with `npm start`. In the first guide lesson, hide the staff, change a fret, then remove the triplet and count the phrase again. The same lesson ships in the package at `dist/guide/index.html`. [Open the local triplet lesson](http://127.0.0.1:9005/guide/#triplets)

## Durations, tuplets and beams

```vextab
options tab-stems=true
tabstave notation=true time=2/4
notes :8 1-2-3/1 ^3^ :q 4/1 |
```

The first three attacks share beat one. The fourth fret starts on beat two. Hiding notation or tab stems preserves those onsets.

| Write | Musical result |
| --- | --- |
| `:qd`, `:qdd`, `:qSd` | A dotted quarter, a double-dotted quarter, and a dotted quarter with a slash head. The value lasts until the next duration. |
| `:q C/4 :8 D/4 ^3,2^` | Apply triplet time to the preceding two attacks. The quarter and eighth now fill one beat in a 2:1 proportion. |
| `^3^` or `^5^` | Capture three or five attacks respectively. Three occupy the time of two equal written values. Five occupy the time of four. Rests count as attacks. A group must fit in the current bar and voice. |
| `time=6/8 show-time=false` | Count and beam in 6/8 with the printed time signature hidden. A duplet occupies three ordinary eighths when written as `:8 1-2/1 ^2^`. |
| `options beams=auto` | Group by meter. Six consecutive eighths in 6/8 form two beams of three. Historical bracket tokens are ignored in this default mode. |
| `options beams=explicit` | Beam only bracketed groups, such as `notes :8 [ C-D-E/4 ] F/4`. Brackets must match in the same bar and voice. Each group needs at least two beamable values. Written groups may include rests. |
| `options beams=off` | Draw individual flags. Durations and tuplets retain their timing. |

Set beam options before the stave or voice they apply to. In automatic mode `beam-rests=false` breaks beams at rests. With rest beaming enabled, `beam-middle-only=true` excludes leading and trailing rests. Use `beam-stemlets=false` to hide the short stems on beamed rests. A `voice voice=top` or `voice voice=bottom` declaration sets the stem direction for that voice.

## Pitch, text and rests

- Fretted notes take their spelling from the tuning and key. Accidental memory follows written octave and musical time across voices. A barline resets it. An explicit sign stays with its written head, including a cautionary such as `B@~/4`. Fingering numbers refer to the authored chord order.
- A bare annotation such as `$A$` is a chord label. Use `$A4$` or a fret/string override such as `$8/4$` to replace a fret. Upper tab labels share a baseline above the strings.
- Timed chord changes on a `text` line can span a bar. The renderer supplies the bar spacing. An explicit `|text` still places text at the barline.
- `##` lets the engraver place a rest. `#1#` selects the bottom staff line, and `#2#` selects the space above it. On a five-line staff, `:h #0#` and `:w #9#` place long rests on the lower and upper ledger lines. The same position works with a four-string tuning.

## Editing and redrawing

The SVG and Canvas editors keep the last complete picture when an edit fails. The preview dims and the status message explains the error. The next successful edit replaces the picture. Source locations count lines from one and columns from zero, including indentation. The public parser's `isValid()` describes the latest parse.

An API consumer can call `artist.setOptions({ width: '500', scale: '0.8' })` and draw the same Artist again. Its voices, end bars and playback groups survive the redraw. The notation footer has been removed. The old `Artist.NOLOGO` property is retained for embeds that set it.

## Reviewed reports

| Report | Observation checked in Chrome |
| --- | --- |
| #131, #100 | Each tab-only triplet eighth lasts exactly 4,096/3 ticks. The two mixed-duration attacks last 8,192/3 and 4,096/3 ticks. |
| #62 | The dotted slash lasts 6,144 ticks. G/A, C/A and Fmaj7 align with the first, second and fourth attacks, including the chord after the barline. |
| #57 | The two ties to B after the triplet are present on the staff, including the tie across the barline. A reordered chord keeps its tie endpoints. |
| #88, #163 | The half and whole rest have distinct ledger glyphs. An opening repeat retains its dots after the tab clef and leaves the far left open. |
| #101 | The upper A, B and C labels in both bars share a baseline even with lower strokes. The frets remain visible. |
| #99, #161, #164 | Four paired attacks align with and without a final bar. The flat stays on E4 after chord reordering. The A-major cancellation still lands on G4. |

The packed browser checks cover the guide, editor recovery and legacy entry points. The release comparison exercises all 28 historical examples and nine musical probes. [Engraving tests](../tests/engraving.ts) · [Reference comparison](vt5-baseline.md) · [Tracking issue and images](https://github.com/0xfe/vextab/issues/176)
