// Inspect the measured notation used by browser views and playback for an authored v2 score.
import { parseScore } from '../src/score/parse';
import { projectScoreV2 } from '../src/score/grammar2/project';

export function readScore(source: string) {
  return projectScoreV2(parseScore(source));
}
