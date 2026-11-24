// Snapshot engraved head centres and stave boundaries before the animation starts.
import type { Note, PublicationResult, Stave, StaveNote } from 'vexflow';
import type Artist from '../artist';
import type { Attack, ParsedScore } from '../score/model';
import { fixedHeads } from './performance';

export interface Point { x: number; y: number }
export interface PlaybackRow {
  top: number; bottom: number; right: number;
  /** Independently paginated music has its own coordinate system. */
  printedPage?: SVGSVGElement;
  /** Millimeters per logical engraving unit on this page. */
  scale?: number;
}
export interface Position { row: PlaybackRow; x: number; heads: Point[] }
export type Geometry = Map<object | string, Position>;

/** A public Player can discover the layout of the exact parsed revision rendered on its surface. */
export const scoreSurfaces = new WeakMap<SVGSVGElement | HTMLCanvasElement, { score: ParsedScore; ensemble?: readonly ParsedScore[]; read: () => Geometry }>();

/** Include both staff and tab, with a little clearance beyond the outside lines. */
export function staveRow(staves: Stave[]): PlaybackRow {
  return {
    top: Math.min(...staves.map(s => s.getYForLine(0))) - 7,
    bottom: Math.max(...staves.map(s => s.getYForLine(s.getNumLines() - 1))) + 7,
    right: Math.max(...staves.map(s => s.getNoteEndX())),
  };
}

/** VexFlow retains head order for displaced chord seconds and tab string positions. */
export function position(row: PlaybackRow, glyphs: Note[], sounding: boolean[]): Position {
  const heads: Point[] = [];
  let x = glyphs[0].getAbsoluteX();
  for (const glyph of glyphs) {
    // A ghost rest still anchors horizontal travel but has no Y coordinates.
    if (glyph.isRest() || !sounding.some(Boolean)) continue;
    const ys = glyph.getYs();
    const ink = 'getHeadInk' in glyph ? (glyph as StaveNote).getHeadInk() : [];
    for (let i = 0; i < ys.length; i++) {
      const centre = ink[i] ? ink[i].x + ink[i].w / 2 : glyph.getAbsoluteX();
      if (i === 0 && glyph === glyphs[0]) x = centre;
      if (sounding[i]) heads.push({ x: centre, y: ys[i] });
    }
  }
  return { row, x, heads };
}

/** Fixed scores keep parallel note and tab projections, but play only one voice per part. */
export function artistGeometry(artist: Artist): Geometry {
  const result: Geometry = new Map();
  for (const group of artist.staves) {
    const staves = [group.note, group.tab].filter(Boolean);
    if (!staves.length) continue;
    const row = staveRow(staves);
    const voices = group.note ? group.note_voices : group.tab_voices;
    voices.forEach((voice, v) => voice.forEach((note, i) => {
      if (note.shouldIgnoreTicks()) return;
      const tab = group.note && group.tab && group.tab_voices[v]?.[i];
      const glyphs = tab && !tab.shouldIgnoreTicks() ? [note, tab] : [note];
      const sounding = (fixedHeads.get(note) ?? []).map(head => /^[a-g]/i.test(head.key));
      result.set(note, position(row, glyphs, sounding));
    }));
  }
  return result;
}

/** Source beat and stave extent in the publication composition, including silent beats. */
export interface PrintAnchor { measure: number; x: number; row: PlaybackRow }

/** The printed score uses independently laid out heads, identified by their original IDs. */
export function printedGeometry(publication: PublicationResult, attacks: Map<string, Attack>, anchors: Map<string, PrintAnchor>, scale: number): Geometry {
  const result: Geometry = new Map();
  const beats = new Map<number, [string, PrintAnchor][]>();
  for (const entry of anchors) {
    const { measure } = entry[1];
    if (!beats.has(measure)) beats.set(measure, []);
    beats.get(measure).push(entry);
  }
  for (const page of publication.pages) {
    for (const system of page.systems) {
      // Publication translates its music group around the opening and any inserted cues.
      const music = page.svg.querySelector<SVGGElement>('[data-system="' + system.measures[0] + '"] > g:last-child');
      const offsetY = system.y / scale + (music?.transform.baseVal[0]?.matrix.f ?? 0);
      const offsetX = system.x / scale;
      let row: PlaybackRow;
      for (const bar of system.measures) for (const [id, beat] of beats.get(bar) ?? []) {
        row ??= { top: offsetY + beat.row.top, bottom: offsetY + beat.row.bottom, right: offsetX + beat.row.right, printedPage: page.svg, scale };
        result.set(id, { row, x: offsetX + beat.x, heads: [] });
      }
    }
    for (const head of page.heads.occurrences) {
      if (head.reference || head.role === 'mark') continue;
      const attack = attacks.get(head.sourceEvent), position = result.get(head.sourceEvent);
      if (!attack || !position || typeof head.sourceHead !== 'number') continue;
      const pitch = attack.heads[head.sourceHead];
      if (attack.silent || !pitch || (!pitch.sounding && pitch.midi === undefined)) continue;
      const b = head.bounds, point = { x: (b.x + b.w / 2) / scale, y: (b.y + b.h / 2) / scale };
      if (!position.heads.length) position.x = point.x;
      position.heads.push(point);
    }
  }
  return result;
}
