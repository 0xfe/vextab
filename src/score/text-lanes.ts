// Recreate timed text in each screen or print composition using its own formatted voice.
import { TextNote, type Note, type CompositionMark, type EasyScoreComposition, type EasyScoreContent, type ScoreHitRegion, type PublicationOptions } from 'vexflow';
import { scoreMusicFont } from './engraving';
import { inkStyle } from './color';
import type { MeasuredText } from './model';

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

/** Resolve source ranges and fresh VexFlow text objects separately for each composition. */
export class TextLanes {
  readonly regions = new Map<string, ScoreHitRegion>();
  private readonly cells = new Map<string, (MeasuredText & { belowBassStaff?: boolean }) | null>();

  /** A timed anchor keeps its written duration and never sounds a note. */
  anchor(id: string, cell: MeasuredText | null): EasyScoreContent {
    if (!cell || (!cell.text && !cell.boundaries?.length)) return { id, skip: { duration: cell?.base ?? 'w', dots: cell?.dots } };
    if (cell.text && !cell.boundaries?.length && !cell.style.smooth) {
      this.cells.set(id, cell);
      const { family, size, style, align, line } = cell.style;
      const text = cell.glyph ? TextNote.GLYPHS[cell.text] ?? cell.text : cell.text;
      const font = { ...(family && { family }), ...(size && { size }), ...(style === 'italic' && { style }),
        ...(style === 'bold' && { weight: style }), ...(cell.glyph && { family: scoreMusicFont(), style: 'normal', weight: 'normal' }) };
      return { id, direction: { text, duration: cell.base, dots: cell.dots, line, align: align ?? 'center', font } };
    }
    this.cells.set(id, cell);
    return 'B4/' + (cell?.base ?? 'w') + (cell?.text || cell?.boundaries?.length ? '/r' : '/g') + '.'.repeat(cell?.dots ?? 0) + '[clef="treble",id="' + id + '"]';
  }

  /** Native directions own their hit boxes. Smooth text uses a placed mark to leave beat spacing alone. */
  place(note: Note, add: (mark: CompositionMark) => void, composition: EasyScoreComposition) {
    const id = note.getAttribute('id'), cell = this.cells.get(id);
    if (!cell || cell.boundaries?.length) return;
    let label: TextNote;
    if (note instanceof TextNote) label = note;
    else {
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

  /** The anchor owns timing and spacing. Its visible glyph is a native TextNote. */
  readonly hook: NonNullable<PublicationOptions['noteHooks']>[number] = (options, note) => {
    if (note instanceof TextNote || !this.cells.has(options.id)) return;
    const cell = this.cells.get(options.id);
    if (!cell || (!cell.text && !cell.boundaries?.length)) { note.renderOptions.draw = false; return; }
    if (cell.style.smooth && !cell.boundaries?.length) { note.renderOptions.draw = false; return; }
    const gap = 5;
    const entries = [
      ...(cell.text ? [{ ...cell, edge: undefined }] : []),
      ...(cell.boundaries ?? []),
    ].map(item => {
      const { style, text, glyph } = item;
      const label = new TextNote({ duration: cell.base, ...(glyph ? { glyph: text } : { text }) }).setLine(style.line ?? 0);
      if (glyph) {
        // SMuFL codepoints must keep the music face even in an italic or bold lyric lane.
        if (style.size) label.setFontSize(style.size);
      } else if (style.family || style.size || style.style) {
        label.setFont(style.family ?? label.fontInfo.family, style.size ?? 12,
          style.style === 'bold' ? 'bold' : undefined, style.style === 'italic' ? 'italic' : undefined);
      }
      if (style.ink) label.setStyle(inkStyle(style.ink));
      const ink = label.getTextInk(0, 0);
      const advance = label.getTextMetrics().width;
      const offset = style.align === 'right' ? -advance : style.align === 'left' ? 0 : -advance / 2;
      return { item, label, ink, offset };
    });

    // Reserve the real ink on each side of the tick. Edge marks stay inside the measure.
    const edges = { start: 0, end: 0 };
    let left = 0, right = 0;
    for (const { item, ink, offset } of entries) {
      if (item.edge) edges[item.edge] += ink.w + gap;
      else if (!cell.style.smooth || cell.boundaries?.length) {
        left = Math.max(0, -offset - ink.x);
        right = Math.max(0, offset + ink.x + ink.w);
      }
    }
    const original = note.getMetrics.bind(note);
    note.getMetrics = () => {
      const metrics = original();
      return { ...metrics, leftDisplacedHeadPx: Math.max(metrics.leftDisplacedHeadPx, left + edges.start),
        rightDisplacedHeadPx: Math.max(metrics.rightDisplacedHeadPx, right + edges.end) };
    };

    note.draw = () => {
      const ctx = note.checkContext(), stave = note.checkStave(), tick = note.checkTickContext();
      let start = stave.getNoteStartX(), end = stave.getNoteEndX();
      for (const { item, label, ink, offset } of entries) {
        const id = item.edge ? options.id + '-at-' + item.range.start : options.id;
        label.setStave(stave).setTickContext(tick).setContext(ctx);
        label.preFormat();
        const anchor = label.getAbsoluteX() + tick.getMetrics().glyphPx / 2;
        let x = anchor + offset;
        if (item.edge === 'start') { x = start - ink.x; start += ink.w + gap; }
        if (item.edge === 'end') { x = end - ink.x - ink.w; end -= ink.w + gap; }
        const line = label.getLine() - 3, baseline = stave.getYForLine(line);
        // A below-staff lane clears the first ledger line. Give every word in one font a common baseline.
        const ascent = item.glyph ? -ink.y : (label.getTextMetrics().fontBoundingBoxAscent ?? -ink.y);
        const y = line >= stave.getNumLines() ? baseline + stave.getSpacingBetweenLines() + ascent : baseline;
        label.setXShift(x - anchor).setYShift(y - baseline);
        ctx.openGroup('timed-text', id);
        label.drawWithStyle();
        ctx.closeGroup();
        this.regions.set(id, { id, source: cell.id, kind: 'event', x: x + ink.x, y: y + ink.y, w: ink.w, h: ink.h });
      }
      note.setRendered();
    };
  };
}
