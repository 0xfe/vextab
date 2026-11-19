// Layout-independent score values. Fractions are reduced strings in whole notes.
import type { SourceRange } from './source';

export interface Head {
  range: SourceRange;
  written: string;
  sounding: string;
  position?: { str: number; fret: number };
  accidental?: string;
  cautionary?: boolean;
  // A bare letter inherits the sign in force on the staff.
  inheritSign?: boolean;
}

export interface Attack {
  id: string;
  range: SourceRange;
  heads: Head[]; // Empty for a rest.
  base: string;
  dots: number;
  rhythmRange?: SourceRange; // The duration token can precede several attacks.
  slash: boolean;
  duration: string;
  onset: string; // Relative to the start of this bar.
}

export interface Bar {
  type: string;
  range: SourceRange;
}

export interface MeasureVoice {
  declaration: SourceRange;
  events: Attack[];
  tuplets: { start: number; count: number; numNotes: number; notesOccupied: number; range: SourceRange }[];
  span: string;
  stem?: 'up' | 'down';
  beams: boolean;
  tabStems: boolean;
  tabDirection: number;
  beamRests: boolean;
  stemlets: boolean;
  middleRests: boolean;
  opening?: Bar;
  closing?: Bar;
}

export interface StaffState {
  declaration: SourceRange;
  notation: boolean;
  tab: boolean;
  strings: number;
  tuning: string;
  key: string;
  clef: string;
  meter: string;
  showTime: boolean;
  timeRange: SourceRange;
  pickup?: string;
  fragment: boolean;
}

export interface Measure {
  number: number;
  range: SourceRange;
  state: StaffState;
  voices: MeasureVoice[];
  span: string;
  newRow: boolean;
}

/** Endpoints identify particular chord members, even across a measure boundary. */
export interface Tie {
  id: string;
  from: string;
  to: string;
  fromHead: number;
  toHead: number;
  range: SourceRange;
}

export interface ParsedScore {
  source: string;
  measures: Measure[];
  ties: Tie[];
}
