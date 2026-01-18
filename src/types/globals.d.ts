// Global declarations for third-party libraries and build-time constants.

// Third-party globals.
// jQuery-style DOM helper (or compatible wrapper).
declare const $: any;
// QUnit test harness.
declare const QUnit: any;
// MIDI.js global for playback.
declare const MIDI: any;
// Paper.js global for overlay rendering.
declare const paper: any;

// Build-time constants.
// Build-time version string.
declare const __VERSION: string;
// Build-time git commit hash.
declare const __COMMITHASH: string;
// Build-time git branch name.
declare const __BRANCH: string;

declare interface Window {
  // Selector for auto-rendered VexTab elements.
  VEXTAB_SEL_V3?: string;
}
