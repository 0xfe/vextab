// Resolve a grammar-v2 instrument into the measured model shared by engraving and playback.
import { selectedPart, type PartSelector } from './conductor';
import type { ScoreV2 } from './grammar2/model';
import { projectScoreV2 } from './grammar2/project';
import type { ParsedScore } from './model';

export type { PartSelector } from './conductor';
export type { Attack, Head, Measure, MeasureVoice, ParsedScore, Tie } from './model';

/** Resolve the first or selected instrument. Treat its cached, revision-specific model as read-only. */
export function resolvePart(score: ScoreV2, selector: PartSelector = {}): ParsedScore {
  return projectScoreV2(score, selectedPart(score, selector));
}
