# VexTab 5 user guide and integration

VexTab 5 was an experimental release. This document records its design or results. See the [VexTab 6 guide](https://vexflow.com/vextab/guide/) for current notation.

Run `npm ci` and `npm start`. Open the [VexTab tutorial](http://127.0.0.1:9005/guide/). Follow the 14 tutorial steps, explore [features beyond the tutorial](http://127.0.0.1:9005/guide/#features), play the [studies](http://127.0.0.1:9005/guide/#studies), or search the [API reference](http://127.0.0.1:9005/guide/#reference). The same guide works offline by opening `dist/guide/index.html` in the built distribution. From any lesson, **Open in playground** opens the same editable score. **Open original source** links to the repository version of that lesson. Drafts stay in your browser.

## Learn the language

| Subject | Try it in the guide |
| --- | --- |
| Fret and string, written pitch and sounding pitch, paired views | [Your first fret](http://127.0.0.1:9005/guide/#lesson/first-fret) |
| Note values, named pitches and flats, beams in 3/4 and 6/8 | [Count three or count two](http://127.0.0.1:9005/guide/#lesson/meter) |
| Three notes on one beat, with rhythmic tab | [Hear a triplet](http://127.0.0.1:9005/guide/#triplets) |
| Hammer-ons, pull-offs, slides and vibrato | [Hammer, pull and slide](http://127.0.0.1:9005/guide/#lesson/guitar-gestures) |
| Bars, ties and selecting a note by keyboard | [Follow a tied chord](http://127.0.0.1:9005/guide/#lesson/tied-chord) |
| Recover from an incomplete measure | [Find a missing beat](http://127.0.0.1:9005/guide/#lesson/diagnostics) |
| Chords and fingerings, independent voices, repeats, bends, lyrics, lead sheets and printing | [Eight editable demos](http://127.0.0.1:9005/guide/#demos) |
| Look up a token, its default, scope and layout | [Search the language reference](http://127.0.0.1:9005/guide/#reference) |

The detailed references cover [rhythm and fixed-layout syntax](vt5-m1.md), [stave, note and label colours](colors.md), [measures, ties and source ranges](vt5-m2.md), and [lead sheets, string techniques and print coverage](vt5-m3.md).

## Listen, edit and read

- Press **Play** at the bottom center of a score to hear the current notes. **Stop**, editing, or starting another example ends playback. The first play loads SpessaSynth and the bundled SoundFont. In the duet, the sheet player plays the selected guitarist or the full score.
- Try [pre-bends](http://127.0.0.1:9005/guide/#features/pre-bends), [score colours](http://127.0.0.1:9005/guide/#features/score-colours), and [tempo and instruments](http://127.0.0.1:9005/guide/#features/playback). These features are in the current checkout, after the 5.0.0 npm release.

- Edits render after a short pause. **Run** or **Ctrl/Command+Enter** engraves immediately. An input method can finish composing a character before rendering. **Find error** selects the located token. A dimmed score is the last valid drawing.
- **Reset example** or **Ctrl/Command+Alt+R** restores the current example. The guide keeps a draft per score in local storage, falling back to memory if storage is unavailable. **Copy source**, **Save source** and **Open source** work on the current text. Opening a file replaces the current lesson’s draft.
- In flow lessons, **Previous event** and **Next event** announce the measure, staff, voice, pitch or string and duration. **Select source** highlights the event in the editor. Switching view or width recomputes the geometry. Editing invalidates the old selection.
- The guide uses light paper, green source boxes and the historical tutorial’s Tangerine lettering. Paper previews and browser printing use white pages. The fixed Canvas embed exposes a text summary of the staves, voices and attacks to assistive technology.
- In the duet, two numbered voices represent the players. Choose **Full score**, **Guitar 1**, or **Guitar 2**, then choose **A4** or **Letter**. Print the edition, save the complete print document as HTML, or save one page as SVG. Both downloads contain outlined music and text and open offline. An invalid edit clears the previous edition.

## Embed and migrate

| Entry | When to use it |
| --- | --- |
| `vextab/parse` | Parse and validate without a DOM. Supports named ES imports and CommonJS. |
| `vextab/browser` | Use a bundler to import `Div`, `parseScore`, `renderScore` and `renderScorePart`. Mount embeds explicitly. |
| `vextab/auto` or the `dist/div.prod.js` script | Automatically mount `div.vextab-auto` on DOM ready. |
| Existing root import, `dist/main.prod.js`, `dist/vextab-div.js` | Continue using the Artist, parser and legacy globals. The legacy adapter supports `.vex-tabdiv`, underscore attributes and the Canvas default. |

```ts
import { parseScore, renderScorePart } from 'vextab/browser';

const duet = parseScore(source.value, { language: 2 });
const { publication } = renderScorePart(preview, duet, 'notation', {
  voice: 2, paper: 'Letter', title: 'Guitar 2',
});
console.log(publication.pages.length, publication.diagnostics);
```

The optional one-based `voice` selects that voice in every measure. Bar numbers, repeat boundaries, rehearsal marks and ties for the selected player are preserved. An absent voice has a located diagnostic. Omit `voice` for the staff with all its voices.

For an editable embed, put VexTab in the host’s `textContent`, set `data-layout="flow" data-editor="true"`, then call `new Div(host)`. Use `run()` to flush an edit, `getReadingEvents()` for the current reading order and `selectError()` for a located diagnostic. Keep the return value of `getScore()` when selecting a source ID. Call `dispose()` before replacing an editor. The embedding workbench demonstrates two independent instances.

Manual and automatic embeds accept `data-width`, `data-scale`, `data-renderer`, `data-layout`, `data-editor`, `data-show-errors`, `data-editor-width` and `data-editor-height`. A nonempty prefixed attribute takes precedence over its plain spelling. For editor dimensions, the hyphenated spelling takes precedence over `data-editor_width` or `data-editor_height`. Set `data-width="auto"` to follow the host width in flow layout.

Start migration with a complete measure. Flow validates rhythm and wraps at barlines. Fixed layout supports free fragments and legacy technique commands. The SVG flow view requires scale 1. Academico is the default for score text, including chord names, lyrics and fret-frame captions. Author-specified text fonts still take precedence. Slash heads use Bravura’s stem anchors. [Upstream default-attachment report](https://github.com/vexflow/vexflow/issues/362)

## Historical tutorial

The [original tutorial](../doc/tutorial.html) and the earlier [tied-chord](../guide/shared-score.html) and [studies](../guide/studies.html) pages retain their paths. The guide uses the same chapter prose, tables and 26 musical examples as the original page. Each step has its own URL and each example has a local draft and reset button. [Start the original walkthrough in the guide](http://127.0.0.1:9005/guide/#tutorial/notes)
