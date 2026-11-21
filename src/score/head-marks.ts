// Attach native fingering and accent modifiers to screen and publication notes.
import { Articulation, FretHandFinger, Modifier, StringNumber, TabNote, VexFlow, type ModifierPosition, type Note } from 'vexflow';
import type { HeadMark } from './shorthand';

const positions = { left: Modifier.Position.LEFT, right: Modifier.Position.RIGHT,
  above: Modifier.Position.ABOVE, below: Modifier.Position.BELOW };

/** Keep side clearance identical for finger and string numbers in both annotation spellings. */
export function fingerNumber(label: string, position: ModifierPosition, stringNumber = false) {
  const modifier = stringNumber ? new StringNumber(label) : new FretHandFinger(label);
  modifier.setPosition(position);
  if (position === Modifier.Position.LEFT) modifier.setOffsetX(-4);
  if (position === Modifier.Position.RIGHT) modifier.setOffsetX(4);
  return modifier;
}

/** Native finger and string modifiers sort by head line. Give TAB its physical string lines. */
export function attachHeadMarks(note: Note, index: number, marks: HeadMark[], tab: boolean, showTabFingers = false): void {
  for (const mark of marks) {
    const pos = positions[mark.position];
    if (mark.finger !== undefined) {
      if (tab && !showTabFingers) continue;
      if (tab && note instanceof TabNote && !note.getKeyProps().length) {
        note.keyProps = note.getPositions().map(({ str }, i) => ({
          ...VexFlow.keyProperties(note.getKeys()[i]), line: -str,
        }));
      }
      // Native StringNumber accepts pitched notes only. A circled digit retains the authored label on TAB.
      const label = tab && mark.stringNumber ? String.fromCodePoint(0x245f + Number(mark.finger)) : mark.finger;
      note.addModifier(fingerNumber(label, pos, !tab && mark.stringNumber), index);
    } else {
      note.addModifier(new Articulation(mark.articulation ?? 'a>').setPosition(pos), index);
    }
  }
}
