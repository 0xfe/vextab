# Expressive notation and playback

The acceptance passages use the same score text for the conductor, extracted parts and playback. The reference comparison and automated engraving checks are reproducible below. The project owner approved the Handy, Joplin and Sor passages after reviewing the attached scores. [Review scores and M3 comparisons](https://github.com/0xfe/vextab/issues/199#issuecomment-7064932813)

## Repertoire

| Score | Passage and editorial choices | What to read or listen for |
| --- | --- | --- |
| [W. C. Handy, *The St. Louis Blues*](../../guide/scores/handy-st-louis-blues.vextab) | First twelve sung bars after the introduction in the 1914 Pace & Handy edition. Includes the melody, its opening grace, and the first two printed underlays. Chord symbols and piano reduction are editorial. [Facsimile](https://commons.wikimedia.org/wiki/File:W._C._Handy_-_St._Louis_Blues_(1914,_Pace_and_Handy).pdf) | Follow “I hate to see” and “Been to de Gypsy” through the long syllables. The second verse sometimes changes syllable while the first holds. |
| [Scott Joplin, *Maple Leaf Rag*](../../guide/scores/joplin-maple-leaf.vextab) | Pickup, first strain and both endings. Based on Chris Sawer’s public-domain Mutopia transcription of the 1899 John Stark edition. The excerpt uses fixed clefs and a selection of expressive marks. [Edition, engraving source and MIDI](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=23) | At written bar 8, the upper voice moves onto the lower stave and retains its own rhythm. Play through the first ending, return after the pickup and finish with the second ending. The MIDI comparison checks 552 sounding heads, including their onsets and releases. |
| [Fernando Sor, Op. 35 No. 22](../196/sor-op35-no22.vextab) | Bars 1–8 of the M1 transcription. Glen Larsen’s engraving credits N. Simrock and is licensed CC BY-SA 3.0. Unspecified string choices are editorial. [Edition and license](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1850) | Follow the half-note melody over moving eighths. The bass holds through the first barline. The guitar’s paired TAB follows the same attacks. |

## Native controls

| Source | VexFlow 5.7 controls | Checks |
| --- | --- | --- |
| [Voice and harmony](voice.vextab) | Verse annotations, elision, anchored lyric and hyphen fragments, structured chord spelling, dynamic glyphs and continuous hairpins | Both C and B-flat transpose in Cm7/B♭. The result reads Dm7/C. One niente circle survives a forced break. The closing hyphen aligns to the destination syllable. |
| [Piano and rhythm](rhythm.vextab) | Per-note stave assignment, split chord, continuous and feathered beams, stacked tuplets, paired alternating tremolo | Compare the stem x coordinates. Count two beam fragments. The inner tuplet eighth occupies 1/18 of a whole note. Two written half-note tremolo endpoints share a half note of elapsed time. |
| [Guitar and percussion](techniques.vextab) | Continuous tied bend and glissando, TAB slide and named percussion map | The release belongs to the original attack on string 1. Only the chosen chord head slides. The triangular ride bell plays MIDI 53 on its part’s route. |
| [Public API regressions](../../tests/expression.ts) | Native grace groups, ornaments, editions, cue insets, two playback sessions | Principal, grace and ornamental notes stay within written time. A cue and a second view of the guitar add no sounding attacks. Both sessions stop at the end. |

The bundled 5.7.0 validator accepts a syllable anchor on an extender. VexTab also admits it on a hyphen, then supplies the final destination syllable’s measured coordinates to the native fragment. VexFlow draws the marks in SVG, Canvas and publication. The adapter checks its insertion point at build time. [Adapter](../../scripts/vexflow-publication-loader.cjs) · [Verse positioning](../../src/score/lead.ts)

## Reproduce

Use the repository’s pinned Node toolchain and Chrome. The comparison script accepts the downloaded MIDI as an optional argument and checks its SHA-256. Python and mido are used only for the independent reference comparison.

```sh
npm ci
npm test
node issues/199/inspect.mjs
uv run --no-project --with mido==1.3.3 python issues/199/check-joplin.py
```

The inspection writes six full white-background screenshots and their page, row and diagnostic reports under `build/vt6-m4/`. For before images pass an M3 browser bundle followed by `--before`. The comparison keeps the pitches and breaks, using the verse, chord and staff placement that M3 could express.

## Specialist follow-ups

| Smallest acceptance case | Native dependency |
| --- | --- |
| A two-bar ossia beginning after a rest and ending on the following system | Extend the single-measure publication cue to a continuous inset, with owned staff and source IDs. |
| A bass note with stacked 6/4 figures and an altered figure held into the next chord | Figured-bass accidentals, stacked alignment and continuation lines in the phrase solver. |
| A 3/4 part and a 2/4 part sharing page breaks only where their elapsed times coincide | Native independent bar grids and time-based pagination. Independent VexTab parts can already keep different local meters. |

These remain in the baseline inventory. [VexFlow specialist work](https://github.com/vexflow/vexflow/issues/387) · [VexTab inventory](../../docs/vt6-baseline.md)
