# Writing technical documentation

Good technical documentation helps readers understand what they can do, how to do it, and why a particular approach works. The amount of background a reader needs depends on their experience. A JavaScript developer may be comfortable with arrays but need an explanation of a musical voice, while a musician may recognize a tied chord immediately and need help identifying its individual notes in code.

## Titles, subtitles, and opening paragraphs

Use the title to name the subject and the subtitle to tell readers what the page covers. Someone scanning the tutorial index should be able to decide whether to open a lesson without already knowing its examples. Details about the exercise, prerequisites, or the order of later lessons usually fit more naturally in the body.

For a lesson titled **EasyScore, VexTab, and the native API**, a subtitle can be as simple as “Three different ways to render music notation with VexFlow.” Middle C is a useful example for the comparison, but it plays no part in deciding whether the lesson is relevant.

The opening paragraph should get straight to the subject. When a page compares several approaches, introduce them together, explain when each is useful, and then tell readers which one the tutorial follows. For example, the comparison lesson could open with the following overview.

> Depending on the application you’re building and how much control you need over the score, you can render notation with EasyScore, VexTab, or the native API.
>
> **EasyScore** lets you describe notes and chords with compact strings in JavaScript. It works well when your application generates the music or needs to attach markings to individual notes.
>
> **VexTab** lets you write notation as text and render it without writing any code. It’s a convenient choice for a guitarist who wants to put a passage on the page by entering strings, frets, and durations.
>
> **The native API** gives you direct control over how VexFlow constructs, formats, and draws the score. Use it when you need to position elements yourself or customize how a passage is engraved.
>
> The rest of this tutorial focuses on EasyScore. To work with notation text, follow the [VexTab tutorial](https://vexflow.com/vextab/guide/). For more control over drawing and layout, see the [Native API Guide](https://vexflow.com/guide/#lesson/native-lifecycle).

A page about a specific task can open with the task itself. For example, “A flutist needs a part containing only their own line, while the conductor needs to see where both flutes play together. You can produce both editions from the same four measures.” The reader now has a reason to learn about part extraction and a way to judge the two resulting scores.

## Sentence length and paragraph flow

Keep related thoughts together when their relationship helps the reader understand the subject. Words such as _because_, _when_, and _so_ often carry technical information because they explain why an operation matters, when a setting applies, or what a change will produce. A short sentence works well for a result or an instruction that deserves a pause. A succession of short sentences can leave the reader to work out how the facts connect.

Consider the instruction “Attach the accidental. Format the voice. The sharp takes up space.” All three statements are relevant, but the reason for the order is easy to miss. “Attach the accidental before formatting the voice so the formatter can reserve space for the sharp beside the notehead” gives the reader both the procedure and the reason in one sentence.

A sentence has usually grown too long when it starts answering a second question. In the accidental example, the next question might be which head receives the sharp when the note is a chord. Give that decision its own sentence or paragraph, where there is room to explain the index and show the result. Use the reader’s ability to follow the explanation on the first pass as your guide to sentence length.

## Introduce concepts in the order readers need them

Begin with something the reader can recognize, then introduce the term and the notation that describes it. “Separate events with commas” is difficult to follow before the reader knows what an event represents or why two pitches might need a separator. A description of what the musician plays makes the syntax easier to understand.

> To hold middle C for two beats and then play G for the next two, write `C4/h, G4/h`. Each `/h` gives the pitch a half-note duration, and the comma places G after C. If the player should sound both pitches together for two beats, write `(C4 G4)/h`.

Use the same care with words that have both musical and programming meanings. A voice is a musical line with its own rhythm. VexFlow represents that line with a `Voice` object, which keeps track of the durations of its notes and rests. Once the reader understands that relationship, you can refer naturally to the upper voice in the score and use the exact identifier when discussing the code.

## Build a sequence of examples

Choose a first example small enough that the reader can account for everything it does. In later examples, keep enough of the original music and code that readers can recognize what changed. A rhythm lesson, for example, can develop a single measure of 4/4 in three steps.

1. Start with `C4/w` and count four beats under the single open notehead.
2. Replace it with `C4/h, G4/h`. The measure still lasts four beats, but G now begins on beat three.
3. Change the first half note to `(C4 E4 G4)/h`. The three pitches share the first two beats, so the final G enters at the same point as before.

The second example establishes the rhythm that makes the third one easy to read. A beginner can see three heads on the first beat and understand why they take only two beats together. Once the reader has that experience, a table of duration codes becomes a useful reference.

Place each editable example beside the passage that explains it. Before the editor, give the reader a specific place to look, such as the two half notes with upward stems in a two-voice score. After the editor, explain why the second upper note lines up with the third lower note. Although the two voices have played different numbers of notes, both have reached beat three. Referring to a particular note or beat also works when a phone screen cannot show the prose and the whole score at once.

## Explain what the code supplies and what VexFlow does

Call attention to a default when it explains something the reader can see. In `C5/q, D5, E5`, the author supplies a duration only for C, and EasyScore carries that duration forward to D and E within the same string. That detail accounts for all three quarter notes in the drawing and tells readers what to expect if they change the first duration.

Comments are most useful when they explain a decision someone might otherwise undo while editing the example. In a triplet example, the comment belongs next to the call whose position matters.

```js
// Apply the triplet timing before the voice counts the measure.
score.make.tuplet({ notes: group, options: { numNotes: 3, notesOccupied: 2 } });
```

The surrounding paragraph can explain the arithmetic. Three ordinary eighth notes occupy a beat and a half in 4/4, while the same three eighth notes played as a triplet occupy one beat. The voice needs the adjusted durations when it checks whether the measure is complete.

Make it clear what an example needs in order to run. The guide editor supplies a drawing element, dimensions, and loaded fonts, all of which a reader starting with an empty HTML file will need to provide. When showing a fragment, say where it belongs and link to a complete example the reader can run independently.

## Give exercises a result the reader can check

An exercise should give the reader a specific change to make and enough information to tell whether it worked. “Experiment with beaming” gives little direction, whereas a change from 2 + 2 + 3 to 3 + 2 + 2 in a 7/8 measure gives the reader something to predict. The first beam should now join three stems, and the bar should still contain seven eighth notes.

Choose a check that suits the task. For a screen reader example, inspect the event label and its onset in the output. For a printed part, compare the last bar on one page with the first bar on the next. Once readers have verified a guided edit, they have a starting point for trying a variation of their own.

When an edit can produce an error, explain how to interpret the symptom and recover. Adding a fourth quarter note to a strict 3/4 voice exceeds the time available in that measure. If the passage is meant to stay in 3/4, removing the extra note restores the bar. If the intention was to write four beats, update the voice meter and the printed signature so the program and the player count the same measure.

## Match the detail to the page

| Page               | What the reader needs                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Tutorial           | Enough background to understand the task, worked examples in a useful order, and an exercise with an observable result. |
| API reference      | Precise inputs, units, accepted values, defaults, return behavior, and any conditions that affect the result.           |
| Setup instructions | The required tools and files, commands in execution order, and a recognizable sign that the installation works.         |
| Troubleshooting    | A symptom the reader can identify, a way to distinguish likely causes, and a repair they can verify.                    |

Link to further reading when the next question arises. After a reader has aligned one lyric syllable with each note, a link explaining how to extend a syllable over several notes has a clear purpose. Descriptive link text helps the reader decide whether to follow it immediately or finish the current exercise first.

## Review the lesson as a reader

On the first pass, read the subtitle and opening as someone who arrived from a search result. Check whether the introduction identifies the subject directly, the examples explain any unfamiliar terms, and the paragraphs develop the ideas in a natural order. Read a passage aloud if the rhythm feels awkward. Join sentences where the connection has been lost, and split a sentence where the reader has to keep too many conditions in mind.

On the second pass, follow the instructions in the running guide. Start with the default settings, make the suggested edit, and compare the result with the description before restoring the example. Check the pitches, counts, control labels, links, and any error message the reader is expected to see. A rendering check can tell you that page two exists, but only inspecting its first measure will tell you whether the page-turn instructions are accurate.
