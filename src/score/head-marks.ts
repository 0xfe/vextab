// Attach native fingering and accent modifiers to screen and publication notes.
import { Annotation, Articulation, FretHandFinger, Modifier, StringNumber, type ModifierPosition, type Note } from 'vexflow';
import { scoreTextFont } from './engraving';
import type { HeadMark } from './shorthand';

const positions = { left: Modifier.Position.LEFT, right: Modifier.Position.RIGHT,
  above: Modifier.Position.ABOVE, below: Modifier.Position.BELOW };

/** Let the native modifier context reserve the side column alongside accidentals. */
export function fingerNumber(label: string, position: ModifierPosition, stringNumber = false, tab = false) {
  const modifier = stringNumber ? new StringNumber(label) : new FretHandFinger(label, { headPlacement: !tab }).setDrawCircle(tab && /^\d$/.test(label));
  modifier.setPosition(position);
  return modifier;
}

/** Attach the authored label and head index. VexFlow resolves its stave line or TAB string. */
export function attachHeadMarks(note: Note, index: number, marks: HeadMark[], tab: boolean, showTabFingers = false, grace = false): void {
  for (const mark of marks) {
    const pos = positions[mark.position];
    if (mark.finger !== undefined) {
      if (tab && !showTabFingers) continue;
      if ((grace || /^[pimac]$/.test(mark.finger)) && (mark.position === 'above' || mark.position === 'below')) {
        // Reserve the letter's width and clear the beam or fret staff on the requested side.
        const side = mark.position === 'above' ? Annotation.VerticalJustify.TOP : Annotation.VerticalJustify.BOTTOM;
        note.addModifier(new Annotation(mark.finger).setFont(scoreTextFont(), 11).setVerticalJustification(side), index);
        continue;
      }
      note.addModifier(fingerNumber(mark.finger, pos, mark.stringNumber, tab), index);
    } else {
      note.addModifier(new Articulation(mark.articulation ?? 'a>').setPosition(pos), index);
    }
  }
}

/** One numbered fingering is supported directly on a typed pitched head. */
export function typedFingering(marks: HeadMark[] = []) {
  return marks.find(mark => mark.finger && /^\d$/.test(mark.finger) && !mark.stringNumber);
}
