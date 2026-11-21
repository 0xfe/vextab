// Snapshot engraved head centres and stave boundaries before the animation starts.
import type { Note, PublicationResult, Stave, StaveNote } from 'vexflow';
import type Artist from '../artist';
import type { Attack, ParsedScore } from '../score/model';
import { fixedHeads } from './performance';

export interface Point { x: number; y: number }
export interface PlaybackRow {
  top: number; bottom: number; right: number;
  /** Independently paginated music has its own coordinate system. */
  printedMusic?: SVGGElement;
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

/** The printed score uses independently laid out heads, identified by their original IDs. */
export function printedGeometry(publication: PublicationResult, attacks: Map<string, Attack>): Geometry {
  const result: Geometry = new Map();
  for (const page of publication.pages) for (const system of page.svg.querySelectorAll('[data-system]')) {
    const music = system.lastElementChild as SVGGElement;
    const staves = Array.from(music.querySelectorAll<SVGGElement>('.vf-stave,.vf-tabstave'), s => s.getBBox());
    if (!staves.length) continue;
    const row = {
      top: Math.min(...staves.map(s => s.y)) - 7, bottom: Math.max(...staves.map(s => s.y + s.height)) + 7,
      right: Math.max(...staves.map(s => s.x + s.width)), printedMusic: music,
    };
    for (const group of music.querySelectorAll<SVGGElement>('.vf-stavenote,.vf-tabnote')) {
      const attack = attacks.get(group.getAttribute('data-vf-id'));
      if (!attack) continue;
      const heads: Point[] = [];
      let x = 0;
      const tab = group.classList.contains('vf-tabnote');
      const elements = group.querySelectorAll<SVGTextElement>(tab ? ':scope > text' : '.vf-notehead > text');
      elements.forEach((text, i) => {
        const box = text.getBBox();
        const point = { x: box.x + box.width / 2, y: Number(text.getAttribute('y')) };
        if (!i) x = point.x;
        const head = attack.heads[i];
        if (head && (head.sounding || head.midi !== undefined) && !attack.silent) heads.push(point);
      });
      if (elements.length) result.set(attack.id, { x, row, heads });
    }
  }
  return result;
}
