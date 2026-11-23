// Resolve one measured staff in exact whole-note fractions and write grammar-v2 source.
import type { ImportedDocument, ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';

import { Time, zero } from './time.js';

/** Traditional major keys in circle-of-fifths order. */
export const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
/** Keep the single-measure reader bounded before constructing input records. */
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
  staff: 1;
  at: Time;
  elapsed: Time;
  denominator: number;
  pitch?: Pitch;
  range: TextRange;
}

/** The written bar may contain gaps in individual voices while its full timeline remains measured. */
export class Measure {
  part = 'staff';
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
      if (this.voices.size === 2) input.fail('unsupported', 'This profile supports up to two voices.', event.range);
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
  constructor(readonly file: string, readonly options: ImportOptions) {}

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

/** Emit an explicit natural when the target key would otherwise alter the written pitch. */
function spelling(p: Pitch, key: string) {
  const fifths = keys.indexOf(key) - 7;
  const altered = (fifths < 0 ? 'BEADGCF' : 'FCGDAEB').slice(0, Math.abs(fifths));
  const sign = p.alter ? ['bb', 'b', '', '#', '##'][p.alter + 2] : altered.includes(p.step) ? 'n' : '';
  return p.step + sign + p.octave;
}

/** Shape silence with binary skips. A rest glyph would introduce a new written event. */
function writeMeasure(bar: Measure, input: Input, range: TextRange): ImportedDocument {
  input.context = { part: bar.part, measure: bar.label };
  const length = new Time(bar.beats, bar.beatType);
  if (!bar.voices.size || bar.extent.compare(length) !== 0) input.fail('timing', 'Expected one complete measure.', range);
  let text = 'meter ' + bar.beats + '/' + bar.beatType + '\nstaff {\n';
  if (bar.name) text += '  name ' + JSON.stringify(bar.name) + '\n';
  text += '  key ' + bar.key + '\n';
  const map: NonNullable<ImportedDocument['sourceMap']> = [];
  const voices: ImportedDocument['source']['voices'] = [];
  let count = 0;
  for (const [voice, events] of bar.voices) {
    input.context.voice = voice;
    const target = voices.length ? 'lower' : 'upper';
    voices.push({ source: voice, target });
    text += '  voice ' + target + ' {';
    let cursor = zero, previous = 0;
    function append(token: string, denominator: number, original?: TextRange) {
      if (++count > 2048) input.fail('limit', 'Measure exceeds the writer event budget.', original ?? range);
      if (previous !== denominator) {
        const rhythm = ({ 1: 'w', 2: 'h', 4: 'q' } as Record<number, string>)[denominator] ?? denominator;
        text += ' :' + rhythm;
        previous = denominator;
      }
      text += ' ';
      const start = text.length;
      text += token;
      if (original && input.options.sourceMap) map.push({ generated: [start, text.length], original });
    }
    function silence(until: Time, origin: TextRange) {
      const gap = until.minus(cursor);
      // The M1 writer can spell binary silence explicitly, down to a 256th note.
      if (256n % gap.denominator !== 0n) input.fail('unsupported', 'Cannot spell this gap with binary skips.', origin);
      let remaining = Number(gap.numerator * (256n / gap.denominator));
      while (remaining > 0) {
        const units = Math.min(256, 2 ** Math.floor(Math.log2(remaining)));
        append('skip', 256 / units);
        remaining -= units;
      }
      cursor = until;
    }
    for (const event of events.sort((a, b) => a.at.compare(b.at))) {
      if (event.at.compare(cursor) < 0) input.fail('timing', 'Overlapping events in one voice.', event.range);
      silence(event.at, event.range);
      append(event.pitch ? spelling(event.pitch, bar.key) : event.kind, event.denominator, event.range);
      cursor = cursor.plus(event.elapsed);
    }
    silence(length, range);
    text += ' | }\n';
  }
  text += '}\n';
  if (new TextEncoder().encode(text).length > 65536) input.fail('limit', 'Generated text exceeds 64 KiB.', range);
  return { source: { file: input.file, part: bar.part, measure: bar.label, voices }, text,
    ...(input.options.sourceMap && { sourceMap: map }) };
}

/** A source error or unknown musical expression blocks both modes; only enumerated losses may pass. */
export function convert(options: ImportOptions, filename: string, read: (input: Input) => [Measure, TextRange]): ImportResult {
  const input = new Input(options.filename ?? filename, options);
  const common = { target: { language: 2, minimumVersion: '6.2.3' } as const, diagnostics: input.diagnostics };
  try {
    const [bar, range] = read(input);
    const document = writeMeasure(bar, input, range);
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
