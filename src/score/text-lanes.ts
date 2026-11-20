// Recreate timed text in each screen or print composition using its own formatted voice.
import { TextNote, TickContext, type ScoreHitRegion, type PublicationOptions } from 'vexflow';
import { inkStyle } from './color';
import type { MeasuredText, MeasureVoice } from './model';

/** Resolve source ranges and fresh VexFlow text objects separately for each composition. */
export class TextLanes {
  readonly regions = new Map<string, ScoreHitRegion>();
  private readonly cells = new Map<string, MeasuredText | null>();

  /** A timed anchor keeps its written duration and never sounds a note. */
  anchor(id: string, cell: MeasuredText | null): string {
    this.cells.set(id, cell);
    return 'B4/' + (cell?.base ?? 'w') + (cell?.text || cell?.boundaries?.length ? '/r' : '/g') + '.'.repeat(cell?.dots ?? 0) + '[clef="treble",id="' + id + '"]';
  }

  /** A printed label follows its attack through tuplets, voice selection and repagination. */
  labels(voice: MeasureVoice, id: (name: string, cell: MeasuredText) => string) {
    const count = Math.max(0, ...voice.events.map(e => e.labels?.length ?? 0));
    return Array.from({ length: count }, (_, line) => ({
      notes: voice.events.map(e => {
        const label = e.labels?.[line];
        const cell: MeasuredText = {
          id: e.id + '-label-' + line, range: label?.range ?? e.range, base: e.base, dots: e.dots,
          text: label?.text ?? '', style: { ...label, line: label?.position === 'below' ? 10 + 2 * line : -2 * line }
        };
        return this.anchor(id(cell.id, cell), cell);
      }),
      tuplets: voice.tuplets.map(t => ({ start: t.start, count: t.count, options: { numNotes: t.numNotes, notesOccupied: t.notesOccupied } })),
    }));
  }

  /** The anchor owns timing and spacing. Its visible glyph is a native TextNote. */
  readonly hook: NonNullable<PublicationOptions['noteHooks']>[number] = (options, note) => {
    if (!this.cells.has(options.id)) return;
    const cell = this.cells.get(options.id);
    if (!cell || (!cell.text && !cell.boundaries?.length)) { note.renderOptions.draw = false; return; }
    const entries = [
      ...(cell.text ? [{ ...cell, edge: undefined }] : []),
      ...(cell.boundaries ?? []),
    ].map(item => {
      const { style, text, glyph } = item;
      const label = new TextNote({ duration: cell.base, ...(glyph ? { glyph: text } : { text }), smooth: style.smooth })
        .setLine(style.line ?? 0).setJustification(TextNote.Justification[(style.align ?? 'center').toUpperCase()]);
      if (style.family || style.size || style.style) label.setFont(style.family ?? label.fontInfo.family, style.size ?? 12,
        style.style === 'bold' ? 'bold' : undefined, style.style === 'italic' ? 'italic' : undefined);
      if (style.ink) label.setStyle(inkStyle(style.ink));
      return { item, label };
    });
    if (cell.style.smooth === false && cell.text) {
      const original = note.getMetrics.bind(note);
      note.getMetrics = () => {
        const metrics = original();
        const width = entries[0].label.measureText().width;
        return { ...metrics, width: Math.max(metrics.width, width), notePx: Math.max(metrics.notePx, width) };
      };
    }
    note.draw = () => {
      const ctx = note.checkContext(), stave = note.checkStave(), tick = note.checkTickContext();
      for (const { item, label } of entries) {
        const id = item.edge ? options.id + '-at-' + item.range.start : options.id;
        label.setStave(stave).setTickContext(tick).setContext(ctx);
        label.preFormat();
        const x = label.getAbsoluteX() + tick.getMetrics().glyphPx / 2;
        const anchor = item.edge === 'start' ? stave.getNoteStartX() : item.edge === 'end' ? stave.getNoteEndX() : x;
        ctx.save();
        if (item.edge) label.setTickContext(new TickContext().setX(tick.getX() + anchor - label.getAbsoluteX()));
        if (item.edge) label.preFormat();
        ctx.openGroup('timed-text', id);
        label.drawWithStyle();
        ctx.closeGroup();
        ctx.restore();
        const width = label.measureText().width, height = label.getHeight();
        const left = item.style.align === 'right' ? anchor - width : item.style.align === 'left' ? anchor : anchor - width / 2;
        this.regions.set(id, { id, source: cell.id, kind: 'event', x: left, y: stave.getYForLine((item.style.line ?? 0) - 3) - height, w: width, h: height });
      }
      note.setRendered();
    };
  };
}
