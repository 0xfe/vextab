# A second grammar for VexTab

**Proposal for the next major release.** Keep the compact fret/string pair. Give each voice a sequence, each chord one attack, and each technique a typed attachment. Use named musical phrases and bounded repetition for reuse. A shared score model should drive engraving, reading, parts, and playback.

A first guitar score fits on one line. Play four quarter notes on the high E string in standard tuning.

```vextab2
guitar { 0/1 2/1 3/1 2/1 | }
```

This is executable prototype syntax. The comparable current example starts with `tabstave notation=true`, then `notes :q 0-2-3-2/1 |`. Writing the string on each note costs a few characters inside the phrase. It makes moving a single note to another string a local edit. The braces give the outer score and reusable phrases the same shape. [Existing first-fret lesson](../guide/scores/first-fret.vextab)

## What to try

Select the preview with the second argument to the public parser. Both `vextab/parse` and `vextab/browser` export this API. Omitting the option selects v1.

```js
import { parseScore } from 'vextab/parse';

const score = parseScore('piano { upper { :w C4 | } lower { :w C3 | } }', { language: 2 });
const upper = score.parts[0].staves[0].voices[0];
const bar = upper.measures[0];
const notes = upper.events.slice(bar.start, bar.end);
console.log(notes[0].duration); // 1/1 of a whole note
```

Run the same reader from the repository root with the Node version in `.nvmrc`. The CLI and standalone grammar tests need no installed dependencies.

```sh
echo 'guitar { 0/1 2/1 3/1 2/1 | }' | node experiments/grammarv2/cli.mjs
node --test experiments/grammarv2/compiler.test.mjs
```

