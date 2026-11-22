// Fit hands and adjacent piano systems against the horizontal extent of their engraved ink.
import { Beam, Clef, FretHandFinger, KeySignature, Modifier, StaveNote, TimeSignature, measureEngraving,
  type Bounds, type ContinuousRow, type ContinuousSpan, type EasyScoreComposition, type SpanFragment } from 'vexflow';
import { ossiaLift, ossiaReadings, pedalInk, placeOssia } from './score-details';

/** Each strip covers half a staff space at typical page widths. Rounding outwards protects thin stems. */
class StaffProfile {
  readonly top: Float64Array;
  readonly bottom: Float64Array;
  private readonly step: number;
  constructor(private row: ContinuousRow, private origin: number, space: number) {
    this.step = Math.max(space / 2, row.width / 4096);
    const length = Math.ceil(row.width / this.step) + 1;
    this.top = new Float64Array(length);
    this.bottom = new Float64Array(length).fill(4 * space);
  }
  columns(x1: number, x2: number): [number, number] {
    return [Math.max(0, Math.floor((x1 - this.row.x) / this.step)),
      Math.min(this.top.length - 1, Math.floor((x2 - this.row.x) / this.step))];
  }
  add(box: Bounds) {
    const [first, last] = this.columns(box.x - 1, box.x + box.w + 1);
    for (let i = first; i <= last; i++) {
      this.top[i] = Math.min(this.top[i], box.y - this.origin);
      this.bottom[i] = Math.max(this.bottom[i], box.y + box.h - this.origin);
    }
  }
}

/** Fingering digits have native text metrics but are absent from VexFlow's note ink report. */
function fingeringInk(mark: FretHandFinger, note: StaveNote) {
  const position = mark.getPosition();
  const { x, y } = note.getModifierStartXY(position, mark.getIndex());
  const above = position === Modifier.Position.ABOVE, below = position === Modifier.Position.BELOW;
  const dx = above ? -4 : below ? -2 : position === Modifier.Position.LEFT ? -mark.getWidth() + 4 : 1;
  return mark.getTextInk(x + dx, y + (above ? -7 : below ? 15 : 5));
}

/** Measure at the coordinates chosen by the native formatter. Keep special cross-staff structures on its own solver. */
function profile(score: EasyScoreComposition, row: ContinuousRow, staff: number) {
  const first = score.staves[row.measures[0] - 1][staff];
  const origin = first.getYForLine(0);
  const result = new StaffProfile(row, origin, first.space(1));
  const measured = new Set();
  const cues: StaveNote[] = [];
  let canFitOutside = true;
  for (const bar of row.measures) {
    const stave = score.staves[bar - 1][staff];
    for (const mark of stave.getModifiers()) {
      if (mark instanceof Clef || mark instanceof TimeSignature) result.add(mark.getInkBounds());
      if (mark instanceof KeySignature) for (const box of mark.getInkParts()) result.add(box);
    }
    for (const note of score.notes[bar - 1][staff].flat()) {
      if (!(note instanceof StaveNote)) return;
      if (note.getStave() !== stave) return;
      if (note.renderOptions.draw === false) continue;
      if (ossiaReadings.has(note)) cues.push(note);
      const pedal = pedalInk(note);
      if (pedal) for (const part of pedal) result.add(part);
      else canFitOutside = false;
      const shape = measureEngraving(note, { extension: owner => owner instanceof FretHandFinger
        ? { parts: [fingeringInk(owner, note)], anchors: {} } : undefined });
      if (shape.diagnostics.length) return;
      for (const box of shape.parts) result.add(box);
      for (const element of [note.getBeam(), ...note.getTupletStack()]) {
        if (!element || measured.has(element)) continue;
        measured.add(element);
        if (element instanceof Beam) {
          for (const strip of element.getStripBounds()) result.add(strip);
        } else result.add(element.getBoundingBox());
      }
    }
  }
  return { surface: result, cues, canFitOutside };
}

/** Bound each slice of a routed curve by its local chord and the maximum rise of its control points. */
function reserveCurve(profile: StaffProfile, f: SpanFragment) {
  const sign = f.above ? -1 : 1, lift = sign * f.rise;
  const a = f.y1 + lift * (f.part === 'last' || f.part === 'middle' ? 0.35 : 1);
  const b = f.y2 + lift * (f.part === 'first' || f.part === 'middle' ? 0.35 : 1);
  // For native ties the quadratic midpoint control is the mean of a and b.
  const controls = f.kind === 'tie' ? [f.y1, (a + b) / 2, f.y2] : [f.y1, a, b, f.y2];
  function slice(x: number, width: number, ys: number[]) {
    if (width <= f.space || Math.max(...ys) - Math.min(...ys) <= 2) {
      const pad = f.space * 0.25;
      profile.add({ x, w: width, y: Math.min(...ys) - pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad });
      return;
    }
    // De Casteljau subdivision gives conservative bounds even at a sharp arch.
    const left = [ys[0]], right = [ys[ys.length - 1]];
    while (ys.length > 1) {
      ys = ys.slice(1).map((y, i) => (y + ys[i]) / 2);
      left.push(ys[0]); right.unshift(ys[ys.length - 1]);
    }
    slice(x, width / 2, left);
    slice(x + width / 2, width / 2, right);
  }
  slice(f.x1, f.x2 - f.x1, controls);
}

interface RowSpan { spec: ContinuousSpan; first: { staff: number }; last: { staff: number } }
interface Brace { type: string; first: number; last: number }

