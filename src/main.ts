// src/main.ts
// Entry-point barrel that re-exports the public VexTab API for bundlers and consumers.

import Vex from './vexflow'; // VexFlow compatibility shim + canonical export.
import Artist from './artist'; // Rendering orchestrator used by VexTab.
import VexTab from './vextab'; // Parser + compiler entry point.
import Div from './div'; // Legacy DIV plugin adapter.
import Player from './player'; // Optional playback overlay helper.

export {
  Vex, // VexFlow export (aliased for legacy API paths).
  Artist, // Core renderer for VexTab content.
  VexTab, // Main parsing + rendering API.
  Div, // DOM plugin for rendering inside divs.
  Player, // Playback overlay for rendered notes.
};