The CLI prints the meter, parts, staves and voices. Each event has an exact onset within its bar, written and scaled durations, head and event marks, original source offsets and an expansion trace. Paste the examples into the visual preview after running `npm run build-dev` and `npm run serve`. [Open the local preview](http://127.0.0.1:8052/experiments/grammarv2/preview.html) · [Parser source](../src/score/grammar2/compiler.mts) · [ScoreV2 types](../src/score/grammar2/model.ts)

Fences labelled `vextab2` in this document are executable and exercised by the test suite. Fences labelled `text` illustrate the wider proposal. The sketchbook draws each instrument with the public renderer. Click a note or a timeline event to select its authored source, including notes expanded from patterns.

### Reading a v2 result

`ScoreV2` is a serializable snapshot of the source revision. `parts` contain named staves and voices. Each voice has one ordered array of events, measure slices into that array, and spans joining expanded event IDs. Hammer spans identify both chord heads. Tuplet spans retain their written ratio and endpoints even across a barline.

Use `source.slice(...event.range)` to find an authored attack. Heads, marks, barlines and explicit duration tokens also have source ranges. Expanded copies have distinct IDs. Their `trace` lists enclosing invocations from the outside in. The same input and language produce the same IDs; keep the source revision with any selection.

Catch `ScoreV2Error` for v2 syntax, time, alignment or resource errors. Its `range` contains half-open UTF-16 offsets ready for `setSelectionRange`. Its `line` and `column` start at one, and its `trace` points back to a failing pattern invocation. Pass the same parsed score to the screen, printer and player. Rendering selects the first instrument by default. Set `partIndex` to display a different instrument. The player schedules all instruments together unless you select one.

```js
const score = parseScore('piano { upper { :w G4 | } lower { :w C3 | } }', { language: 2 });
renderScore(screen, score, { width: 640, renderer: 'svg' });
renderScorePart(paper, score, 'left');
const player = new Player(score, { controls, playback });
```

For an editable embed, set `data-language="2"` and `data-editor="true"` on the source element. See [milestone 3 verification](../issues/182/parity.md) for the comparison scores and output-specific limits.

### Working with historical scores

```js
const pickup = parseScore('meter 2/4 pickup 1/8 staff { :8 G4 | :q A4 G4 | }', { language: 2 });
```

| Intent | V2 spelling |
| --- | --- |
| Change key for every voice of a part | Declare `key D key G at 4` at the beginning of the part. |
| Change the key, chord names, frets and diagrams together | Declare `transpose +2` before the first part. Inside a voice, `transpose +2 { … }` moves a phrase and keeps the surrounding signature. Use `octave +1 { … }` for a playback-only shift. |
| Play a shaped guitar chord | Put `[symbol "Am", frame (x 0 2 2 1 0) barre=2/4..3]` after the chord. Diagram strings run from low to high. |
| Mark a guitar technique | Attach `[hammer]`, `[pull]` or `[slide]` to the destination head. Use `[tap]`, `[vibrato wide]`, `[stroke down]` or `[brush up]` on the attack. `palmMute strings(5 6) { … }` covers a phrase. |
| Sustain or connect notes | Use `[tie]` on a destination head. Across an intervening rest or another voice, use the same lowercase name in `[tieStart name]` and `[tieEnd name]`. Use `slur { … }` for a visual connection. |
| Set rhythm, grouping and boundaries | `slash` is an unpitched rhythm. `B4[slash]` has a pitch. `rest[line -1]` places a rest. Use `beam { … }`, `groupBeats (3 3)`, `break system`, `repeatStart`, `bar repeatEnd`, `bar double` and `bar final` as needed. |
| Control ink and labels | Use part-level `ink navy`, attack-level `[ink crimson]`, or `[label "P.H." below font "Georgia" size 14 style italic ink teal]`. |
| Set engraving or playback defaults | `voice bass stem down { … }` sets a voice’s stem direction. `layout { width 640 rowGap 36 }`, `measureNumbers on`, and `play { tempo 84 instrument 24 }` go before the first part. |

Declare changes of tuning, ink or meter visibility at a bar boundary in the part header. For example, `tuning dropD at 3` retunes the same strings from bar three. `ink default at 2` returns the staff to its default colour, and `display meter shown at 3` prints the meter at that boundary.

A text lane belongs inside its instrument after the music. Its durations are independent of the notes. Change its font, ink, alignment or staff line where the change should begin. A `start` or `end` marker sits on the bar boundary.

```text
meter 2/4
staff {
  :h C4 |
  text counts font "Georgia" size 14 line 10 {
    start sign coda :8 "One," "and" ink crimson "three" "four" |
  }
}
```

## What a musician has to remember today

Three existing phrases expose more friction than an unfamiliar command name does.

| Task | Today | Design consequence |
| --- | --- | --- |
| Add a fingering and an accent to a chord | An annotation string refers back to a head number. The author must count heads and decode position, modifier type and value. | Put fingerings next to the head they describe. Put a chord-wide accent after the closing parenthesis. |
| Add a tuplet before an existing note | A trailing `^3,2^` reaches backward across two events and changes their timing. A new event between them changes the group. | A block encloses the intended music. Its ratio and written durations together determine elapsed time. |
| Sustain a bass under a moving melody | It already works with two voices. The source uses another `voice` declaration in a stave that also doubles as a system break. | Give each voice a clock, name, and lexical scope. A printed line break belongs to layout. |

Fixed-layout VexTab and the measure-based compiler share the Jison lexer. Their later passes implement different subsets. The language uses newline-dependent lexer states, several overlapping meanings for `#`, string conventions inside `$…$`, and another command language inside `!…!`. These constraints show up in the tutorial, the two-voice bossa, the 12-bar lead sheet and the tests for mixed-duration tuplets. [Grammar](../src/vextab.jison) · [Fixed compiler](../src/vextab/VexTabParser.ts) · [Measured compiler](../src/score/parse.ts) · [Bossa](../guide/scores/bossa.vextab) · [Lead sheet](../guide/scores/slow-river.vextab) · [Regression corpus](../tests/baseline/music.mjs)

### Three designs considered

| Design | Same three attacks | Tradeoff |
| --- | --- | --- |
| Extend the current suffixes | `6/4[f2] h7/4[f3] 0/2[f3:r, >]` | Fast for someone who knows the vocabulary. The contributor’s #121 example demonstrates a worthwhile shorthand. Further one-letter commands compete with note names and each other. |
| Build music with function calls | `pick(6,4).finger(2) hammer(7,4).finger(3) pick(0,2).finger(3,right).accent()` | Names are discoverable. Seeing the rhythm of a long line gets harder. Method chains invite assumptions about mutation and arbitrary code. |
| **Compact attacks and named blocks** | `6/4[finger 2] 7/4[hammer, finger 3] 0/2[finger 3 right, accent]` | Reading pitches and frets stays quick. A less common technique costs a word and can have named arguments. The three marks stay attached when one moves the note. |

The proposed default places the finger label to the left and an accent above the attack. Here `right` means the label’s position. The hammer connects the two frets on string four. This phrase, including the eighth/eighth/quarter rhythm, is the concrete #121 comparison. [Contributor's original example and spike](https://github.com/0xfe/vextab/issues/121)

```vextab2
meter 2/4
guitar {
  :8 6/4[finger 2] 7/4[hammer, finger 3]
  :q 0/2[finger 3 right, accent] |
}
```

## Lessons from other notation systems

**LilyPond makes sequences and simultaneous music composable.** Two phrases can have different subdivisions yet occupy the same time, whether they share one staff or sit on separate staves. In VexTab a voice can own rhythmic order and a staff can own placement. A `piano` part below declares both directly. Absolute octaves make a copied phrase keep its register. [LilyPond on music expressions](https://lilypond.org/doc/v2.24/Documentation/learning/music-expressions-explained)

**Repetition has two musical jobs.** An author can generate several written copies of a passage or ask a performer to revisit a single printed passage and take a different ending. LilyPond exposes both. Choose distinct words for these operations and keep a performance traversal separate from written event IDs. [LilyPond on repeats and alternative endings](https://lilypond.org/doc/v2.24/Documentation/notation/long-repeats)

**A physical gesture carries information beyond pitch.** A string assignment changes how a guitar phrase is played even when it sounds the same. A diagram also has its own orientation and fingering. Keep the authored string, capo and fret alongside the sounding pitch. Keep a diagram as an attachment. [LilyPond on fretted strings](https://lilypond.org/doc/v2.24/Documentation/notation/common-notation-for-fretted-strings.html) · [MusicXML tablature tutorial](https://www.w3.org/2021/06/musicxml40/tutorial/tablature/)

**MusicXML carries several layers of time.** Written note value and dots, elapsed duration, tuplet ratio, ties, voice membership and staff placement are separate facts. Its serialization moves a measure cursor backward and forward to encode concurrent lines. A VexTab author can instead write a complete voice in reading order. The compiler aligns its rational onsets with the other voices. Keep visual slurs and playback sustains independently identifiable. [MusicXML notation basics](https://www.w3.org/2021/06/musicxml40/tutorial/notation-basics/) · [Time modification](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/time-modification/) · [Written ties](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tied/)

**Unpitched heads and directions deserve identities.** The vertical position of a snare head and the instrument it denotes belong in different fields. Similarly, a direction such as a crescendo has a timing anchor, staff and placement. That leads to separate head, onset, boundary and span attachment types. The external formats inform the feature inventory. File interchange stays outside this library. [MusicXML percussion tutorial](https://www.w3.org/2021/06/musicxml40/tutorial/percussion/) · [Directions](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/direction/)

## Reading and writing the core

Whitespace and newlines separate words. Braces delimit structure, parentheses group simultaneous heads, and square brackets attach marks. `//` starts a comment through the end of the line. Use signed integers for semitones, positive integer ratios for musical time, and quoted strings for lyrics, labels and font names in the full language. Strings represent literal text.

The following sketch describes the executable subset. In the grammar, `head` means a named pitch, physical position, or drum instrument, `duration` is a colon-prefixed rhythmic value, and `ratio` is actual:normal. A lowercase name begins with a letter and can contain digits or underscores. A part with one unnamed voice can contain the music directly. A piano declares both hands. Each hand can contain one or several voices. A document may contain multiple parts.

```ebnf
document = { meter | pattern | part } ;
meter    = "meter" fraction ;
pattern  = "pattern" name "{" sequence "}" ;
part     = ("guitar" | "staff" | "drums") "{" voices "}"
         | "piano" "{" "upper" "{" voices "}" "lower" "{" voices "}" "}" ;
voices   = sequence | voice { voice } ;
voice    = "voice" name "{" sequence "}" ;
sequence = { duration | attack | "rest" | "skip" | "|" | "use" name
           | "times" count "{" sequence "}" | "tuplet" ratio "{" sequence "}" } ;
attack   = head [marks] | "(" head [marks] { head [marks] } ")" [marks] ;
marks    = "[" mark { "," mark } "]" ;
mark     = "finger" digit [side] | "accent" | "hammer" ;
```

- **Head.** `C4`, `Bb3` and `F#5` name pitches. `7/3` names fret 7 on string 3, counted from the highest string. `x/6` is a dead strike. `kick`, `snare` and `hat` name kit instruments. A slash between two numbers in a head always means fret/string. A meter requires the preceding keyword. A `rest` prints a rest and advances time. A `skip` advances time invisibly.
- **Rhythm.** Each voice starts with quarters. `:h`, `:q`, `:8` and `:16` change the written duration for following events. One or two dots augment it. `:8.` lasts 3/16 of a whole. A chord advances the clock once. A barline checks exact elapsed time and resets the local onset. Its voice keeps the previous duration.
- **Scope.** A `times` or `tuplet` block inherits the entry duration. Every iteration starts with that same value. The caller resumes its own duration after the block. A pattern starts in quarters on every use. Rewriting a bass rhythm cannot change the register or duration in the melody.
- **Meter.** The default is 4/4. Before the first part, declare `meter 2/4`, `pickup 1/8`, or a later change such as `meter 3/8 at 4`. Use `meter common`, `meter cut`, or `meter 3+2/8` for a displayed sign. Measured voices fill the same bars. Use `fragment { :8 C4 D4 E4 }` for an incomplete phrase and `fragment {}` for a blank staff.
- **Pitch in the full design.** Bare `F4` means the fourth-octave F degree in the current key. `Fn4`, `Fb4` and `F#4` choose an exact alteration. A written key change affects every voice on that staff. A change to a preceding attack in another voice cannot respell or retune the input. The engraver manages bar accidental memory and simultaneous conflicts and supplies necessary printed cancellations. `[showSign]` and `[courtesy]` preserve deliberately explicit and cautionary signs. Migration resolves pitches that v1 inherited from earlier notes before generating v2 text.
- **Attachment.** In `(5/2[finger 2] 7/3[finger 3])[accent]` the fingers belong to physical heads, and the accent belongs to the attack. Attachment kinds are validated after parsing. A source selection on a finger can lead to the specific head. A label on a chord survives pitch-order sorting.

### More than one clock

The two voices below start together. The bass sounds twice and the melody sounds four times. There are no placeholder attacks. This is also the answer to the fingerpicking use case in #153. The same V1 music uses `tabstave notation=true time=4/4 voice=top`, a `notes` line of quarters, then `voice voice=bottom` and a second `notes` line of halves. [Two-voice VexTab study](../guide/scores/bossa.vextab)

```vextab2
guitar {
  voice melody { 0/1 1/1 3/1 1/1 | }
  voice bass   { :h 0/5 2/4 | }
}
```

In the piano example, a rhythmic figure begins in the upper staff while the bass hand holds a chord. The upper voice uses the pattern twice. The lower staff still contains one half note per bar. The `piano` grouping tells the layout adapter to share barlines, beat columns and a brace across the two staves. The V1 grand-staff form uses `piano time=2/4` and hand assignments on voice declarations. Each hand here can also host named independent voices, such as soprano and alto.

```vextab2
meter 2/4
pattern turn { :8 C5 D5 E5 D5 | }
piano {
  upper { times 2 { use turn } }
  lower { :h (C3 G3) | (G2 D3) | }
}
```

A kit backbeat and a triplet figure each fit one bar of 2/4. The kit has four eighth-note attacks. The melody has three triplet eighths and one quarter. The first three melody onsets are 0, 1/12 and 1/6 of a whole note. Their written value remains an eighth.

```vextab2
meter 2/4
drums { :8 (kick hat) hat (snare hat) hat | }
staff { tuplet 3:2 { :8 G4 A4 B4 } C5 | }
```

## Expressive notation and VexFlow

The following is a **design coverage map**. The examples above and the parity ledger describe the implemented subset. This table assigns the remaining current capabilities a spelling and a place in the score model. Acceptance for a production compiler comes from translating and comparing real scores.

| Existing musical intent | Proposed authoring form or rule | Required score data |
| --- | --- | --- |
| Fixed rows, wrapped staff/tab, multiple staves, independent voices, piano group | `guitar`, `staff`, `piano`, `drums`. `view tab`, `view notation`, `view both`. `break system` at a bar or an explicit fragment boundary | Part, staff and voice IDs, shared measure grid, system-break hint and optional fragment length |
| Meter, pickup, hidden signatures, key changes, clefs, additive beat groups | `meter 6/8`, `pickup 1/8`, `display meter hidden`, `key Eb`, `clef bass`, `groupBeats (3 2 2)` | Per-boundary staff/meter state, explicit grouping separate from time signature |
| Open strings, alternate tuning, custom string count, capo, named pitch with a chosen fret, octave shift and transpose | `tuning dropD` or ordered pitches, `capo 2`, `7/3[write D5]`, `octave +1 { … }`, `transpose +2 { … }` | Written pitch, sounding pitch, original tuning, physical string/fret. Preserve the features3 same-string transposition policy and diagnostics |
| Rests on selected lines, invisible rests, dead hits, slash notation, unpitched hits | `rest[line -1]`, `skip`, `x/6`, `slash`, `(kick hat)` | Distinct rhythmic event types, optional rest line, percussion identity and display head |
| Ties on individual or reordered heads, slurs across attacks, explicit beams, stem direction and dots | `tie` joins compatible heads, `slur { … }` connects a phrase, `beam { … }` sets a visual group. `stem up` and `beamRests on` are scoped settings | Tie endpoints with head identity and sustained sound. Slur/beam spans with written endpoints. Keep explicit labels for ties across a rest in another voice |
| Tuplets, mixed values and labelled ratios | `tuplet 3:2 { :q C4 :8 D4 }` scales two written events by 2/3 | Written value/dots, elapsed ratio and bracket/number visibility. Capturing a group by scope supports varying event counts |
| Hammer, pull-off, tap, measured and chained slides/bends, pre-bend release, vibrato, brushes and rolls | `[hammer]`, `[pull]`, `[tap]`, `[slide]`, `[slideIn below]`, `[slideOut above]`, `[prebend +2 release]`, `[bend +2 rise=1/2 hold=3/4 release=1]`, `[vibrato wide]`, `[brush up]` | Physical string, picked versus connected attack, ordered bend curve, directional open endpoint. A bend on one head leaves its chord partners alone |
| Palm mute across selected strings, fingerings, fingering position, circled string numbers, strokes and accents | `palmMute strings(5 6) { … }`, `[finger 3 right]`, `[stringNumber 3 above]`, `[stroke down]`, `[accent]` | Head or attack target, typed placement and style, span for the mute. Extend finger values to classical right-hand names |
| Chord names, slash bass, fret frames, barre, timed text, lyrics, hyphens and extenders | `[symbol "Dm7/A"]`, `[frame (x 0 2 2 1 0) barre=2/4..3]`, `[lyric "riv" hyphen]`, `[lyric "sea" extend=2]`. `text bassLine { :h "Am" "G" \| }` | Distinct structured harmony, diagram, syllable/verse and lyric-end events. A text lane has its own onset, line, align, strict/smooth and zero-width boundary marks |
| Accents, staccato, fermata, ornaments, dynamics, arbitrary labels, style and colors | `[staccato]`, `[fermata above]`, `[dynamic mf]`, `[label "P.H." style=pinch]`, `[ink crimson]` and named `style` declarations | Typed marks by target and value. Legacy font face, weight, size, annotation position, chord label color and score/attack ink map to properties. Literal text retains punctuation |
| Single/double/end bars, both repeat directions, endings, rehearsal labels, coda/segno | Ordinary `\|`, `bar double`, `bar final`. `volta 2 { … } ending 1 { … } ending 2 { … }`, `mark "A"`, `sign coda` | Written shared boundaries, ending ranges and finite performance traversal. A drawn repeat mark can also be given a purely visual boundary |
| Layout controls, rhythm on tab, appearance, playback and print | Settings have named owners including `layout { … }`, `tabStyle { … }`, `play { tempo 90 instrument 24 }`, `edition { … }` | Score data with typed width/scale, spacing, fonts, accidental and beam policy, tab stems/direction, measure numbers. Host chooses layout width, SVG/Canvas, editor, playback plugin, selected part/voice and print page |
| Source navigation, revision-aware editing, parts and access | Every authored and expanded head/onset/span has provenance. Each projection maps its rendered IDs to the same event | Preserve UTF-16 ranges, source revision, keyboard reading labels, and locations on printed parts. Retain last valid preview on diagnostics |

The current `bossa`, `slow-river`, `drop-d-turnaround` and tutorial illustrate these combinations more extensively than isolated syntax fixtures. A legacy chained chord can encode successive positions on one string inside a single parenthesis. Migration must recover its actual attacks and write explicit sequences, with simultaneous heads grouped at each onset. A v2 chord can require one physical position per string. [Classical and tab articulations](../src/artist/ArticulationBuilder.ts) · [Tutorial and timed text](../doc/tutorial.html) · [Measured commands](../src/score/commands.ts) · [Transposition](../src/score/transpose.ts) · [Colors](colors.md)

### Named spans and new engraving capabilities

A named span can cross a bar, staff or system. Mark endpoints in the music. Resolve them to IDs after all voices and pattern instances exist. In the following proposed piano phrase, `id` on G4 names one onset. `id` inside a multi-head chord would name only that head. The pedal and hairpin have different endpoints. The bass hand remains independently playable.

```text
meter 3/4
piano {
  upper { G4[id entry] A4 B4 | :h C5[id crest] :q G4[id lift] | }
  lower { :h. (C3 G3) | (F2 C3) | }
  span crescendo from entry to crest
  span pedal from entry to lift
}
```

- A tie matches the same written pitch and string where known. It joins the sounding duration. A slur shapes a phrase. All independently picked notes underneath it keep their attacks. A chord-head tie uses explicit head IDs when unison or reordering makes the match ambiguous.
- A span written inside a pattern binds to endpoints in that invocation. Named endpoints inside two uses of the same pattern have different instance IDs. An outer score can name a use and qualify an endpoint, e.g. `answer.crest`. An unqualified ambiguous name is a diagnosis at the reference.
- A keyboard part can show simultaneous voices with separate stems, cross-staff material and pedalling. A future cross-staff projection would annotate an event's display staff while keeping its voice, written rhythm and source identity intact.
- Add one public typed feature at a time. For a hairpin, define its name, valid anchor kinds, endpoint and placement rules, drawing adapter, text description, print projection, and any playback effect. Unsupported effects on a chosen backend get a diagnostic at the mark. Hosts keep supplying trusted rendering and playback code through ordinary APIs. Score text consists of data.

VexFlow **5.6.0**, pinned here, already has shared staff groups/barlines, split chords, span fragments across systems, pedal, trill, ottava, hairpin, tuplet and palm-mute spans, percussion maps, navigation and independent publication. For future grace groups, ornaments, tremolos and multimeasure rests, verify each corresponding screen, print and timing adapter before adding the mark to the public catalogue. The current VexTab publication path explicitly rejects some material, including unsupported explicit-sign projections and diagrams. Rendering conformance must be measured per backend. [Continuous layout](https://github.com/vexflow/vexflow/blob/5.6.0/src/continuouslayout.ts) · [Span kinds and fragment drawing](https://github.com/vexflow/vexflow/blob/5.6.0/src/continuousspan.ts) · [Instrument profiles](https://github.com/vexflow/vexflow/blob/5.6.0/src/instrumentprofile.ts) · [Publication](https://github.com/vexflow/vexflow/blob/5.6.0/src/publication.ts) · [VexTab projection](../src/score/layout.ts)

As an extension example, reserve qualified mark names such as `[ornament.turn above]`. A mark definition specifies its target (head, attack, boundary, or span), argument types, units and legal values. The compiler can then locate an invalid direction, a wrong endpoint or a missing print implementation before drawing. A core descriptor can map a pedal line to `ContinuousSpan`, a tremolo to a stem modifier and a grace passage to a pre-attack group whose written time belongs to the anchor. Implement a typed adapter and editor help together. This route can expose new VexFlow primitives without making their JavaScript constructor signatures part of the language.

## Expansion, diagnostics, and limits

### Patterns and printed repeats

**Ordering.** A `pattern` is an immutable declaration in the score. `use` can name a previously completed declaration only. This gives a directed acyclic dependency graph by construction, including unused definitions. `times 3 { … }` emits three written copies with separate event IDs. A `volta` instead emits its body once in the written score and schedules bounded visits in the proposed performance plan. Endings select passes by ordinal. Give every traversal a separate visit budget and report the repeat that exhausts it. Start with structured repeats and named endings. Navigation signs such as segno can be engraved independently until their playback semantics are specified.

The following proposed repeat prints a first and second ending. Its four performed bars are body, first ending, body, second ending. Only three written bars exist. A fixed-count `times 2` of the body alone prints two copies. At a shared repeat boundary the same traversal drives every voice and part.

```text
meter 2/4
staff {
  volta 2 { :q C4 D4 | }
  ending 1 { :h E4 | }
  ending 2 { :h C4 | }
}
```

### Resource and editor behavior

**The prototype enforces these limits.**

| Quantity | Maximum | Failure example |
| --- | ---: | --- |
| Source size and tokens | 64 KiB UTF-8, 8,192 tokens | Huge pasted text is rejected before building the tree |
| Syntactic and expansion depth | 24 blocks or expansion frames | Deep nesting and long chains of earlier patterns are bounded |
| Repeat count and tuplet ratio | Literal counts 1–32 and ratio operands 1–16 | `times forever` points to the count |
| Expansion work and output | 32,768 node/iteration steps, 4,096 timed events per document | Nested repetition of even an empty phrase spends work. All parts share the budget |
| Chord size and rational arithmetic | 16 heads, reduced numerator and denominator at most 2,147,483,647 | Extreme nested tuplets yield a located fraction-limit error |

A parser with no general loop can still expand exponentially. The compiler spends work **before** descent, each iteration, and output allocation. BigInt products are reduced and checked after every timing operation. Names, keywords and literal values are the available operands. A score cannot call a host operation, fetch another score or run JavaScript. The public implementation also needs page/system/dimension limits, cancellation of stale editor jobs, bounded performed visits and a render budget independent of parser limits. Existing VexTab documents that the current parser/renderer run synchronously and have no built-in score-length bound. [Current security and embedding notes](../SECURITY.md)

**Editing a reused phrase.** The CLI records half-open UTF-16 character offsets, including CRLF exactly as typed. Identical written attacks in two copies have distinct occurrence IDs. In the piano example, selecting the second D5 of the second copy offers the D5 in `pattern turn` and the `use turn`/iteration frame that placed it there. Editing the definition changes both copies. A proposed editor action *make this occurrence local* would expand just that source invocation before the edit. Do not silently edit every occurrence from a transient rendered ID. Bind selections to the exact source revision. A parse error retains that revision's range and the previous valid engraving can remain visible.

**Example diagnostic.** Put `pattern short { C4 | }` before `staff { use short }` in the default 4/4 meter. The primary location is the premature barline. The message reports `1/4` against `4/4`. The trace points back to the invocation. A missing `}` points to end of input. Unknown features should offer the nearest registered name and its legal attachment sites in the editor.

## From prototype to release

1. **Agree on the five writing decisions.** Fret/string order, explicit register, named scoped durations/voices, typed attachments and finite pattern use determine most examples. Ask a tab author and a pianist to enter the first-fret phrase, add a head fingering, edit an inner voice and move a repeated phrase. Record mistakes and correction steps. The comparisons above come from reading the existing scores and running the prototype. User testing is still needed.
2. **Prove musical equivalence.** Translate all guide scores, tutorial snippets, current features and regression fixtures to paired versions. Compare meter, written heads, physical strings, tie endpoint identity, exact durations, simultaneous starts, key changes and playback pitches. Include #121 fingering/placement, two grand-staff hands, the open slide's single attack, transposition around a capo, unpitched kit hits, mixed tuplets, and lyric spans. Preserve the tests for stale selections, responsive breaks, SVG/Canvas and independent parts.
3. **Use one typed score representation and multiple adapters.** Retain authored tokens and trivia in a revision-indexed syntax tree. Lower to parts → staves → voices → measures → attacks/heads/spans. Give every variant source ranges. Resolve keys, ties and physical playing instructions once. Feed that model to a fixed engraver, a flow/publication adapter, a performance scheduler and reading navigation. During transition, emit a feature/backend capability diagnostic for every missing projection. The public parser and score renderer implement the first part of this design. The parity ledger records the qualified score families and publication diagnostics.
4. **Select the major version explicitly.** Offer a versioned parser entry or `parseScore(source, { language: 2 })` during previews. A new major may choose v2 as its default. Versioning belongs to the host or document header. Guessing from the first symbol makes a broken v2 edit accidentally parse as another language.
5. **Migrate authored scores with an explicit tool.** Parse v1 using its own semantics, then emit canonical v2 and a change report with source ranges. Preserve literal signs, derive the real attack order of grouped legacy frets, name the target of each backward annotation, and resolve timed text positions. Flag malformed-but-accepted fragments, unsupported output effects and ambiguous defaults for review. Provide a per-score diff before replacing user text. A v1-to-v2 migration of this library's source format is separate from importing music files.
6. **Set the release gate.** Publish a capability table for fixed SVG/Canvas, responsive SVG, printed parts, navigation and playback. Every currently documented feature needs a translated fixture and either matching observable behavior or an explicit, reviewed major-version change. Grow the syntax for new VexFlow features only after their real scores work. Keep the prototype available for comparison while qualifying the replacement compiler.
