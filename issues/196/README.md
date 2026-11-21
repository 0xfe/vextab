# M1 · Preserve authored music on screen and paper

At 560 px, the words “roll”, “to” and “sea” in *Slow River* now share the baseline at 556.265. The original jump was 49.144 SVG units. The same source fits on one A4 page with the Am diagram and barre. A printed skip advances by its full duration and an explicit beam retains its exact members. [Release measurements](../195/README.md) · [Visual comparisons](https://github.com/0xfe/vextab/issues/196)

## Mark ownership

The compiler identifies the second mark when two marks compete for one slot. This covers lyrics, literal chord symbols, frames, ink, rest lines, written pitches, forced signs, bend contours, open-slide endpoints and fret connections. Multiple annotations, different fingers, and distinct named tie endpoints can coexist. Saved v2 models also pass through the check before engraving. Each head retains its authored index as the chord order changes. Forced signs use the final written pitch even when its spelling follows the sign in the source. [Compiler](../../src/score/grammar2/compiler.mts) · [Projection](../../src/score/grammar2/project.ts)

Each fresh screen, part and cue gets its own native note, accidental, fingering, beam and gesture. The shared preparation applies ink and head marks before spacing. After layout, each sung voice takes the lowest baseline required by its syllables on that system. VexFlow’s phrase solver redraws the hyphens and extenders at that baseline. The native diagram key contributes to the measured first system before VexFlow chooses page breaks. [Rendering](../../src/score/layout.ts) · [Verses and diagrams](../../src/score/lead.ts)

### VexFlow 5.7 integration

The published `Publication.noteHooks` is an EasyScore string-parser hook. VexFlow constructs typed stave and TAB notes directly, then draws its private staging composition. The VexTab bundle adds two optional callbacks to the pinned ESM build. One gives the part and cue renderer the native composition and factory at drawing time. The other runs after the factory has formatted its sheets. Ordinary VexFlow draws follow their original path. VexFlow owns note construction, glyphs, spacing, pagination, page metadata and print export. The loader checks its insertion points and fails the build if they change. Replace it when the upstream API exposes equivalent hooks. [Build adapter](../../scripts/vexflow-publication-loader.cjs) · [VexFlow publication](https://github.com/vexflow/vexflow/blob/5.7.0/src/publication.ts)

## Native engraving audit

| Operation | Native control and decision | Bounded case |
| --- | --- | --- |
| Two lyric marks on one note | A single v2 lyric slot cannot distinguish two verses or an elision. Select the second mark. The native 5.7 elision is reserved for explicit M4 syntax. | Two lyrics expanded by a pattern, with the call trace and second source range. |
| Verse fit | Each measure owns a native phrase lane. VexTab pins syllables by physical staff, voice and final system, then uses native connector and collision geometry. | *Slow River* bars 2–4, SVG and Canvas, two simultaneous sung voices, A4 and Letter. |
| Beam, skip, forced sign and head marks | Use native beams, timed rests, accidentals, articulations and fingering modifiers on fresh notes in every view. TAB fret coordinates supply the physical lines for the native fingering formatter. An explicit TAB string label uses a circled digit because native `StringNumber` accepts pitched notes only. | Four eighths, hidden quarter, following G. Reordered two-string chord printed twice with a cue. |
| Mixed TAB endings | A native continuous volta spans bar boundaries but requires matching endpoint note classes. Look for a compatible event in both boundary bars. If one bar contains only rests and the other only frets, keep the row-fragment bracket with the authored ending ID and label on screen and paper. | Rest plus fret → fret uses the native span. Rest-only → fret-only exercises the fallback. |
| Free-end slides | A native continuous glissando requires two written endpoints. Keep the single-head modifier for the four free-end directions. Print uses the same modifier, including on a cue. | Four directions and a second unaffected chord string. [Slide tests](../../tests/open-slides.ts) |
| Timed text | Native `TextNote` supplies glyphs and metrics. The timed anchor still reserves interval and edge widths and exposes source-hit regions. Ordinary note labels now use native annotations in both paths. | Timed text with different durations from the notes and multiple boundary labels. [Parity cases](../../tests/grammar2-parity.ts) |
| Colours and hidden clefs | Use native styles for the stave, voice, note, ledger lines and chord annotation, and clear the native clef glyph after row-start clefs exist. This removes post-publication SVG recolouring and clef deletion. The native composition still allocates the hidden clef’s space. | SeaGreen stave, blue fret, crimson chord, white fret mask. Two systems with a hidden treble clef retain C4 and D4. [Colour tests](../../tests/colors.ts) |

## Sor acceptance passage

The eight-bar opening of Fernando Sor’s *Op. 35 No. 22* follows Glen Larsen’s Mutopia transcription of the N. Simrock edition, dated 18 August 2013. It retains the three source voices, written durations and opening fingerings. The VexTab adaptation assigns unspecified strings and uses the local renderer’s stem and beam policies. The excerpt and its adaptation are available under CC BY-SA 3.0. [VexTab source](../../guide/scores/sor-op35-no22.vextab) · [Mutopia score and LilyPond source](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1850) · [License](https://creativecommons.org/licenses/by-sa/3.0/)

The opening melody D uses finger 2 on string 2, fret 3. Both extracted parts retain that association. A separate reordered-chord case checks accidental, finger and accent ownership on each independently rebuilt note and cue. These fixtures run with the regular browser suite. [Part engraving tests](../../tests/part-engraving.ts)

```sh
npm ci
npm test
node issues/196/pictures.mjs dist/main.dev.js build/vt6-m1
```
