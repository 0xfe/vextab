// Layout-independent score values. Fractions are reduced strings in whole notes.
import type { FretDiagramSpec, TimedStringBend } from 'vexflow';
import type { HeadMark } from './shorthand';
import type { SourceRange } from './source';

/** One picked attack starts above the physical fret and may return to it. */
export interface Prebend {
  semitones: number;
  release: boolean;
}

/** The free end lies above or below the played fret in pitch. */
export interface OpenSlide {
  edge: 'in' | 'out';
  side: 'above' | 'below';
}

export interface Head {
  range: SourceRange;
  written: string;
  marks?: HeadMark[]; // Bracketed fingering or accent attached to this head.
  drum?: string; // VexFlow kit identity. The written key supplies staff placement only.
  sounding: string | null; // A dead strike has a display position and no pitch.
  position?: { str: number; fret: number | 'X' };
  accidental?: string;
  cautionary?: boolean;
  connection?: 'hammer' | 'pull' | 'slide';
  hammer?: boolean; // Hammered destination of a fretted span.
  bend?: TimedStringBend;
  prebend?: Prebend;
  openSlide?: OpenSlide;
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
  restLine?: number;
  labels?: { text: string; position?: 'above' | 'below'; family?: string; size?: number; style?: 'normal' | 'bold' | 'italic'; ink?: string; range: SourceRange }[];
  gestures?: ({ kind: 'stroke' | 'brush' | 'roll' | 'rasgueado'; direction: 'up' | 'down' } | { kind: 'tap' | 'vibrato'; wide: boolean })[];
  color?: string; // Foreground override for this attack in both projections.
  silent?: SourceRange;
  bend?: { spec: TimedStringBend; range: SourceRange };
  chord?: { text: string; color?: string; range: SourceRange };
  frame?: { spec: FretDiagramSpec; range: SourceRange };
  lyric?: { text: string; hyphen: boolean; extend: number; range: SourceRange };
  duration: string;
  onset: string; // Relative to the start of this bar.
}

export interface Bar {
  type: string;
  range: SourceRange;
}

export type PianoHand = 'right' | 'left';

export interface MeasureVoice {
  /** A hand identifies the physical stave, independently of this voice's stem direction. */
  hand?: PianoHand;
  declaration: SourceRange;
  events: Attack[];
  tuplets: { start: number; count: number; numNotes: number; notesOccupied: number; range: SourceRange }[];
  span: string;
  stem?: 'up' | 'down';
  beams: boolean;
  beamGroups?: { start: number; end: number; range: SourceRange }[];
  tabStems: boolean;
  tabDirection: number;
  beatGroups?: number[];
  beamRests: boolean;
  stemlets: boolean;
  middleRests: boolean;
  opening?: Bar;
  closing?: Bar;
  boundaryRange?: SourceRange; // First prefix command awaiting an attack.
  keyChange?: string;
  rehearsal?: string;
  ending?: { label: string; bars: number; range: SourceRange };
}

export interface StaffState {
  piano?: boolean;
  color?: string; // Foreground for this stave declaration and its wrapped rows.
  declaration: SourceRange;
  notation: boolean;
  tab: boolean;
  strings: number;
  capo: number;
  tuning: string;
  key: string;
  clef: string;
  hideClef?: boolean;
  meter: string;
  meterSign?: string;
  showTime: boolean;
  timeRange: SourceRange;
  pickup?: string;
  fragment: boolean;
}

export interface MeasuredText {
  id: string; range: SourceRange; base: string; dots: number; text: string; glyph?: boolean;
  style: import('./grammar2/model').LaneStyle;
  boundaries?: { edge: 'start' | 'end'; text: string; glyph: boolean; style: import('./grammar2/model').LaneStyle; range: SourceRange }[];
}

export interface Measure {
  text?: MeasuredText[][];
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

/** Endings cover whole bars. A palm mute follows the selected physical strings in one voice. */
export type ScoreSpan = { id: string; from: string; to: string; range: SourceRange } & (
  { kind: 'volta'; label: string; firstBar: number; lastBar: number } |
  { kind: 'palmMute'; strings: number[] } | { kind: 'slur' } | { kind: 'hammer' | 'pull' | 'slide'; fromHead: number; toHead: number }
);

export interface ParsedScore {
  /** Authored part and staff identity used by the conductor and extracted editions. */
  instrument?: import('./grammar2/model').InstrumentIdentity & {
    staves: Partial<Record<import('./grammar2/model').StaffName, import('./grammar2/model').InstrumentIdentity>>;
  };
  layout?: import('./grammar2/model').ScoreLayout;
  /** Playback directives, when authored before the first flow stave. */
  playback?: { enabled: boolean; tempo?: number; instrument?: string };
  source: string;
  measures: Measure[];
  ties: Tie[];
  spans: ScoreSpan[];
  measureNumbers: boolean;
}
