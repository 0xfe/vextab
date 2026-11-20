// Entry-point barrel that re-exports the public VexTab API for bundlers and consumers.
import Vex from './vexflow';
import Artist from './artist';
import VexTab from './vextab';
import Div from './div';
import Player from './player';

export {
  // VexFlow export (aliased for legacy API paths).
  Vex,
  // Core renderer for VexTab content.
  Artist,
  // Stateful v2 parser, with explicit v1 support for the fixed-layout Artist.
  VexTab,
  // DOM plugin for rendering inside divs.
  Div,
  // Playback overlay for rendered notes.
  Player,
};

export { parseScore, ScoreError, ScoreV2Error, type ScoreV2, type ParsedScore, type SourceRange } from './score/parse';
export { renderScore, renderScorePart, type Part } from './score/layout';

export { createWebAudioPlayback } from './playback/web-audio';
export { createSpessaSynthPlayback, type SpessaSynthHost } from './playback/spessasynth';
export type { PlaybackPlugin, PlaybackSession, PlaybackNote, PitchPoint } from './playback/transport';
export type { PlayerOptions } from './player';
export type { DivOptions } from './div';
