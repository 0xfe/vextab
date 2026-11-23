// Shared measured music, source diagnostics and conversion entry point.
import type { ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';

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
  dots?: number;
  pitches?: Pitch[];
  tuplets?: { actual: number; normal: number; id: string }[];
  tieStart?: boolean;
  tieStop?: boolean;
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
  clef = 'treble';
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

/** Internal control flow distinguishes malformed input from programming errors. */
class ImportFailure extends Error {}

/** Keep options, locations and diagnostics scoped to a single call in either runtime. */
export class Input {
  readonly diagnostics: ImportDiagnostic[] = [];
  context: Pick<ImportDiagnostic, 'part' | 'measure' | 'voice'> = {};
  readonly rootFile: string;
  constructor(public file: string, readonly options: ImportOptions) { this.rootFile = file; }

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
  const common = { target: { language: 2, minimumVersion: '6.2.3' } as const, diagnostics: input.diagnostics };
  try {
    const [bar, range] = read(input);
    const document = writeScore(Array.isArray(bar) ? bar : [bar], input, range);
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
