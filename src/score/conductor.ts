// Combine independently projected instruments into a single native VexFlow measure grid.
import type { ContinuousBoundary, EasyScoreComposition, EasyScoreCompositionSpec } from 'vexflow';
import type { ParsedScore } from './model';
import { ScoreError } from './source';
import type { InstrumentIdentity, ScoreV2 } from './grammar2/model';

/** A stable name and the historical zero-based selector address the same source instrument. */
export interface PartSelector { partId?: string; partIndex?: number }
export function selectedPart(score: ScoreV2, { partId, partIndex }: PartSelector): number {
  if (partId === undefined) return partIndex ?? 0;
  const found = score.parts.findIndex(part => part.id === partId);
  if (found < 0) throw new RangeError('No instrument with part ID ' + partId);
  if (partIndex !== undefined && partIndex !== found) throw new RangeError('partIndex and partId select different instruments');
  return found;
}

/** A display stave has a distinct owner even when notation and TAB read the same musical voice. */
function identity(score: ParsedScore, staff: string) {
  const role = staff === 'right' ? 'upper' : staff === 'left' ? 'lower' : 'main';
  return { role, staff: score.instrument?.staves[role] as InstrumentIdentity | undefined };
}

/** Names are native labels, so the formatter reserves their measured widths at system starts. */
export function instrumentLabel(score: ParsedScore, stave: string, primary: boolean) {
  const { role, staff } = identity(score, stave);
  if (!primary && role === 'main') return {};
  // An explicit empty stave label suppresses the default R.H. or L.H. on a solo piano system.
  const labels = (a?: string, b?: string) => [a, b].filter(Boolean).join(' ') || (b === '' ? '' : undefined);
  const name = labels(primary && score.instrument?.name, staff?.name);
  const shortName = labels(primary && (score.instrument?.shortName ?? score.instrument?.name), staff?.shortName ?? staff?.name);
  if (name === undefined && shortName === undefined) return {};
  return { name: name ?? shortName, shortName: shortName ?? name };
}

/** Refuse an incompatible grid before touching the host. Each extracted part remains valid. */
function checkGrid(scores: ParsedScore[]) {
  const reference = scores[0].measures;
  for (const [i, score] of scores.entries()) {
    const measures = score.measures;
    const name = score.instrument?.name ?? score.instrument?.id ?? 'part ' + (i + 1);
    for (let bar = 0; bar < Math.max(reference.length, measures.length); bar++) {
      if (!measures[bar] || !reference[bar] || measures[bar].span !== reference[bar].span) {
        const m = measures[bar] ?? measures[measures.length - 1];
        throw new ScoreError('fixed-layout', 'Conductor measures must share a span: ' + name + ', bar ' + (bar + 1),
          measures[bar] && reference[bar] && measures[bar].state.meter !== reference[bar].state.meter ? m.state.timeRange : m.range);
      }
    }
  }
}

/** A system break in any written part applies to the shared grid. Conflicting rehearsal signs need a decision. */
function boundaries(scores: ParsedScore[], specs: EasyScoreCompositionSpec[]): ContinuousBoundary[] {
  return specs[0].continuous.boundaries.map((first, bar) => {
    const result = { ...first };
    for (let p = 1; p < specs.length; p++) {
      const incoming = specs[p].continuous.boundaries[bar];
      if (incoming.breakBefore) result.breakBefore = incoming.breakBefore;
      if (incoming.repeatStart) result.repeatStart = true;
      if (incoming.repeatEnd) result.repeatEnd = true;
      if (incoming.rehearsal) {
        if (result.rehearsal && result.rehearsal !== incoming.rehearsal)
          throw new ScoreError('fixed-layout', 'Conflicting conductor rehearsal marks', scores[p].measures[bar].range);
        result.rehearsal = incoming.rehearsal;
      }
    }
    return result;
  });
}

/** Namespace native stave and group IDs while retaining authored note and span IDs in each projection. */
export function conductorSpec(scores: ParsedScore[], specs: EasyScoreCompositionSpec[]): EasyScoreCompositionSpec {
  checkGrid(scores);
  function staveId(part: number, stave: string) {
    const score = scores[part];
    const { role, staff } = identity(score, stave);
    const owner = (score.instrument?.id ?? part + 1) + '.' + (staff?.id ?? role);
    return role === 'main' && score.measures[0].state.tab ? owner + '.' + stave : owner;
  }
  const staves = specs.flatMap((spec, p) => spec.staves.map(stave => ({ ...stave, id: staveId(p, stave.id),
    measures: stave.measures.map(m => ({ ...m, voices: m.voices.map(v => ({ ...v, notes: typeof v.notes === 'string' ? v.notes :
      v.notes.map(n => typeof n === 'object' && 'stave' in n && typeof n.stave === 'string' ? { ...n, stave: staveId(p, n.stave) } : n) })) })) })));
  const groups = specs.flatMap((spec, p) => spec.continuous.groups.map(g => ({ ...g, first: staveId(p, g.first), last: staveId(p, g.last) })));
  if (scores.length > 1) groups.push({ first: staves[0].id, last: staves[staves.length - 1].id, type: 'bracket', barlines: groups.length === 0 });
  return { ...specs[0], staves, continuous: { ...specs[0].continuous, groups, boundaries: boundaries(scores, specs),
    splitChords: specs.flatMap(spec => spec.continuous.splitChords ?? []), spans: specs.flatMap(spec => spec.continuous.spans) } };
}

/** Per-part decoration uses local stave indices; the underlying notes, systems and shared sheet are identical. */
export function instrumentComposition(full: EasyScoreComposition, start: number, count: number): EasyScoreComposition {
  const slice = <T>(bars: T[][]) => bars.map(staves => staves.slice(start, start + count));
  return { ...full, staves: slice(full.staves), notes: slice(full.notes), voices: slice(full.voices) };
}
