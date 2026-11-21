// Attach native fingering and accent modifiers to screen and publication notes.
import { Articulation, FretHandFinger, Modifier, StringNumber, type ModifierPosition, type Note } from 'vexflow';
import type { HeadMark } from './shorthand';

const positions = { left: Modifier.Position.LEFT, right: Modifier.Position.RIGHT,
  above: Modifier.Position.ABOVE, below: Modifier.Position.BELOW };

/** Let the native modifier context reserve the side column alongside accidentals. */
export function fingerNumber(label: string, position: ModifierPosition, stringNumber = false, tab = false) {
  const modifier = stringNumber ? new StringNumber(label) : new FretHandFinger(label).setDrawCircle(tab && /^\d$/.test(label));
  modifier.setPosition(position);
  if (!tab && !stringNumber && position === Modifier.Position.LEFT) {
    // Reserve the padding before VexFlow places accidentals. Moving ink alone can overlap their column.
    const padding = 4;
    modifier.setWidth(modifier.getWidth() + 2 * padding).setOffsetX(padding);
  }
  return modifier;
}

/** Attach the authored label and head index. VexFlow resolves its stave line or TAB string. */
export function attachHeadMarks(note: Note, index: number, marks: HeadMark[], tab: boolean, showTabFingers = false): void {
  for (const mark of marks) {
    const pos = positions[mark.position];
    if (mark.finger !== undefined) {
      if (tab && !showTabFingers) continue;
      note.addModifier(fingerNumber(mark.finger, pos, mark.stringNumber, tab), index);
    } else {
      note.addModifier(new Articulation(mark.articulation ?? 'a>').setPosition(pos), index);
    }
  }
}
