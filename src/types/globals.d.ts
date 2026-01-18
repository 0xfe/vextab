// src/types/globals.d.ts
// Global declarations for third-party libraries and build-time constants.

declare const $: any; // jQuery-style DOM helper (or compatible wrapper).
declare const QUnit: any; // QUnit test harness.
declare const MIDI: any; // MIDI.js global for playback.
declare const paper: any; // Paper.js global for overlay rendering.
declare const __VERSION: string; // Build-time version string.
declare const __COMMITHASH: string; // Build-time git commit hash.
declare const __BRANCH: string; // Build-time git branch name.

declare interface Window {
  VEXTAB_SEL_V3?: string; // Selector for auto-rendered VexTab elements.
}