/** A cue can approach the primary music wherever its own staff and label will actually sit. */
function fitCues(hand: ReturnType<typeof profile>, row: ContinuousRow) {
  for (const anchor of hand.cues) {
    const reading = ossiaReadings.get(anchor);
    const stave = anchor.checkStave(), space = stave.space(1);
    const { box } = placeOssia(reading, anchor, row);
    const [start, end] = hand.surface.columns(box.x, box.x + box.w);
    const bottom = Math.max(...hand.surface.bottom.subarray(start, end + 1)) / space;
    // The fallback leaves 2.5 spaces above the cue's highest ornament. Fit that edge
    // against the host notes, fingers and slurs, with half a space of breathing room.
    ossiaLift.set(anchor, 6.5 - bottom - 0.55);
    hand.surface.add(placeOssia(reading, anchor, row).box);
  }
}

/** Profiles are relative to their own staff, so they survive the final row translation. */
interface SystemEdges { upper: StaffProfile; lower: StaffProfile; space: number }
interface FittedRow extends ContinuousRow { systemEdges?: SystemEdges }

/** Keep the lowest pedal or displaced cue inside the score surface, including on its final row. */
export function includeSystemBottom(score: EasyScoreComposition, row: ContinuousRow, edges: SystemEdges) {
  const bass = score.staves[row.measures[0] - 1][1];
  const bottom = bass.getYForLine(0) + Math.max(...edges.lower.bottom) + edges.space * 0.5;
  row.height = Math.max(row.height, bottom - row.y);
}

/** How much of the two rectangular system margins can safely be shared at this width? */
export function sharedSystemSpace(score: EasyScoreComposition, previous: FittedRow | undefined,
  current: ContinuousRow, edges: SystemEdges) {
  if (!previous?.systemEdges || !edges || previous.x !== current.x || Math.abs(previous.width - current.width) > 0.01) return 0;
  const above = previous.systemEdges.lower.bottom, below = edges.upper.top;
  if (above.length !== below.length || edges.space !== previous.systemEdges.space) return 0;
  const bass = score.staves[previous.measures[0] - 1][1], treble = score.staves[current.measures[0] - 1][0];
  const margins = previous.y + previous.height - bass.getYForLine(0) + treble.getYForLine(0) - current.y;
  // Keep a visual break between systems even where both hands stay inside the staff.
  // The authored screen or page gap is added after this minimum clearance.
  let needed = edges.space * 8;
  for (let i = 0; i < above.length; i++) needed = Math.max(needed, above[i] - below[i] + edges.space * 0.7);
  return margins - needed;
}

/** Return distances in rendering units and hairpin baselines relative to the stave origin. */
export function fitGrandStaff(score: EasyScoreComposition, row: ContinuousRow, groups: Brace[], spans: RowSpan[],
  fragments: SpanFragment[], minimumSpaces: number) {
  const distances = new Map<number, number>(), baselines = new Map<string, number>();
  const owners = new Map(spans.map(span => [span.spec.id, span]));
  let systemEdges: SystemEdges;
  for (const group of groups) {
    const right = profile(score, row, group.first), left = profile(score, row, group.last);
    if (!right || !left) continue;
    const upper = right.surface, lower = left.surface;
    const crossesHands = spans.some(s => s.first.staff !== s.last.staff &&
      [group.first, group.last].some(i => i === s.first.staff || i === s.last.staff));
    if (crossesHands) continue;
    const inward = fragments.filter(f => {
      const span = owners.get(f.id);
      return span && (span.first.staff === group.first && !f.above || span.first.staff === group.last && f.above);
    });
    if (inward.some(f => !['slur','tie','crescendo','diminuendo'].includes(f.kind) || f.bend)) continue;
    const first = score.staves[row.measures[0] - 1];
    const space = first[group.first].space(1);
    for (const f of fragments) {
      const staff = owners.get(f.id)?.first.staff;
      if (staff !== group.first && staff !== group.last) continue;
      const surface = staff === group.first ? upper : lower;
      if (f.kind === 'tie' || f.kind === 'slur') reserveCurve(surface, f);
      else if (!inward.includes(f) && (f.kind === 'crescendo' || f.kind === 'diminuendo'))
        surface.add({ x: f.x1, w: f.x2 - f.x1, y: f.y1 - space, h: 2 * space });
    }
    fitCues(right, row);
    fitCues(left, row);
    if (first.length === 2 && right.canFitOutside && left.canFitOutside && !row.restGroups.length &&
        fragments.every(f => !f.bend && ['slur', 'tie', 'crescendo', 'diminuendo'].includes(f.kind)))
      systemEdges = { upper, lower, space };
    for (const f of inward) {
      if (f.kind !== 'crescendo' && f.kind !== 'diminuendo') continue;
      const surface = f.above ? lower : upper, stave = first[owners.get(f.id).first.staff];
      const [start, end] = surface.columns(f.x1, f.x2);
      if (end < start) continue;
      const edge = f.above ? Math.min(...surface.top.subarray(start, end + 1)) : Math.max(...surface.bottom.subarray(start, end + 1));
      const center = stave.getYForLine(0) + edge + (f.above ? -1 : 1) * space * 1.05;
      baselines.set(f.id, center - stave.getY());
      surface.add({ x: f.x1, w: f.x2 - f.x1, y: center - space * 0.6, h: space * 1.2 });
    }
    let distance = minimumSpaces * space;
    for (let i = 0; i < upper.bottom.length; i++)
      distance = Math.max(distance, upper.bottom[i] - lower.top[i] + space * 0.65);
    distances.set(group.last, distance);
  }
  const staves = score.staves[row.measures[0] - 1];
  const needsRefit = [...distances].some(([b, distance]) =>
    Math.abs(staves[b].getY() - staves[b - 1].getY() - distance) > 0.01);
  return { distances, baselines, systemEdges, needsRefit: needsRefit || baselines.size > 0 };
}
