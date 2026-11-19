# One score for the editor, layout and print

The VexTab 5 development build can parse a score once and engrave it at different widths or as a separate part. Add `layout="flow"` to opt in on an SVG embed. Existing embeds continue to use the fixed-row Artist.

## Follow a tied chord

Run `npm ci` and `npm start`, then open the [editable lesson](http://127.0.0.1:9005/guide/shared-score.html). The lesson also ships in the built package at `dist/guide/shared-score.html`.

```vextab
options tab-stems=true
tabstave notation=true time=4/4
notes :q 0/3 ## :h (1/2.2/3) | :h T(2/3.1/2) :q 3-1/2 |
```

The first bar starts with open G and a quarter rest. Hold C and A through beat two of the next bar. The tied chord reverses its string order. Narrow the preview and follow each string across the break. Use **Select the tied chord**, then **Engrave notation part** and **Find the chord from the part**. Each selection returns to `T(2/3.1/2)`.

## Enter bars and voices

- A stave declaration starts a written row. Its clef, key, tuning, string count and meter apply to its voices. Declare changes on the next stave. The default meter is 4/4. An omitted signature or `show-time=false` hides the sign and keeps the meter in force.
- Each voice must fill the same bars. A leading `=|:` opens a repeat. A trailing barline closes the last measure. It consumes no time.
- Fret/string attacks use guitar octave convention. Both named and custom tunings give written open-string pitches. The standard open sixth string is written E3 and sounds E2. Drop D gives D3 and D2. A named staff pitch without a fret sounds at the indicated octave.
- Use `pickup=1/4` on a stave for a one-quarter pickup before full measures. Use `fragment=true` for a deliberate excerpt whose written durations determine the bar lengths. Voices must still agree. A mismatch points to the offending boundary.
- Fixed layout keeps its historical soft timing. Use it for freely spaced fragments or existing technique-heavy scores.

```vextab
stave time=3/4 pickup=1/4 voice=top
notes :q G/4 | :hd C/5 |
voice voice=bottom
notes :q ## | :hd C/4 |
```

## Embed or integrate

For the new browser APIs, load the built `dist/main.prod.js`. A screen or page render needs a DOM host. Each call constructs fresh VexFlow objects. A failed render preserves the previous drawing in that host.

```js
const { parseScore, renderScore, renderScorePart } = vextab;
const score = parseScore(input.value);
const screen = renderScore(preview, score, { width: 480 });
const arrival = score.ties[0].to;
const note = screen.navigation.events.find(e => e.staff === 'tab' && e.source === arrival);
const range = screen.rangeFor(note.id, input.value);
if (range) input.setSelectionRange(range.start, range.end);

const part = renderScorePart(paper, score, 'notation', { paper: 'A4' });
const page = part.publication.pages[0];
const events = JSON.parse(page.svg.querySelector('metadata').textContent).events;
const printed = events.find(e => part.sourceFor(e.id) === arrival);
const printedRange = part.rangeFor(printed.id, input.value);
```

- `parseScore(source)` returns plain data. Measures contain the staff state, voice declarations, opening and closing boundaries, and attacks. Onsets are relative to the bar. Durations and spans are reduced fractions in whole notes. A rest has zero heads. A pitched head has a written pitch, a sounding pitch and, where specified, a physical string and fret. Each tie identifies the attack and member index at both ends.
- Event IDs belong to one source revision. Staff and tab projections get different IDs. `sourceFor(projectionId)` returns their common musical ID. `rangeFor(id, currentSource)` returns a half-open range only while the original text matches. Offsets use UTF-16, lines start at one and columns start at zero. CRLF input retains its original offsets.
- `renderScore(host, score, { width, part })` accepts `score`, `notation` or `tab` as the view. Read `navigation.events` in musical order. Use `hitTest(x, y)` in SVG coordinates for a note or span. Re-render with the same score when width changes. Read `diagnostics` for engraving limits such as an overfull row.
- `renderScorePart(host, score, 'notation' | 'tab', options)` independently engraves the selected staff with VexFlow Publication. Each page carries its own event and span IDs. Inspect `publication.diagnostics` before exporting. The example above assumes the lesson’s two tied bars.
- In a `Div` with `layout="flow" editor="true"`, use `setWidth(width)`, `getScore()` and `selectSource(id, score)`. An edit immediately invalidates source selection. A failed edit leaves the last successful preview visible and marks it stale. A successful edit supplies a new revision.

For a Node validator, load the standalone parser from the built package. It accepts the same input without a browser.

```js
const { parseScore, ScoreError } = require('vextab/dist/score.cjs');
try {
  const score = parseScore('stave time=1/4\nnotes C/4');
  console.log(score.measures[0].span); // 1/4
} catch (error) {
  if (!(error instanceof ScoreError)) throw error;
  console.error(error.code, error.range, error.message);
}
```

## Engraving coverage in M2

| Construct | Flow SVG | Independent part |
| --- | --- | --- |
| Frets, named staff notes, chords, timed rests, aligned voices, numeric meters, pickups and fragments | Supported. Supply an explicit fret for a named note on tab. | Supported for the selected staff. A silent rest on unstemmed tab has a diagnostic. |
| Ties across a bar or an automatic row break | Supported on notation and tab, including reordered chord members. | Notation ties recompose. A tab tie has a source diagnostic. |
| Tuplets, automatic beams and disabled beams | Supported. Hidden tab stems retain exact tuplet time. | Supported on notation and rhythmic tab. An unstemmed tab tuplet has a diagnostic. |
| Dots, explicit accidentals, hidden signatures, double and final bars | Supported. Opening and closing repeats follow their measure boundaries. | Marks that need the screen engraving pass have a diagnostic. |
| Bends, slides, fingerings, labels, timed text, explicit beam groups and changes of staff configuration | Use fixed layout. The diagnostic identifies the source construct. | The same check runs before publication. |

The editor uses SVG at scale 1 for flow. The existing Artist and Canvas embeds cover fixed layout. The browser regressions compare actual fixed and flow notes, inspect each wrapped tie and map independent page metadata back to the CRLF source. [Shared-score tests](../tests/shared-score.ts) · [Guide and packaged-consumer checks](../scripts/test-browser.mjs)
