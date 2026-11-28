// Index the written rhythmic columns and physical staves of one engraved screen score.
import type { EasyScoreComposition, HeadOccurrenceIndex, Stave } from 'vexflow';
import type { ParsedScore, PianoHand } from './model';

/** Fractions and numbers both count whole notes from the beginning of the written measure. */
export interface ScoreLocation {
  partIndex: number;
  measure: number;
  offset: number | string;
  staffIndex?: number;
}

/** Edges in the unscaled coordinate system used by the screen renderer. */
export interface ScoreBounds { left: number; right: number; top: number; bottom: number }

/** A cursor and the written attacks starting on its physical staff. Systems and measures start at one. */
export interface ScoreLayoutPosition extends ScoreLocation {
  offset: number;
  staffIndex: number;
  system: number;
  x: number;
  staffCenterY: number;
  staffBounds: Readonly<ScoreBounds>;
  systemBounds: Readonly<ScoreBounds>;
  eventIds: readonly string[];
}

/** Each render owns its geometry. Client coordinates use the surface's current CSS transform. */
export interface ScoreLayoutMap {
  positionAt(location: ScoreLocation): ScoreLayoutPosition | undefined;
  hitTest(point: { x: number; y: number }): ScoreLayoutPosition | undefined;
  clientPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | undefined;
}

/** The local composition exposes the rendered staves of one original instrument. */
interface Instrument {
  partIndex: number;
  score: ParsedScore;
  local: EasyScoreComposition;
  view: { staves: StaffName[]; eventId(staff: StaffName, event: string): string };
}
/** Names used by the screen renderer for each projection of an instrument. */
type StaffName = 'notation' | 'tab' | PianoHand;

/** A pair of staves can project the same source event. Cross-staff notes use their displayed stave. */
interface Staff {
  partIndex: number;
  staffIndex: number;
  bounds: ScoreBounds;
}

/** Simultaneous voices share a rhythmic column, even when their heads are optically displaced. */
interface Anchor {
  time: number;
  x: number;
  events: Map<Staff, string[]>;
}

/** All instruments on this measure share the same forward and inverse interpolation. */
interface Bar {
  measure: number;
  system: number;
  systemBounds: ScoreBounds;
  staves: Staff[];
  anchors: Anchor[];
}

/** Only accept a complete, nonnegative whole-note fraction with a positive denominator. */
export function wholeNotes(offset: ScoreLocation['offset']): number {
  if (typeof offset === 'number') return offset;
  if (!/^\d+\/[1-9]\d*$/.test(offset)) return NaN;
  const [numerator, denominator] = offset.split('/').map(Number);
  return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) ? numerator / denominator : NaN;
}

/** Half a staff space outside the lines gives single-line percussion a usable target too. */
function staffBounds(stave: Stave): ScoreBounds {
  const margin = stave.getSpacingBetweenLines() / 2;
  return { left: stave.getX(), right: stave.getX() + stave.getWidth(),
    top: stave.getYForLine(0) - margin, bottom: stave.getYForLine(stave.getNumLines() - 1) + margin };
}

/** Read the head-independent formatter column. A centered whole rest still starts at the downbeat. */
function measureMap(instruments: Instrument[], measure: number, system: number, systemBounds: ScoreBounds): Bar {
  const physical = new Map<Stave, Staff>();
  const columns = new Map<number, Anchor>();
  for (const instrument of instruments) {
    const { partIndex, score, local, view } = instrument;
    const bar = score.measures[measure - 1];
    const staves = local.staves[measure - 1];
    staves.forEach((stave, staffIndex) => physical.set(stave, { partIndex, staffIndex, bounds: staffBounds(stave) }));
    for (const [index, name] of view.staves.entries()) {
      for (const voice of bar.voices) {
        if (voice.hand && voice.hand !== name) continue;
        for (const attack of voice.events) {
          const time = wholeNotes(attack.onset);
          const note = local.getNote(view.eventId(name, attack.id));
          let anchor = columns.get(time);
          if (!anchor) {
            const x = note.getAbsoluteX() - (note.isCenterAligned() ? note.getCenterXShift() : 0);
            anchor = { time, x, events: new Map() };
            columns.set(time, anchor);
          }
          const staff = physical.get(note.getStave()) ?? physical.get(staves[index]);
          const ids = anchor.events.get(staff);
          if (ids) ids.push(attack.id);
          else anchor.events.set(staff, [attack.id]);
        }
      }
    }
  }
  const anchors = [...columns.values()].sort((a, b) => a.time - b.time);
  const staves = [...physical.values()];
  // The end of a pickup or fragment is its actual written span, at the closing barline.
  anchors.push({ time: wholeNotes(instruments[0].score.measures[measure - 1].span), x: staves[0].bounds.right, events: new Map() });
  return { measure, system, systemBounds, anchors, staves };
}

