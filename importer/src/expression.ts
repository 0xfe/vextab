// Resolved source notation shared by the MusicXML and LilyPond readers and the expressive writer.
import type { Pitch } from './score.js';
import type { Time } from './time.js';

export type Side = 'above' | 'below';
/** String one is the highest string. Pitches in tuning are open, sounding pitches before the capo. */
export interface Guitar {
  kind: 'guitar';
  tuning: Pitch[];
  capo: number;
  view?: 'both' | 'tab' | 'notation';
}
/** A kit entry retains its display line, notehead, stem and sounding General MIDI key. */
export interface Drum {
  id: string;
  name: string;
  line: number;
  head: 'normal' | 'cross' | 'circle-cross' | 'triangle';
  stem: 'up' | 'down';
  midi: number;
}
export type Instrument = Guitar | { kind: 'drums'; map: Drum[] };
/** Head details index the authored pitches or drum positions in their original order. */
export interface HeadDetail {
  string?: number;
  stringSide?: Side | 'left' | 'right';
  fret?: number | 'x';
  drum?: string;
  tieStop?: boolean;
  tieStartId?: string;
  /** Engrave an outgoing tie on the source's chosen side, regardless of stem direction. */
  tieSide?: Side;
  /** Additional destinations reached on alternate volta passes. */
  tieStartIds?: string[];
  tieEndId?: string;
  finger?: { value: string; side: Side | 'left' | 'right' };
  forcedAccidental?: boolean;
  gesture?: 'hammer' | 'pull' | 'slide';
  bend?: number;
  releaseAfter?: Time;
}
/** A written slur, hairpin or beam can end after another span has started. */
export interface SpanPoint {
  kind: 'slur' | 'crescendo' | 'diminuendo' | 'beam';
  id: string;
  edge: 'start' | 'stop';
  side?: Side;
  niente?: boolean;
}
/** Attach underlay by verse and onset. Extenders count subsequent attacks. */
export interface Syllable {
  text: string;
  verse?: string;
  hyphen?: boolean;
  extend?: number;
  elideWith?: string;
}
/** Attach expression to a measured event, keeping all literal strings separate from grammar tokens. */
export interface Expression {
  /** Explicit written stem direction for this attack. */
  stem?: 'up' | 'down';
  label?: string;
  lyrics?: Syllable[];
  harmony?: { root: string; quality: string; bass?: string };
  frame?: { independent?: boolean; frets: (number | 'x')[]; barre?: [number, number, number] };
  dynamic?: 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';
  articulations?: { kind: 'accent' | 'staccato' | 'tenuto' | 'fermata' | 'marcato'; side?: Side }[];
  ornament?: 'tr' | 'turn' | 'turn_inverted' | 'mordent' | 'mordent_inverted';
  pedal?: ('down' | 'up')[];
  spans?: SpanPoint[];
  graceSide?: 'before' | 'after';
  graceSlashed?: boolean;
  graceSteal?: Time;
  pedalUpAtOnset?: boolean;
}
