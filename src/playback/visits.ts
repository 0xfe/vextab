// Expand finite written repeat blocks into source measure visits for opt-in performed playback.
import type { ParsedScore } from '../score/model';
import { ScoreError } from '../score/source';

/** Voltas own their written endings. Plain repeat barlines play the enclosed passage twice. */
export function measureVisits(score: ParsedScore, performed: boolean): number[] {
  const written = score.measures.map(m => m.number);
  if (!performed) return written;
  const repeats = [...(score.repeats ?? [])];
  for (const repeat of repeats) {
    if (repeat.count !== undefined && (!Number.isInteger(repeat.count) || repeat.count < 2 || repeat.count > 32 || repeat.endings.length))
      throw new ScoreError('measure', 'Invalid counted repeat', score.measures[0].range);
    let last = repeat.bodyEnd;
    if (!Number.isInteger(repeat.first) || !Number.isInteger(last) || repeat.first < 1 || last < repeat.first || last > written.length)
      throw new ScoreError('measure', 'Invalid repeat body', score.measures[0].range);
    for (const ending of repeat.endings) {
      if (ending.first !== last + 1 || !Number.isInteger(ending.last) || ending.last < ending.first || ending.last > written.length)
        throw new ScoreError('measure', 'Invalid repeat ending', score.measures[repeat.first - 1].range);
      last = ending.last;
    }
  }
  const starts: number[] = [];
  const knownEnds = new Set(repeats.flatMap(r => r.count ? [r.bodyEnd] : r.endings.slice(0, -1).map(e => e.last)));
  for (const bar of score.measures) {
    const v = bar.voices[0];
    if (['repeat-begin','repeat-both'].includes(v.opening?.type) && !repeats.some(r => r.first === bar.number)) starts.push(bar.number);
    if (['repeat-end','repeat-both'].includes(v.closing?.type) && !knownEnds.has(bar.number)) {
      const first = starts.pop() ?? 1;
      repeats.push({ first, bodyEnd: bar.number, endings: [], range: [bar.range.start, bar.range.end] });
    }
  }
  // A nested volta can start on its parent's first bar. Expand the enclosing block first.
  const lastBar = (repeat: (typeof repeats)[number]) => repeat.endings[repeat.endings.length - 1]?.last ?? repeat.bodyEnd;
  repeats.sort((a, b) => a.first - b.first || lastBar(b) - lastBar(a));
  const visits: number[] = [];
  function walk(first: number, last: number, blocks: typeof repeats) {
    for (let n = first; n <= last; n++) {
      const repeat = blocks.find(b => b.first === n && lastBar(b) <= last);
      if (!repeat) {
        if (visits.length >= 16384) throw new ScoreError('measure', 'Performed repeat exceeds 16384 bar visits', score.measures[n - 1].range);
        visits.push(n);
        continue;
      }
      const children = blocks.filter(b => b !== repeat);
      for (let pass = 0; pass < (repeat.count ?? Math.max(2, repeat.endings.length)); pass++) {
        walk(n, repeat.bodyEnd, children);
        const ending = repeat.endings[pass];
        if (ending) walk(ending.first, ending.last, children);
      }
      n = lastBar(repeat);
    }
  }
  walk(1, written.length, repeats);
  return visits;
}

/** Parts on the same meter grid follow a shared repeat. Independent meters keep their own visits. */
export function ensembleVisits(scores: ParsedScore[], performed: boolean): Map<ParsedScore, number[]> {
  const result = new Map<ParsedScore, number[]>();
  const grids = new Map<string, number[]>();
  for (const score of scores) {
    const visits = measureVisits(score, performed);
    result.set(score, visits);
    if (visits.length === score.measures.length) continue;
    const grid = score.measures.map(m => m.span).join(',');
    const shared = grids.get(grid);
    if (shared && (shared.length !== visits.length || shared.some((n, i) => n !== visits[i])))
      throw new ScoreError('measure', 'Parts disagree about the performed repeat order', score.measures[0].range);
    grids.set(grid, visits);
  }
  if (grids.size) for (const score of scores) {
    const visits = grids.get(score.measures.map(m => m.span).join(','));
    if (visits) result.set(score, visits);
  }
  return result;
}