/** Look up the first column at or after the requested time or x-coordinate. */
function nextAnchor(anchors: Anchor[], value: number, axis: 'time' | 'x'): number {
  let low = 0, high = anchors.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (anchors[mid][axis] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Interpolate inside one engraved interval in either direction. */
function interpolate(value: number, start: number, end: number, from: number, to: number): number {
  return from + (value - start) / (end - start) * (to - from);
}

/** Only an exact column identifies attacks. Between columns the cursor carries written time alone. */
function cursor(bar: Bar, staff: Staff, offset: number, x: number, anchor?: Anchor): ScoreLayoutPosition {
  const { partIndex, staffIndex, bounds } = staff;
  return { partIndex, staffIndex, measure: bar.measure, offset, system: bar.system, x,
    staffBounds: bounds, staffCenterY: (bounds.top + bounds.bottom) / 2, systemBounds: bar.systemBounds,
    eventIds: anchor?.events.get(staff) ?? [] };
}

/** Pointer events and CSS transforms may round coordinates to a fraction of a local pixel. */
const snapDistance = 0.5;

/** Invert the formatter's spacing within a staff band, including the closing barline. */
function hitBar(bar: Bar, x: number, y: number): ScoreLayoutPosition | undefined {
  const anchors = bar.anchors;
  if (x < anchors[0].x - snapDistance || x > anchors[anchors.length - 1].x + snapDistance) return;
  const staff = bar.staves.find(s => y >= s.bounds.top && y <= s.bounds.bottom);
  if (!staff) return;
  const index = Math.min(anchors.length - 1, nextAnchor(anchors, x, 'x'));
  const end = anchors[index], start = anchors[index - 1];
  // A subpixel pointer conversion can land either side of an exact printed column.
  const nearest = start && x - start.x < end.x - x ? start : end;
  if (Math.abs(nearest.x - x) <= snapDistance) return cursor(bar, staff, nearest.time, nearest.x, nearest);
  return cursor(bar, staff, interpolate(x, start.x, end.x, start.time, end.time), x);
}

/** Capture the unscaled Canvas size once, since CSS can change the displayed size after rendering. */
export function screenClientPoint(surface: SVGSVGElement | HTMLCanvasElement): ScoreLayoutMap['clientPoint'] {
  if (surface instanceof SVGSVGElement) return ({ clientX, clientY }) => {
    const matrix = surface.getScreenCTM();
    if (!matrix) return;
    const { x, y } = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  };
  const width = parseFloat(surface.style.width), height = parseFloat(surface.style.height);
  return ({ clientX, clientY }) => {
    const box = surface.getBoundingClientRect();
    if (box.width && box.height) return { x: (clientX - box.left) * width / box.width, y: (clientY - box.top) * height / box.height };
  };
}

/** Index one screen layout, including the conductor's common rhythmic columns. */
export function scoreLayoutMap(composition: EasyScoreComposition, instruments: Instrument[],
  heads: HeadOccurrenceIndex, displayStaves: readonly { id: string }[], clientPoint: ScoreLayoutMap['clientPoint']): ScoreLayoutMap {
  const rows = composition.sheet.getContinuousLayout().rows;
  const bars: Bar[] = [];
  const systemBounds = rows.map(row => {
    const staves = row.measures.flatMap(number => composition.staves[number - 1].map(staffBounds));
    return { left: Math.min(...staves.map(s => s.left)), right: Math.max(...staves.map(s => s.right)),
      top: Math.min(...staves.map(s => s.top)), bottom: Math.max(...staves.map(s => s.bottom)) };
  });
  rows.forEach((row, index) => {
    for (const number of row.measures) bars[number - 1] = measureMap(instruments, number, index + 1, systemBounds[index]);
  });

  return {
    clientPoint,
    positionAt({ partIndex, staffIndex = 0, measure, offset }) {
      if (!Number.isInteger(measure)) return;
      const bar = bars[measure - 1];
      const staff = bar?.staves.find(s => s.partIndex === partIndex && s.staffIndex === staffIndex);
      const time = wholeNotes(offset);
      if (!staff || !Number.isFinite(time) || time < 0) return;
      const index = nextAnchor(bar.anchors, time, 'time');
      const end = bar.anchors[index];
      if (!end) return;
      if (end.time === time) return cursor(bar, staff, time, end.x, end);
      const start = bar.anchors[index - 1];
      if (start) return cursor(bar, staff, time, interpolate(time, start.time, end.time, start.x, end.x));
    },
    hitTest({ x, y }) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const system = systemBounds.findIndex(b => y >= b.top && y <= b.bottom && x >= b.left - snapDistance && x <= b.right + snapDistance);
      if (system >= 0) {
        for (const number of rows[system].measures) {
          const hit = hitBar(bars[number - 1], x, y);
          if (hit) return hit;
        }
      }
      // A ledger-line head can lie outside every staff band. Use its physical display staff.
      const head = heads.hitTest(x, y);
      if (!head || head.reference || head.role === 'mark') return;
      const bar = bars[head.measure - 1];
      const staff = bar.staves[displayStaves.findIndex(s => s.id === head.staff)];
      const anchor = bar.anchors.find(a => a.events.get(staff)?.includes(head.sourceEvent));
      if (anchor) return cursor(bar, staff, anchor.time, anchor.x, anchor);
    },
  };
}
