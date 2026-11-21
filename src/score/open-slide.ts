// Engrave a short slide on one guitar string. Its unwritten end has no fixed pitch.
import { Modifier, TabNote } from 'vexflow';
import type { OpenSlide } from './model';

/** Keep the free end inside a single string space and clear of the adjacent fret. */
const slideWidth = 10;
const slideHeight = 5;

/** Name the free end relative to the fret, just as the source marker does. */
export function describeOpenSlide(slide: OpenSlide, string: number): string {
  const direction = slide.side === 'above' ? 'higher' : 'lower';
  const motion = slide.edge === 'in' ? 'in from ' + slide.side : 'out toward a ' + direction + ' fret';
  return 'Slide ' + motion + ' on string ' + string;
}

/** Follow the same diagonal from the played fret to the free end on screen and paper. */
function freeEnd(x: number, y: number, slide: OpenSlide) {
  return {
    x: x + (slide.edge === 'in' ? -slideWidth : slideWidth),
    y: y + (slide.side === 'above' ? -slideHeight : slideHeight),
  };
}

/** A note modifier follows its chord member through reformatting, Canvas and SVG draws. */
class OpenSlideMark extends Modifier {
  static get CATEGORY(): string { return 'OpenSlide'; }

  constructor(private readonly slide: OpenSlide) {
    super();
    this.setPosition(slide.edge === 'in' ? Modifier.Position.LEFT : Modifier.Position.RIGHT);
  }

  draw(): void {
    const ctx = this.checkContext();
    const start = this.checkAttachedNote().getModifierStartXY(this.getPosition(), this.checkIndex());
    const end = freeEnd(start.x, start.y, this.slide);
    ctx.openGroup('open-slide', this.getAttribute('id'));
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.closeGroup();
    this.setRendered();
  }
}

/** Reserve one margin per side, even when several strings of a chord slide together. */
export function attachOpenSlide(note: TabNote, index: number, slide: OpenSlide): void {
  const mark = new OpenSlideMark(slide);
  const reserved = note.getModifiers().some(m => m instanceof OpenSlideMark && m.getPosition() === mark.getPosition());
  if (!reserved) {
    if (slide.edge === 'in') note.setLeftDisplacedHeadPx(note.getLeftDisplacedHeadPx() + slideWidth + 2);
    else note.setRightDisplacedHeadPx(note.getRightDisplacedHeadPx() + slideWidth + 2);
  }
  note.addModifier(mark, index);
}
