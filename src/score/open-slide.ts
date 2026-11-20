// Engrave a short slide on one guitar string. Its unwritten end has no fixed pitch.
import { Modifier, TabNote, type PublicationResult } from 'vexflow';
import type { Attack, OpenSlide, ParsedScore } from './model';

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

/** Publication recomposes tab notes from plain descriptors. Its native fret masks supply
 * the edges and centres of each printed fret, including two-digit frets and cue copies. */
export function drawPrintedOpenSlides(result: PublicationResult, score: ParsedScore, id: (event: Attack) => string): void {
  const marked = new Map<string, Attack>();
  for (const measure of score.measures) for (const voice of measure.voices) for (const attack of voice.events) {
    if (attack.heads.some(head => head.openSlide)) marked.set('vf-' + id(attack), attack);
  }
  if (!marked.size) return;
  for (const { svg } of result.pages) {
    for (const group of svg.querySelectorAll('.vf-tabnote[data-vf-id]')) {
      const attack = marked.get(group.getAttribute('data-vf-id'));
      if (!attack) continue;
      const masks = group.querySelectorAll<SVGRectElement>(':scope > rect');
      attack.heads.forEach((head, i) => {
        const mask = masks[i];
        if (!head.openSlide || !mask) return;
        const x = mask.x.baseVal.value + (head.openSlide.edge === 'out' ? mask.width.baseVal.value : 0);
        const y = mask.y.baseVal.value + mask.height.baseVal.value / 2;
        const end = freeEnd(x, y, head.openSlide);
        const path = svg.ownerDocument.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('class', 'vf-open-slide');
        path.setAttribute('d', `M${x} ${y}L${end.x} ${end.y}`);
        path.setAttribute('fill', 'none');
        group.append(path);
      });
    }
  }
}
