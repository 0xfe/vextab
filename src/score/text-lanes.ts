// Recreate timed text in each screen or print composition using its own formatted voice.
import { TextNote, type Note, type CompositionMark, type EasyScoreComposition, type EasyScoreContent, type ScoreHitRegion } from 'vexflow';
import { scoreMusicFont } from './engraving';
import { inkStyle } from './color';
import type { MeasuredText } from './model';
import type { SourceRange } from './source';

/** A line written beyond the piano's nominal lower staff belongs to that hand.
 * Keep its beat and source while measuring it below the bass as the hands move apart. */
export function pianoTextLanes(lanes: MeasuredText[][], lower: boolean, distance: number) {
  return lanes.flatMap(lane => {
    let visible = false;
    const cells = lane.map(cell => {
      // TextNote line 3 is the top staff line. Four more spaces reach the bottom line.
      const belowBass = (line = 0) => line - 3 > distance + 4;
      const text = cell.text && belowBass(cell.style.line) === lower ? cell.text : '';
      const boundaries = cell.boundaries?.filter(b => belowBass(b.style.line) === lower)
        .map(b => lower ? { ...b, style: { ...b.style, line: b.style.line - distance } } : b);
      if (text || boundaries?.length) visible = true;
      return { ...cell, text, boundaries, belowBassStaff: lower, style: text && lower ? { ...cell.style, line: cell.style.line - distance } : cell.style };
    });
    return visible ? [cells] : [];
  });
}

/** A beat sharing the opening sign's line needs space for that sign before its text. */
function followsOpeningSign(cell: MeasuredText) {
  return cell.boundaries?.some(sign => sign.edge === 'start' && sign.style.line === cell.style.line);
}

/** Resolve source ranges and fresh VexFlow text objects separately for each composition. */
export class TextLanes {
  readonly regions = new Map<string, ScoreHitRegion>();
  private readonly cells = new Map<string, MeasuredText & { belowBassStaff?: boolean }>();

  /** Put simultaneous edge signs in separate voices so each keeps its beat, style and source ID. */
  voices(lane: MeasuredText[], project: (id: string, range: SourceRange) => string) {
    const beat = lane.map(cell => this.anchor(cell, project(cell.id, cell.range)));
    const voices = [{ notes: beat }];
    const edgeCount = Math.max(0, ...lane.map(cell => cell.boundaries?.length ?? 0));
    for (let i = 0; i < edgeCount; i++) {
      voices.push({ notes: lane.map(cell => {
        const edge = cell.boundaries?.[i];
        if (!edge) return { skip: { duration: cell.base, dots: cell.dots } };
        const id = cell.id + '-at-' + edge.range.start;
        return this.anchor({ ...cell, ...edge, id }, project(id, edge.range), edge.edge);
      }) });
    }
    return voices;
  }

  /** Native directions own edge alignment. A silent rest keeps smooth labels in the reading order. */
  private anchor(cell: MeasuredText, id: string, anchor: 'beat' | 'start' | 'end' = 'beat'): EasyScoreContent {
    const rhythm = { duration: cell.base, dots: cell.dots };
    if (!cell.text) return { id, skip: rhythm };
    this.cells.set(id, cell);
    if (cell.style.smooth && anchor === 'beat' && !cell.boundaries?.length) {
      return 'B4/' + cell.base + '/r' + '.'.repeat(cell.dots) + '[clef="treble",id="' + id + '"]';
    }
    const { family, size, style, align, line } = cell.style;
    const text = cell.glyph ? TextNote.GLYPHS[cell.text] ?? cell.text : cell.text;
    const font = { ...(family && { family }), ...(size && { size }), ...(style === 'italic' && { style }),
      ...(style === 'bold' && { weight: style }), ...(cell.glyph && { family: scoreMusicFont(), style: 'normal', weight: 'normal' }) };
    // Reserve the leading side of the first beat when a same-line sign occupies the bar opening.
    // Drawing uses the written alignment after VexFlow has spaced the neighboring beats.
    const afterStart = anchor === 'beat' && followsOpeningSign(cell);
    const justification = afterStart ? 'right' : align ?? 'center';
    return { id, direction: { ...rhythm, text, anchor, line, align: justification, font } };
  }

  /** Only the smooth label draws at this timed rest, including in a fresh part. */
  prepare(id: string, note: Note) {
    if (!(note instanceof TextNote) && this.cells.has(id)) note.renderOptions.draw = false;
  }

  /** Native directions own their hit boxes. Smooth text uses a placed mark to leave beat spacing alone. */
  place(note: Note, add: (mark: CompositionMark) => void, composition: EasyScoreComposition) {
    const id = note.getAttribute('id'), cell = this.cells.get(id);
    if (!cell) return;
    let label: TextNote;
    if (note instanceof TextNote) {
      label = note;
      if (label.getDirectionAnchor() === 'beat' && followsOpeningSign(cell)) {
        // Retain the reserved tick width if Canvas or print formats the voice a second time.
        const width = label.getTextMetrics().width;
        label.setXShift(cell.style.align === 'right' ? 0 : cell.style.align === 'left' ? width : width / 2);
      }
    } else {
      if (!cell.style.smooth) return;
      const { family, size, style, align, line } = cell.style;
      label = new TextNote({ duration: cell.base, ...(cell.glyph ? { glyph: cell.text } : { text: cell.text }), line })
        .setDirectionAnchor('beat').setAttribute('id', id);
      if (cell.glyph) {
        if (size) label.setFontSize(size);
      } else label.setFont(family ?? label.fontInfo.family, size ?? label.fontInfo.size as number,
        style === 'bold' ? 'bold' : undefined, style === 'italic' ? 'italic' : undefined);
      label.setJustification(align === 'right' ? TextNote.Justification.RIGHT : align === 'left' ? TextNote.Justification.LEFT : TextNote.Justification.CENTER);
      label.setStave(note.checkStave()).setTickContext(note.checkTickContext());
      label.preFormat();
    }
    if (cell.style.ink) label.setStyle(inkStyle(cell.style.ink));
    const stave = note.checkStave();
    if (label.getLine() - 3 >= stave.getNumLines()) {
      label.setYShift(0);
      const ascent = cell.glyph ? -label.getTextInk(0, 0).y : label.getTextMetrics().fontBoundingBoxAscent;
      label.setYShift(stave.getSpacingBetweenLines() + ascent);
    }
    if (cell.belowBassStaff) {
      // A long instruction can reach the next bar's down-stem beam.
      const ink = label.getBoundingBox();
      let bottom = ink.y;
      for (const tick of composition.notes.flat(3)) {
        const candidate = tick as Note, beam = candidate.getBeam?.();
        if (!beam || beam.getNotes()[0] !== candidate || candidate.getStave()?.getY() !== stave.getY()) continue;
        for (const strip of beam.getStripBounds()) {
          if (strip.x < ink.x + ink.w && strip.x + strip.w > ink.x)
            bottom = Math.max(bottom, strip.y + strip.h + stave.space(0.4));
        }
      }
      label.setYShift(label.getYShift() + bottom - ink.y);
    }
    const bounds = label.getBoundingBox();
    this.regions.set(id, { id, source: cell.id, kind: 'event', x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
    if (label !== note) add({ source: note, bounds, draw: ctx => label.setContext(ctx).drawWithStyle() });
  }
}
