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
  // Main parsing + rendering API.
  VexTab,
  // DOM plugin for rendering inside divs.
  Div,
  // Playback overlay for rendered notes.
  Player,
};
