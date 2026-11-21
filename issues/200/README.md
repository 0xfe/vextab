# M5 · Repertoire and release qualification

Open the packaged `dist/guide/index.html#studies` or build the standalone guide with `npm run guide:build`. Choose a piece, edit the source, then use Play or the score reader. **View** selects the conductor or a single instrument for reading, playback and export. **Prepare print edition** enables printing, a self-contained print HTML download and an outlined SVG for each page. **As authored** respects the selected part’s paper and turns. An edit invalidates its previous downloads.

| Editable source | Edition, range and reading task | Verified print |
| --- | --- | --- |
| [Sor · Op. 35 No. 22](../../guide/scores/sor-op35-no22.vextab) | Bars 1–8. Glen Larsen’s Mutopia engraving after N. Simrock, CC BY-SA 3.0. The adaptation assigns unspecified strings. Trace the held bass while the eighth notes move. Numeric TAB fingerings have circles. [Edition](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1850) | Paired, notation and TAB each fit one page. |
| [Joplin · Maple Leaf Rag](../../guide/scores/joplin-maple-leaf.vextab) | Pickup, first strain and both endings. Chris Sawer’s public-domain Mutopia transcription of the 1899 Stark edition. The excerpt uses fixed clefs and selected expressive marks. Slow the repeat and follow the right hand onto the lower staff. [Edition](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=23) | The two hands share a one-page score. All 552 reference note onsets, pitches and releases match through both endings. |
| [Handy · The St. Louis Blues](../../guide/scores/handy-st-louis-blues.vextab) | The first twelve sung bars of the public-domain 1914 Pace & Handy edition. Melody, grace and two underlays come from the facsimile. Harmony and piano reduction are editorial. Change the first lyric, then find it on the vocal part. [Facsimile](https://commons.wikimedia.org/wiki/File:W._C._Handy_-_St._Louis_Blues_(1914,_Pace_and_Handy).pdf) | Two conductor pages. Voice and piano each fit one page. |
| [Haydn · Emperor Quartet](../../guide/scores/haydn-emperor-variation.vextab) | Movement II, pickup through bar 40. OpenScore CC0 transcription 20428156. Follow Violin II taking the theme. The adaptation retains the principal notes and measured slurs and omits ornaments, grace notes, dynamics and expressive text. [Edition and independent transcription check](../198/README.md) | Conductor uses eight A4 pages or six Letter pages. The four parts use 3, 2, 2 and 2 pages on each paper. All 772 principal attacks and rests match the edition. |

## Package and visual checks

The qualification used the published VexFlow **5.8.0** tarball. The lockfile records npm’s URL and SHA-512 integrity. Lint, TypeScript, 95 authored corpus scores, migration and 15 compiler tests passed. The packed suite passed 154 QUnit tests in each of Chromium, Firefox and WebKit. A fresh external consumer passed CommonJS, ESM, strict TypeScript, bundling, CLI migration and browser mounting. The legacy comparison ran 28 examples per build against VexTab 4.0.6. [Package commands](../../docs/developers.md)

- At 920 CSS pixels the Sor, Joplin, Handy and Haydn conductor scores had 154, 179, 140 and 772 reading events. SVG and Canvas agreed on event IDs, onsets, durations and system breaks. Native stave start positions agreed across both backends in each engine.
- At 390 CSS pixels and device scale 2, a tap on the first painted notehead selected its exact source in each score. Staff lines stayed 10 CSS pixels apart and the document fit the viewport. Dense measures scroll within the score. The reader’s **Next event** and **Select source** buttons work from the keyboard. The guide’s real SoundFont produced PCM output for all four pieces.
- In an isolated Linux desktop, Orca spoke the Sor study title and the **Score reader** region. Enter on **Next event** announced measure 1, guitar, notation, voice 2, D5, string 2, fret 3 and an eighth note. Tab, then Enter on **Select source**, returned focus to the source editor and selected `3/2`. The conductor reader uses musical staff names so the listener can distinguish guitar notation and tablature.
- Chromium printed every selectable view on both A4 and Letter. All 28 downloads opened offline with outlined glyphs and the complete written measure sequence. An independent PDF check verified physical dimensions, page counts and ink on all 52 pages. Reviewed crops show the two lyric lanes, the separated Joplin beam groups, the Sor bass tie and circled fingers, and the cello cue above its compressed rest. [Review screenshots and CI](https://github.com/0xfe/vextab/issues/200)

## Rendering cost

Apple M3, macOS arm64, Node 26.13.1 and Chrome 157.0.8103.79. Each cell is milliseconds. Both bundles ran back to back on the same machine.

| Build | Parts × bars | Parse | Draw | Edit | Reflow | Print |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| M0 release · VF 5.6.1 | 1 × 16 | 0.2 | 6.1 | 7.1 | 5.7 | 8.0 |
| M0 release · VF 5.6.1 | 4 × 16 | 0.3 | 21.7 | 21.0 | 20.7 | 28.2 |
| M0 release · VF 5.6.1 | 4 × 64 | 1.0 | 82.9 | 82.9 | 80.3 | 116.2 |
| M5 package · VF 5.8.0 | 1 × 16 | 0.2 | 6.9 | 5.8 | 5.6 | 7.8 |
| M5 package · VF 5.8.0 | 4 × 16 | 0.4 | 21.4 | 23.4 | 20.5 | 28.3 |
| M5 package · VF 5.8.0 | 4 × 64 | 1.1 | 84.1 | 85.2 | 84.1 | 111.8 |

On the largest score, print fell from 116.2 to 111.8 ms. Reflow rose from 80.3 to 84.1 ms. Full redraw after an edit remains the largest interactive cost measured here.

## Limits

A shared conductor grid requires matching elapsed measure spans. VexTab cues quote one measure. General independent-meter pagination, multi-bar ossias and figured-bass continuations remain grammar work. VexFlow 5.8.0 supplies native primitives for these operations. The next useful fixtures are two incompatible local meters meeting on a shared downbeat, an ossia crossing a system break and two figured-bass rows ending at different times. The guide’s small SoundFont uses one bowed-string sample for violin, viola and cello. [VexFlow release](https://github.com/vexflow/vexflow/releases/tag/5.8.0) · [Capability inventory](../../docs/vt6-baseline.md)

## Reproduce

Use the pinned Node version. Follow the package commands in the developer guide to produce and extract the tarball. Set `dist` to its extracted `package/dist` directory. Each run reads the four scores from that directory. Chromium also writes the PDF editions to `build/vt6-m5/`.

```sh
npm run lint
npm run typecheck
npm run test:corpus
for engine in chromium firefox webkit; do
  VEXTAB_BROWSER="$engine" node scripts/test-browser.mjs "$dist"
  VEXTAB_BROWSER="$engine" node issues/200/inspect.mjs "$dist"
done
uv run --no-project --with pymupdf python issues/200/check-pdf.py
node issues/200/timings.mjs "$dist/main.prod.js"
```

For a same-session comparison, pass the M0 `release.js` as the first bundle and the current production bundle second. The script reuses M0’s workloads and five-sample warm median. Timings cover synchronous engraving and exclude browser painting and PDF export. [M0 methodology and historical results](../195/README.md#cost-of-rendering-and-editing)
