// Attach native fingering and accent modifiers to screen and publication notes.
import { Articulation, FretHandFinger, Modifier, StringNumber, TabNote, VexFlow, type ModifierPosition, type Note } from 'vexflow';
import type { HeadMark } from './shorthand';

const positions = { left: Modifier.Position.LEFT, right: Modifier.Position.RIGHT,
  above: Modifier.Position.ABOVE, below: Modifier.Position.BELOW };

/** Let the native modifier context reserve the side column alongside accidentals. */
export function fingerNumber(label: string, position: ModifierPosition, stringNumber = false, tab = false) {
  const modifier = stringNumber ? new StringNumber(label) : new FretHandFinger(label);
  modifier.setPosition(position);
  if (!tab && !stringNumber && position === Modifier.Position.LEFT) {
    // Reserve the padding before VexFlow places accidentals. Moving ink alone can overlap their column.
    const padding = 4;
    modifier.setWidth(modifier.getWidth() + 2 * padding).setOffsetX(padding);
  }
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
      // Use the bundled SMuFL circled digits on TAB. Letter fingerings retain their text face.
      const finger = fingerNumber(mark.finger, pos, !tab && mark.stringNumber, tab);
      if (tab && /^\d$/.test(mark.finger)) {
        const glyph = VexFlow.Glyphs['guitarString' + mark.finger];
        finger.setFont('Bravura', 16).setText(glyph);
        if (pos === Modifier.Position.LEFT || pos === Modifier.Position.RIGHT) finger.setOffsetY(-5);
      }
      note.addModifier(finger, index);
    } else {
      note.addModifier(new Articulation(mark.articulation ?? 'a>').setPosition(pos), index);
    }
  }
}
