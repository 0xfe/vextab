// Recreate timed text in each screen or print composition using its own formatted voice.
import { TextNote, type Bounds, type Note, type ScoreHitRegion, type PublicationOptions } from 'vexflow';
import { inkStyle } from './color';
import type { MeasuredText } from './model';

/** A timed word replaces its anchor's rest. Resolve its ink anew whenever a row moves. */
export const timedTextInk = new WeakMap<Note, () => Bounds[]>();

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
      return { ...cell, text, boundaries, style: text && lower ? { ...cell.style, line: cell.style.line - distance } : cell.style };
    });
    return visible ? [cells] : [];
  });
}

/** Resolve source ranges and fresh VexFlow text objects separately for each composition. */
export class TextLanes {
  readonly regions = new Map<string, ScoreHitRegion>();
  private readonly cells = new Map<string, MeasuredText | null>();

  /** A timed anchor keeps its written duration and never sounds a note. */
  anchor(id: string, cell: MeasuredText | null): string {
    this.cells.set(id, cell);
    return 'B4/' + (cell?.base ?? 'w') + (cell?.text || cell?.boundaries?.length ? '/r' : '/g') + '.'.repeat(cell?.dots ?? 0) + '[clef="treble",id="' + id + '"]';
  }

  /** The anchor owns timing and spacing. Its visible glyph is a native TextNote. */
  readonly hook: NonNullable<PublicationOptions['noteHooks']>[number] = (options, note) => {
    if (!this.cells.has(options.id)) return;
    const cell = this.cells.get(options.id);
    if (!cell || (!cell.text && !cell.boundaries?.length)) { note.renderOptions.draw = false; return; }
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

    function placeLabels() {
      const stave = note.checkStave(), tick = note.checkTickContext();
      let start = stave.getNoteStartX(), end = stave.getNoteEndX();
      return entries.map(({ item, label, ink, offset }) => {
        const id = item.edge ? options.id + '-at-' + item.range.start : options.id;
        label.setStave(stave).setTickContext(tick);
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
        return { id, label, box: { x: x + ink.x, y: y + ink.y, w: ink.w, h: ink.h } };
      });
    }
    timedTextInk.set(note, () => placeLabels().map(entry => entry.box));
    note.draw = () => {
      const ctx = note.checkContext();
      for (const { id, label, box } of placeLabels()) {
        ctx.openGroup('timed-text', id);
        label.setContext(ctx).drawWithStyle();
        ctx.closeGroup();
        this.regions.set(id, { id, source: cell.id, kind: 'event', ...box });
      }
      note.setRendered();
    };
  };
}
