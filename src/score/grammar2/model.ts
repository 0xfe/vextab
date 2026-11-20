// Serializable musical values shared by v2 parser consumers. All times are exact whole-note fractions.

/** Half-open UTF-16 offsets in the original score, suitable for textarea.setSelectionRange. */
export type TextRange = [start: number, end: number];
export type PartKind = 'staff' | 'guitar' | 'piano' | 'drums';
export type StaffName = 'main' | 'upper' | 'lower';

/** Outermost invocation comes first. Each frame points to the authored use or block. */
export type ExpansionFrame = { range: TextRange } & (
  { pattern: string } | { iteration: number } | { tuplet: string }
);

/** A finger or a hammer belongs to one head. Accents belong to a whole attack. */
export type HeadMark = { kind: 'hammer'; range: TextRange } | {
  kind: 'finger'; value: number; side: 'left' | 'right' | 'above' | 'below'; range: TextRange;
};
export interface Accent { kind: 'accent'; range: TextRange }

/** IDs identify expanded attacks. A head number is zero-based in authored chord order. */
export interface HeadRef { event: string; head: number }
export type Head = { range: TextRange; marks: HeadMark[] } & (
  { pitch: string } | { drum: string } | { string: number; fret: number | 'x'; hammerFrom?: HeadRef }
);

export interface ScoreEvent {
  id: string;
  kind: 'attack' | 'rest' | 'skip';
  bar: number;
  at: string;
  writtenDuration: string;
  duration: string;
  /** The active written duration token, absent for the implicit quarter. */
  rhythmRange?: TextRange;
  range: TextRange;
  trace: ExpansionFrame[];
  heads: Head[];
  marks: Accent[];
}

/** Slice the owning voice's events from start (inclusive) to end (exclusive). */
export interface VoiceMeasure {
  number: number; start: number; end: number; barlineRange: TextRange; trace: ExpansionFrame[];
}

/** A written tuplet can contain another tuplet or cross a measure boundary. */
export type VoiceSpan =
  | { kind: 'tuplet'; ratio: string; first: string; last: string; range: TextRange }
  | { kind: 'hammer'; from: HeadRef; to: HeadRef; range: TextRange };

export interface ScoreVoice {
  name: string; range: TextRange; events: ScoreEvent[]; measures: VoiceMeasure[]; spans: VoiceSpan[];
}
export interface ScoreStaff { name: StaffName; range: TextRange; voices: ScoreVoice[] }
export interface ScorePart { kind: PartKind; range: TextRange; staves: ScoreStaff[] }

/** V2 keeps a single event list per voice. All parts share the meter and bar count. */
export interface ScoreV2 {
  language: 2; source: string; meter: string; meterRange?: TextRange; measureCount: number; parts: ScorePart[];
}
