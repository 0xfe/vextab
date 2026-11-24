# Independent Sor refingering walkthrough

A separate Codex agent reviewed the engraving migration as a maintainer and completed an editing trial in the offline Chrome guide. The two builds used the original commit `1eb710d` with VexFlow 5.9.0 and the merged commit `744add8` with VexFlow 5.10.1. Each used its own lockfile. This review supplies no human musician usability rating.

## The edit

In the first melody note of Sor’s *Study in B minor*, play the same D on string three with finger four. The accompaniment still plays the original D on string two at that onset. In a fresh guide editor for each build, the reviewer changed the first `3/2[finger 2]` to `7/3[finger 4]` and rendered the score. [Original score](../../guide/scores/sor-op35-no22.vextab)

| Observation | Original build | Merged build |
| --- | --- | --- |
| Score edits | 2 token replacements on 1 line | 2 token replacements on 1 line |
| Layout directives or score corrections | 0 | 0 |
| First melody head in the displayed TAB | Fret 7, finger 4 | Fret 7, finger 4 |
| Extracted TAB | String 3, fret 7, finger 4 | String 3, fret 7, finger 4 |
| Extracted notation | Finger 4 on the melody head | Finger 4 on the melody head |
| Paper | 1 page per projection, 0 diagnostics | 1 page per projection, 0 diagnostics |
| Literal playback, before and after | All 70 pitches, durations and velocities match | All 70 pitches, durations and velocities match |

The player check captured the actual output through the public playback plugin. The table counts edits to the musical source. Both versions took the same authoring effort for this task.

## The maintainer trace

1. The v2 reader attaches the finger to the fretted head. `projectHead` resolves the sounding pitch, string and fret and carries the indexed mark into the layout-independent score. [Reader](../../src/score/grammar2/reader.mts) · [Projection](../../src/score/grammar2/project.ts)
2. `voiceSpec` builds both the written and TAB representations of that event. The notation representation passes eligible numeric fingerings in the typed head specification. The shared `prepareNote` hook attaches the remaining marks to the corresponding head index, including the circled digit on TAB. VexFlow places the modifiers. [Voice and engraving specifications](../../src/score/layout.ts) · [Head mark mapping](../../src/score/head-marks.ts)
3. Screen and print both consume those specifications. The reviewer checked both extracted projections by their public note hooks, reading the melody head’s own fingering and the TAB note’s position. The guide’s visible TAB changed from fret 3 and finger 2 to fret 7 and finger 4. [Existing Sor regression](../../tests/part-engraving.ts)

Between the original commit and migration commit `319d1d8`, `head-marks.ts` gained 15 lines and lost 59. The deleted `ChordFinger` calculation chose a shared column, measured the note or stem edge and computed the digit offset. The native modifier now owns that geometry. The migration also removed the 172-line VexFlow webpack loader. These counts describe the filed migration diff, independently of subsequent importer changes.

## Independent reading and editing

A second agent used fresh guide drafts on VexTab `744add8` without consulting the worked answers. These checks complement the paired Sor comparison above.

| Guide task | Observed result |
| --- | --- |
| Replace Handy’s second-verse opening word | One token changed. The screen and printed Voice part placed “Walked” below “I”. All 30 vocal attacks retained their pitches and durations. |
| Release Sor’s tied opening bass | Removing one tie split a six-second B2 into two three-second attacks. The printed Guitar part lost the corresponding tie. |
| Reverse the four heads of a fingered chord | The fingering followed its head from index zero to three. Source selection found the reordered chord and all eight sounding heads matched. The workshop has no print control. |
| Identify Haydn’s cello cue on page two | Bar 23 showed the four slurred violin-II quarters above the cello rest. The print metadata identified the donor and the same four pitches. |

Each edit succeeded on the first attempt, produced SoundFont audio and required zero manual offsets, new breaks or duplicate part edits. A human instrumentalist’s usability trial is still outstanding.
