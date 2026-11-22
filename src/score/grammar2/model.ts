// Serializable musical values shared by v2 parser consumers. All times are exact whole-note fractions.

/** Half-open UTF-16 offsets in the original score, suitable for textarea.setSelectionRange. */
export type TextRange = [start: number, end: number];
/** Grace frets retain their authored string when several fingerings have the same pitch. */
export type GracePitch = string | { fret: number; string: number };
/** Address a fingering to a particular grace attack and a head within that attack. */
export interface GraceFingering { attack: number; head: number; finger: string; position: 'left' | 'right' | 'above' | 'below' }
export type PartKind = 'staff' | 'guitar' | 'piano' | 'drums';
export type StaffName = 'main' | 'upper' | 'lower';

/** Outermost invocation comes first. Each frame points to the authored use or block. */
export type ExpansionFrame = { range: TextRange } & (
  { pattern: string } | { iteration: number } | { tuplet: string }
);

/** A finger or a hammer belongs to one head. Accents belong to a whole attack. */
export type HeadMark = { kind: 'tieStart' | 'tieEnd'; name: string; range: TextRange } | { kind: 'write'; pitch: string; range: TextRange } | { kind: 'sign'; code: string; position: 'above' | 'below'; range: TextRange } | { kind: 'bend'; semitones: number; rise: [number, number]; hold?: [number, number]; release?: [number, number]; range: TextRange } |
  { kind: 'slideIn' | 'slideOut'; side: 'above' | 'below'; range: TextRange } |
  { kind: 'prebend'; semitones: number; release: boolean; range: TextRange } |
{ kind: 'release'; hold: [number, number]; release: [number, number]; range: TextRange } |
{ kind: 'gliss'; fromHead: number; range: TextRange } |
{ kind: 'tie' | 'hammer' | 'pull' | 'slide' | 'courtesy' | 'showSign'; range: TextRange } | {
  kind: 'finger' | 'stringNumber'; value: number | string; side: 'left' | 'right' | 'above' | 'below'; range: TextRange;
};
/** Literal annotations keep presentation separate from their source text. */
export interface TextStyle { position?: 'above' | 'below'; family?: string; size?: number; style?: 'normal' | 'italic' | 'bold'; ink?: string }
export interface LaneStyle extends TextStyle { line?: number; align?: 'left' | 'center' | 'right'; smooth?: boolean }
export interface TextLane { name: string; style: LaneStyle; voice: ScoreVoice }
export type Dynamic = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';
export type ExpressiveSpan = 'crescendo' | 'diminuendo' | 'continuousBeam' | 'feather' | 'tremolo';
export type EventMark =
  { kind: 'dynamic'; value: Dynamic; range: TextRange } |
  { kind: 'harmony'; root: string; quality: string; bass?: string; range: TextRange } |
  { kind: 'onStaff'; hand: 'upper' | 'lower'; range: TextRange } |
  { kind: 'sharedStem'; name: string; range: TextRange } |
  { kind: 'grace'; side: 'before' | 'after'; pitches: (GracePitch | GracePitch[])[]; fingerings?: GraceFingering[]; slash?: boolean; range: TextRange } |
  { kind: 'pedal'; action: 'down' | 'up'; range: TextRange } |
  { kind: 'ossia'; duration: string; notes: { pitch: string; ornament?: string }[]; range: TextRange } |
  { kind: 'ornament'; value: string; range: TextRange } | { kind: 'slash'; range: TextRange } | { kind: 'line'; value: number; range: TextRange } | { kind: 'text'; text: string; glyph?: boolean; style?: LaneStyle; range: TextRange } | { kind: 'ink'; value: string; range: TextRange } |
{ kind: 'frame'; frets: (number | 'x')[]; barre?: [number, number, number]; range: TextRange } |
{ kind: 'label'; text: string; style: TextStyle; range: TextRange } |
{ kind: 'stroke' | 'brush' | 'roll' | 'rasgueado'; direction: 'up' | 'down'; range: TextRange } |
{ kind: 'tap' | 'vibrato'; wide: boolean; range: TextRange } | { kind: 'accent'; range: TextRange } |
{ kind: 'symbol'; text: string; ink?: string; range: TextRange } |
  { kind: 'lyric'; verse?: string; elideWith?: string; text: string; hyphen: boolean; extend: number; range: TextRange };

/** IDs identify expanded attacks. A head number is zero-based in authored chord order. */
export interface HeadRef { event: string; head: number }
export type Head = { range: TextRange; marks: HeadMark[] } & (
  { pitch: string } | { drum: string } | { string: number; fret: number | 'x'; hammerFrom?: HeadRef }
);

export interface ScoreEvent {
  id: string;
  kind: 'attack' | 'rest' | 'skip' | 'slash';
  transpose?: number;
  soundingOctaves?: number;
  bar: number;
  at: string;
  writtenDuration: string;
  duration: string;
  /** The active written duration token, absent for the implicit quarter. */
  rhythmRange?: TextRange;
  range: TextRange;
  trace: ExpansionFrame[];
  heads: Head[];
  marks: EventMark[];
}

/** A written time signature retains its display form and source token. */
export interface WrittenMeter { value: string; sign?: string; range: TextRange }

