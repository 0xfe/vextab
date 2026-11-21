// Typed callbacks used by the bundled VexFlow publication adapter.
import type { ContinuousSpan, EasyScoreComposition, EasyScoreCompositionSpec, Factory, EasyScore, PublicationOptions } from 'vexflow';

/** A publication owns fresh notes and a factory for the complete part and each optional inset. */
export interface PartDrawingOptions extends PublicationOptions {
  insetSpans?(spec: EasyScoreCompositionSpec): readonly ContinuousSpan[];
  drawComposition(spec: EasyScoreCompositionSpec, composition: EasyScoreComposition, factory: Factory, builder: EasyScore['builder'], insetMeasure?: number): void;
}

/** Keep exactly those native spans whose two written endpoints survive in the quoted measure. */
export function spansForInset(inset: EasyScoreCompositionSpec, spans: readonly ContinuousSpan[]) {
  const ids = new Set<string>();
  for (const voice of inset.staves[0].measures[0].voices) {
    if (typeof voice.notes === 'string') continue;
    for (const note of voice.notes) if (typeof note === 'object' && 'id' in note) ids.add(note.id);
  }
  return spans.filter(span => ids.has(span.from) && ids.has(span.to));
}

/** Measure lyric clearance at the final coordinates, before VexFlow paints SVG or Canvas. */
export function drawPrepared(factory: Factory, afterFormat: () => void) {
  const options: { retain?: boolean; afterFormat: () => void } = { afterFormat };
  factory.draw(options);
}
