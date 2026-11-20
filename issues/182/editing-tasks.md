# Four editing tasks for grammar v2

Use the [grammar sketchbook](../../experiments/grammarv2/preview.html). From a built checkout, run `npm run serve` and open `http://127.0.0.1:8052/experiments/grammarv2/preview.html`. Build the preview bundle first with `npm ci` and `npm run build-dev` if needed.

## Try the tasks

Ask a guitarist and a pianist to try the tasks with the [language proposal](../../docs/grammarv2.md) available. Start with the prompts. Reveal the worked scores afterward. For each task, record the first spelling tried, the correction that made it work, and any result that looked or sounded unexpected. The prototype provides a written timeline and engraving for these examples.

1. **Enter a guitar phrase.** Play four quarter notes on the highest string, at frets 0, 2, 3 and 2. Then move just the third attack to the next string at fret 8 so the pitch stays the same in standard tuning. Which number did you change first?
2. **Finger a chord.** Put finger 2 to the right of the note at fret 2 on string 2 in a four-string A chord. Write the chord twice, reversing the order of the heads the second time. Does the finger follow the string?
3. **Edit an inner piano voice.** In 2/4, let the soprano play G4 and A4 over a held E4 in the same hand. Hold C3 in the other hand. Change only the E4 half note to two quarters, E4 and F4. Which clock did you expect the new duration to affect?
4. **Reuse a phrase.** Write the upper-hand figure C5 D5 E5 D5 in eighths. Use it in two bars above different held bass notes. Then change E5 to F5 once. Select the third attack in each bar and find the place to edit. Would you expect two written bars or a printed repeat sign?

## Worked scores

### 1. Move one guitar note

```vextab2
guitar { 0/1 2/1 8/2 2/1 | }
```

The third attack changes string. Its pitch stays G4 and the other three notes keep their quarter-note positions. [Original first-fret lesson](../../guide/scores/first-fret.vextab)

### 2. Keep the finger on the same chord head

```vextab2
meter 2/4
guitar {
  (2/2[finger 2 right] 0/3 2/4 0/5)
  (0/5 2/4 0/3 2/2[finger 2 right]) |
}
```

The indicated head moves from first to last in the source. Its string, fret and finger stay the same. This isolates the fingering task from the original lesson’s key signature. [Original chord workshop](../../guide/scores/chord-workshop.vextab)

### 3. Edit the alto independently

```vextab2
meter 2/4
piano {
  upper {
    voice soprano { G4 A4 | }
    voice alto    { E4 F4 | }
  }
  lower { :h C3 | }
}
```

Both upper voices attack on beats one and two. The lower hand still attacks once and sounds for the whole bar. [Piano guide examples](../../guide/features.html#piano)

### 4. Edit both written bars in one place

```vextab2
meter 2/4
pattern turn { :8 C5 D5 F5 D5 | }
piano {
  upper { times 2 { use turn } }
  lower { :h C3 | G2 | }
}
```

Each F5 is a distinct performed event with its own bar and event ID. Selecting either head points to the same two characters, `F5`, in the pattern definition. The two bass bars keep their own pitches. [Patterns and written repeats](../../docs/grammarv2.md#patterns-and-printed-repeats)

## What has been checked

Run `node --test issues/182/editing-tasks.test.mjs` to check the worked answers against the compiler. These checks establish the musical results and editing behavior. Observations from a guitarist and a pianist are still needed before settling the spellings.
