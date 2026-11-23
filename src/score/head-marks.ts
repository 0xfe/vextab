// Attach native fingering and accent modifiers to screen and publication notes.
import { Annotation, Articulation, FretHandFinger, Metrics, Modifier, StaveNote, StringNumber, type ModifierPosition, type Note } from 'vexflow';
import { scoreTextFont } from './engraving';
import type { HeadMark } from './shorthand';

const positions = { left: Modifier.Position.LEFT, right: Modifier.Position.RIGHT,
  above: Modifier.Position.ABOVE, below: Modifier.Position.BELOW };

/** A chord fingering column reads in pitch order, just outside the chord and its articulation. */
class ChordFinger extends FretHandFinger {
  // Articulations format next to the note. These digits occupy the space beyond them.
  static get CATEGORY() { return 'VexTabChordFinger'; }

  constructor(label: string) {
    super(label);
    this.setFont(Metrics.getFontInfo('FretHandFinger')).setFontSize(12);
  }

  private baseline() {
    const note = this.checkAttachedNote();
    const above = this.getPosition() === Modifier.Position.ABOVE;
    const direction = above ? -1 : 1;
    const ys = note.getYs();
    const staffSpace = note.checkStave().getSpacingBetweenLines();
    const outside = above ? Math.min : Math.max;
    let edge = outside(...ys) + direction * staffSpace / 2;
    if (note.hasStem()) edge = outside(edge, note.getStemExtents().topY);
    const column = [];
    for (const mark of note.getModifiers()) {
      if (mark.getPosition() !== this.getPosition()) continue;
      if (mark instanceof ChordFinger) column.push(mark);
      if (mark instanceof Articulation) {
        const ink = mark.getInkBounds();
        edge = outside(edge, above ? ink.y : ink.y + ink.h);
      }
    }
    // The highest pitch gets the highest number on the page, irrespective of entry order.
    column.sort((a, b) => direction * (ys[a.getIndex()] - ys[b.getIndex()]));
    for (const digit of column) {
      const ink = digit.getTextMetrics();
      edge += direction * staffSpace * 0.18;
      if (digit === this) return edge + (above ? -ink.actualBoundingBoxDescent : ink.actualBoundingBoxAscent);
      edge += direction * (ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent);
    }
    return edge;
  }

  getTextInk(x: number, _y: number) { return super.getTextInk(x, this.baseline()); }

  draw() {
    const { x } = this.checkAttachedNote().getModifierStartXY(this.getPosition(), this.getIndex());
    this.setRendered();
    this.renderText(this.checkContext(), x - this.getWidth() / 2, this.baseline());
  }
}

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
      if (note instanceof StaveNote && !grace && !mark.stringNumber && /^\d$/.test(mark.finger) &&
          note.getKeys().length > 1 && (mark.position === 'above' || mark.position === 'below')) {
        note.addModifier(new ChordFinger(mark.finger).setPosition(pos), index);
      } else note.addModifier(fingerNumber(mark.finger, pos, mark.stringNumber, tab), index);
    } else {
      note.addModifier(new Articulation(mark.articulation ?? 'a>').setPosition(pos), index);
    }
  }
}