/** Slice the owning voice's events from start (inclusive) to end (exclusive). */
export interface VoiceMeasure {
  meter?: string; meterSign?: string; meterRange?: TextRange; span?: string; fragment?: boolean; newRow?: boolean; rehearsal?: string; closing?: string; opening?: string;
  number: number; start: number; end: number; barlineRange: TextRange; trace: ExpansionFrame[];
}

/** A written tuplet can contain another tuplet or cross a measure boundary. */
export type VoiceSpan =
  | { kind: ExpressiveSpan; first: string; last: string; niente?: boolean; feather?: 'left' | 'right'; strokes?: number; range: TextRange }
  | { kind: 'tuplet'; ratio: string; first: string; last: string; range: TextRange }
  | { kind: 'palmMute' | 'slur' | 'beam'; side?: 'above' | 'below'; first: string; last: string; strings: number[]; range: TextRange } |
  { kind: 'hammer' | 'pull' | 'slide'; from: HeadRef; to: HeadRef; range: TextRange };

/** Measure numbers in written order. Endings identify their inclusive bar ranges. */
export interface WrittenRepeat { first: number; bodyEnd: number; endings: { first: number; last: number }[]; range: TextRange }

export interface TextBoundary { edge: 'start' | 'end'; text: string; glyph: boolean; range: TextRange; style: LaneStyle; bar: number }
export type VoiceSettings = Pick<PartSettings, 'stem' | 'beam' | 'beamRests' | 'stemlets' | 'middleRests' | 'tabStems' | 'tabDirection'>;
export interface ScoreVoice {
  settings?: VoiceSettings;
  boundaries?: TextBoundary[];
  name: string; range: TextRange; events: ScoreEvent[]; measures: VoiceMeasure[]; spans: VoiceSpan[]; repeats?: WrittenRepeat[];
}
/** Stable authored key, display labels and semitone distance from written to sounding pitch. */
export interface InstrumentIdentity { id?: string; name?: string; shortName?: string; sounds?: number }
export interface ScoreStaff extends Omit<InstrumentIdentity, 'name'> { displayName?: string; name: StaffName; range: TextRange; voices: ScoreVoice[] }
/** Optional front matter shared by the screen engraving and its printed edition. */
export interface ScoreHeading { align?: 'center'; title?: string; dedication?: string; tempo?: string; composer?: string }
export interface ScoreLayout { font?: 'Bravura' | 'Petaluma'; heading?: ScoreHeading; spacing?: 'optical'; firstSystemIndent?: number; width?: number; scale?: number; rowGap?: number; staffDistance?: number; top?: number }
/** Instrument declarations apply to every voice of the part. */
export interface PartSettings {
  program?: number;
  drums?: { id: string; label: string; line: number; head: 'normal' | 'cross' | 'circle-cross' | 'triangle'; stem: 'up' | 'down'; midi: number }[];
  meters?: Record<number, WrittenMeter>;
  cautionary?: boolean; displayMeter?: boolean; beatGroups?: number[]; stemlets?: boolean; middleRests?: boolean; tabDirection?: 'up' | 'down';
  changes?: Record<number, { tuning?: string; ink?: string; displayMeter?: boolean }>;
  keys?: Record<number, string>; ink?: string; beam?: boolean; beamRests?: boolean; tabStems?: boolean; stem?: 'up' | 'down';
  tuning?: string; capo?: number; key?: string; clef?: 'treble' | 'bass' | 'alto' | 'tenor' | 'none' | 'soprano' | 'mezzo-soprano' | 'baritone-c' | 'baritone-f' | 'subbass' | 'french' | 'percussion';
  view?: 'tab' | 'notation' | 'both';
}
export interface ScorePart extends PartSettings, InstrumentIdentity { measureCount?: number; text?: TextLane[]; kind: PartKind; range: TextRange; staves: ScoreStaff[] }

/** Printed measure references are one-based, including pickups and written fragments. */
export type BreakField = 'systemBreaks' | 'pageBreaks' | 'preferredTurns' | 'forbiddenTurns';
export interface EditionPaper {
  paper?: 'A4' | 'Letter';
  margins?: { top: number; right: number; bottom: number; left: number };
  staffSize?: number;
  title?: string; subtitle?: string; header?: string; footer?: string;
  pageNumbers?: boolean; compressRests?: boolean;
}
export interface Edition {
  part?: string;
  conductor?: boolean;
  range: TextRange;
  settings: EditionPaper;
  anchors: { field: BreakField; measure: number; range: TextRange }[];
  cues: { part: string; measure: number; label: string; range: TextRange }[];
}

/** V2 parts share a playback origin. measureCount is the largest local bar count. */
export interface ScoreV2 {
  editions?: Edition[];
  playback?: { enabled: boolean; controls?: import('../../playback/control-options.mts').SheetControls; tempos?: Record<number, number>; tempo?: number; swing?: import('../../playback/profiles.mts').SwingSetting; performer?: import('../../playback/profiles.mts').PerformerName; instrument?: string };
  transpose?: number; measureNumbers?: boolean; layout?: ScoreLayout;
  language: 2; source: string; meter: string; meterRange?: TextRange; pickup?: string; measureCount: number; parts: ScorePart[];
}
