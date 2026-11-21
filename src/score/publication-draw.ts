// Typed callbacks used by the bundled VexFlow 5.7 publication adapter.
import type { EasyScoreComposition, EasyScoreCompositionSpec, Factory, EasyScore, PublicationOptions } from 'vexflow';

/** A publication owns fresh notes and a factory for the complete part and each optional inset. */
export interface PartDrawingOptions extends PublicationOptions {
  drawComposition(spec: EasyScoreCompositionSpec, composition: EasyScoreComposition, factory: Factory, builder: EasyScore['builder'], insetMeasure?: number): void;
}

/** Measure lyric clearance at the final coordinates, before VexFlow paints SVG or Canvas. */
export function drawPrepared(factory: Factory, afterFormat: () => void) {
  const options: { retain?: boolean; afterFormat: () => void } = { afterFormat };
  factory.draw(options);
}
