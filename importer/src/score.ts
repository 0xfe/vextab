// Shared measured music, source diagnostics and conversion entry point.
import type { ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';

import type { Expression, HeadDetail, Instrument } from './expression.js';
import { writeScore } from './writer.js';
import { Time, zero } from './time.js';

/** Traditional major keys in circle-of-fifths order. */
export const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
/** Relative minor keys share the fifths index of their major signatures. */
export const minorKeys = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
/** Bound decoded plain sources and the score member selected from an MXL archive. */
export const sourceLimit = 1024 * 1024;

/** Written spelling and sounding MIDI are distinct even in this concert-pitch profile. */
export interface Pitch { step: string; alter: number; octave: number; sounding: number }
export function pitch(step: string, alter: number, octave: number): Pitch {
  const natural = [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(step)];
  return { step, alter, octave, sounding: (octave + 1) * 12 + natural + alter };
}

/** Voice ownership lives in the measure's voice map. Staff placement belongs to the individual event. */
export interface Event {
  kind: 'attack' | 'rest' | 'skip';
  staff: number;
  /** Active signature on the displaying staff at this onset. */
  key?: string;
  dots?: number;
  pitches?: Pitch[];
  tuplets?: { actual: number; normal: number; id: string }[];
  tieStart?: boolean;
  tieStop?: boolean;
  headDetails?: HeadDetail[];
  expression?: Expression;
  headRanges?: TextRange[];
  grace?: Pitch[][];
  file?: string;
  uses?: { file: string; range: TextRange }[];
  at: Time;
  elapsed: Time;
  denominator: number;
  pitch?: Pitch;
  range: TextRange;
}

/** The written bar may contain gaps in individual voices while its full timeline remains measured. */
export class Measure {
  part = 'staff';
  staff = 1;
  /** Explicit two-staff keyboard with independent owning and display staves. */
  piano = false;
  instrument?: Instrument;
  /** Opening General MIDI instrument, numbered from zero. */
  program?: number;
  clef = 'treble';
  sounds = 0;
  changes: { kind:'clef'|'key'|'sounds'; value:string|number; at:Time; range:TextRange }[] = [];
  tempos: { bpm:number; at:Time; range:TextRange }[] = [];
  group?: { symbol:'brace'|'bracket'; parts:string[] };
  pickup?: Time;
  fragment?: Time;
  range?: TextRange;
  repeatStart?: number;
  repeatEnd?: boolean;
  ending?: number;
  endingEnd?: boolean;
  label = '1';
  name = '';
  key = 'C';
  beats = 4;
  beatType = 4;
  extent = zero;
  voices = new Map<string, Event[]>();

  /** Extend the written bar by the event's exact elapsed time on its owning voice. */
  add(voice: string, event: Event, input: Input) {
    if (event.pitch && (event.pitch.sounding < 0 || event.pitch.sounding > 127))
      input.fail('unsupported', 'Sounding pitch exceeds the target MIDI range.', event.range);
    let events = this.voices.get(voice);
    if (!events) {
      if (this.voices.size >= 32) input.fail('limit', 'Staff exceeds 32 source voices.', event.range);
      this.voices.set(voice, events = []);
    }
    if (events.length >= 1024) input.fail('limit', 'Voice exceeds 1,024 source events.', event.range);
    events.push(event);
    const end = event.at.plus(event.elapsed);
    if (end.compare(this.extent) > 0) this.extent = end;
  }
}

/** Group measures by original part and staff without changing score order or written labels. */
export function groupStaves(bars: Measure[]) {
  const grouped = new Map<string, Measure[]>();
  for (const bar of bars) {
    const id = JSON.stringify([bar.part, bar.staff]);
    const group = grouped.get(id);
    if (group) group.push(bar);
    else grouped.set(id, [bar]);
  }
  return grouped;
}

/** Internal control flow distinguishes malformed input from programming errors. */
class ImportFailure extends Error {}

/** Keep options, locations and diagnostics scoped to a single call in either runtime. */
export class Input {
  /** A construct may require a newer host than the requested profile's baseline. */
  minimumVersion?: ImportResult['target']['minimumVersion'];
  /** A source with independent polyphonic voices can request pitch-driven neutral stems. */
  pitchStemPolicy = false;
  readonly diagnostics: ImportDiagnostic[] = [];
  context: Pick<ImportDiagnostic, 'part' | 'measure' | 'voice'> = {};
  readonly rootFile: string;
  constructor(public file: string, readonly options: ImportOptions) { this.rootFile = file; }

  /** A later repeat or lyric must never lower the version required by an earlier mark. */
  requireVersion(version: '6.5.0' | '6.6.0') {
    if (this.minimumVersion !== '6.6.0') this.minimumVersion = version;
  }

  /** A known loss can continue only when the caller selected partial conversion. */
  omit(message: string, range: TextRange) {
    if (this.options.mode !== 'partial') this.fail('unsupported', message, range);
    this.diagnostics.push({ ...this.context, code: 'unsupported', severity: 'warning', message, file: this.file, range });
  }

  fail(code: ImportDiagnostic['code'], message: string, range: TextRange): never {
    this.diagnostics.push({ ...this.context, code, severity: 'error', message, file: this.file, range });
    throw new ImportFailure(message);
  }

  omitMark(range: TextRange) {
    const message = 'Staccato is outside the measured-note profile.';
    if (this.options.mode !== 'partial') this.fail('omitted-mark', message, range);
    this.diagnostics.push({ ...this.context, code: 'omitted-mark', severity: 'warning',
      message: message + ' Omitted the mark.', file: this.file, range });
  }
}

/** A source error or unknown musical expression blocks both modes; only enumerated losses may pass. */
export function convert(options: ImportOptions, filename: string, read: (input: Input) => [Measure | Measure[], TextRange]): ImportResult {
  const input = new Input(options.filename ?? filename, options);
  return convertPrepared(input, () => read(input));
}

/** Commit a normalized score only after every input byte, including an archive member checksum, is verified. */
export function convertPrepared(input: Input, read: () => [Measure | Measure[], TextRange]): ImportResult {
  const options = input.options;
  const common = { target: targetVersion(options), diagnostics: input.diagnostics };
  try {
    if (options.capacity==='large' && !includesExtended(options))
      input.fail('limit','Large capacity requires the extended VexTab 6.3.0 target and a large-capacity host.',[0,0]);
    const [bar, range] = read();
    const document = writeScore(Array.isArray(bar) ? bar : [bar], input, range);
    if (input.minimumVersion) common.target.minimumVersion = input.minimumVersion;
    return { ...common, status: input.diagnostics.length ? 'partial' : 'exact', documents: [document] };
  } catch (error) {
    if (!(error instanceof ImportFailure)) throw error;
    return { ...common, status: 'failed', documents: [] };
  }
}

/** Read only meter signatures that the public grammar can express verbatim. */
export function meter(beats: string, unit: string, bar: Measure, input: Input, range: TextRange) {
  if (!/^(?:[1-9]|[12]\d|3[0-2])$/.test(beats) || !/^(?:1|2|4|8|16|32|64)$/.test(unit))
    input.fail('unsupported', 'Unsupported meter.', range);
  bar.beats = Number(beats);
  bar.beatType = Number(unit);
}

/** Report the host features the caller opted into, including on conversion failure. */
export function targetVersion(options:ImportOptions):ImportResult['target'] {
  return {language:2,minimumVersion:options.targetProfile==='expressive'?'6.4.0':options.targetProfile==='extended'?'6.3.0':'6.2.3',
    ...(options.capacity==='large' && {capacity:'large' as const})};
}

/** Both newer profiles can encode the staff state and larger documents introduced in M3. */
export function includesExtended(options: ImportOptions) {
  return options.targetProfile === 'extended' || options.targetProfile === 'expressive';
}
