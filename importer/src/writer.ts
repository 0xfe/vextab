// Translate resolved source events into editable VexTab grammar v2 within the public compiler limits.
import type { Event, Input, Measure, Pitch } from './score.js';
import { keys } from './score.js';
import { Time, zero } from './time.js';
import type { ImportedDocument, TextRange } from './types.js';

/** VexTab infers unmarked letters from the signature, including after a chromatic note. */
function spelling(p: Pitch, key: string, input: Input, range: TextRange) {
  if (p.octave < 0 || p.octave > 9 || p.sounding < 0 || p.sounding > 127 || Math.abs(p.alter) > 2)
    input.fail('unsupported', 'Pitch exceeds the written or sounding target range.', range);
  const minor = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
  const fifths = (key.endsWith('m') ? minor : keys).indexOf(key) - 7;
  const altered = (fifths < 0 ? 'BEADGCF' : 'FCGDAEB').slice(0, Math.abs(fifths));
  const sign = p.alter ? ['bb', 'b', '', '#', '##'][p.alter + 2] : altered.includes(p.step) ? 'n' : '';
  return p.step + sign + p.octave;
}

type Tuplet = NonNullable<Event['tuplets']>[number];

/** One buffer keeps output offsets and package-wide capacity checks independent of the active voice. */
class Writer {
  text = '';
  map: NonNullable<ImportedDocument['sourceMap']> = [];
  events = 0;
  rhythm = '';
  tuplets: Tuplet[] = [];
  constructor(readonly input: Input, readonly range: TextRange) {}

  /** Leave and enter scope at the common prefix. Durations are explicitly reset at scope edges. */
  groups(next: Tuplet[], range: TextRange) {
    let shared = 0;
    while (shared < this.tuplets.length && shared < next.length && this.tuplets[shared].id === next[shared].id) shared++;
    if (shared === next.length && shared === this.tuplets.length) return;
    this.text += ' }'.repeat(this.tuplets.length - shared);
    for (const t of next.slice(shared)) {
      if (![t.actual, t.normal].every(n => Number.isInteger(n) && n > 0 && n <= 16))
        this.input.fail('unsupported', 'Tuplet ratio exceeds the target limit.', range);
      this.text += ' tuplet ' + t.actual + ':' + t.normal + ' {';
    }
    this.rhythm = '';
    this.tuplets = next;
  }

  append(token: string, denominator: number, dots: number, event?: Event) {
    const range = event?.range ?? this.range;
    if (++this.events > 4096) this.input.fail('limit', 'Generated score exceeds 4,096 events.', range);
    const base = ({ 1: 'w', 2: 'h', 4: 'q' } as Record<number, string>)[denominator] ?? denominator;
    if (![1,2,4,8,16,32,64,128,256].includes(denominator) || ![0,1,2].includes(dots))
      this.input.fail('unsupported', 'Unsupported written duration.', range);
    const rhythm = ':' + base + '.'.repeat(dots);
    if (rhythm !== this.rhythm) this.text += ' ' + rhythm;
    this.rhythm = rhythm;
    this.text += ' ';
    const start = this.text.length;
    this.text += token;
    if (event && this.input.options.sourceMap) {
      for (const original of event.headRanges ?? [range]) this.map.push({ generated: [start, this.text.length], original,
        ...(event.file && {file: event.file}), ...(event.uses && {uses: event.uses}) });
    }
  }

  /** Fill only the uncovered interval. A skip takes time without adding a printed rest. */
  silence(gap: Time, range: TextRange) {
    if (gap.compare(zero) === 0) return;
    this.groups([], range);
    if (gap.compare(zero) < 0) this.input.fail('timing', 'Overlapping events in one voice.', range);
    if (256n % gap.denominator !== 0n) this.input.fail('unsupported', 'Cannot spell this gap with binary skips.', range);
    let remaining = Number(gap.numerator * (256n / gap.denominator));
    while (remaining > 0) {
      const units = Math.min(256, 2 ** Math.floor(Math.log2(remaining)));
      this.append('skip', 256 / units, 0);
      remaining -= units;
    }
  }

  event(event: Event, bar: Measure) {
    this.groups(event.tuplets ?? [], event.range);
    const dots = event.dots ?? 0;
    if (!Number.isSafeInteger(event.denominator) || event.denominator <= 0 || ![0,1,2].includes(dots))
      this.input.fail('unsupported', 'Invalid written duration.', event.range);
    let written = new Time(2 ** (dots + 1) - 1, event.denominator * 2 ** dots);
    for (const t of this.tuplets) written = new Time(written.numerator * BigInt(t.normal), written.denominator * BigInt(t.actual));
    if (written.compare(event.elapsed)) this.input.fail('timing', 'Written duration differs from elapsed duration.', event.range);
    const heads = event.pitches ?? (event.pitch ? [event.pitch] : []);
    if (heads.length > 16) this.input.fail('limit', 'Chord exceeds 16 heads.', event.range);
    const note = (p: Pitch) => spelling(p, bar.key, this.input, event.range);
    const marks: string[] = [];
    const chord = heads.length > 1;
    const names = heads.map(p => note(p) + (chord && event.tieStop ? '[tie]' : ''));
    if (!chord && event.tieStop) marks.push('tie');
    if (event.staff !== bar.staff) {
      if (!bar.piano || ![1, 2].includes(event.staff)) this.input.fail('unsupported', 'Unknown display staff.', event.range);
      if (event.kind !== 'skip') marks.push('onStaff ' + (event.staff === 1 ? 'upper' : 'lower'));
    }
    let token = chord ? '(' + names.join(' ') + ')' : names[0] ?? event.kind;
    if (event.grace?.length) {
      const grace = event.grace.map(chord => chord.length === 1 ? note(chord[0]) : '(' + chord.map(note).join(' ') + ')');
      marks.push('grace before (' + grace.join(' ') + ')');
    }
    if (marks.length) token += '[' + marks.join(', ') + ']';
    this.append(token, event.denominator, dots, event);
  }

  /** Repeat marks surround the written body. An ending owns its own written measures. */
  bar(bar: Measure, voice: string, structured: boolean, first: boolean) {
    this.input.context = { part: bar.part, measure: bar.label, voice };
    const range = bar.range ?? this.range;
    const full = new Time(bar.beats, bar.beatType);
    const length = bar.pickup ?? bar.fragment ?? full;
    if (!bar.voices.size || bar.extent.compare(length) !== 0 || length.compare(zero) <= 0 || length.compare(full) > 0)
      this.input.fail('timing', 'Expected one complete measure or a declared short measure.', range);
    if (bar.pickup && !first) this.input.fail('unsupported', 'Pickup must be the first measure.', range);
    if (bar.ending) this.text += ' ending ' + bar.ending + ' {';
    if (bar.repeatStart) {
      if (!structured && bar.repeatStart !== 2) this.input.fail('unsupported', 'A simple repeat requires two passes.', range);
      this.text += structured ? ' volta ' + bar.repeatStart + ' {' : ' repeatStart';
    }
    if (bar.fragment) this.text += ' fragment {';
    this.rhythm = '';
    let cursor = zero;
    for (const e of (bar.voices.get(voice) ?? []).slice().sort((a,b) => a.at.compare(b.at))) {
      this.input.file = e.file ?? this.input.rootFile;
      this.silence(e.at.minus(cursor), e.range);
      this.event(e, bar);
      cursor = e.at.plus(e.elapsed);
    }
    this.silence(length.minus(cursor), range);
    this.groups([], range);
    this.text += bar.repeatEnd && !structured ? ' bar repeatEnd' : ' |';
    if (bar.fragment) this.text += ' }';
    if (bar.repeatEnd && structured || bar.endingEnd) this.text += ' }';
  }
}

/** Validate consecutive alternatives before choosing printed repeat or structured volta syntax. */
function repeatForms(bars: Measure[], input: Input, range: TextRange) {
  const structured = new Set<number>();
  let start = -1, alternatives = 0, expected = 0, activeEnding = false;
  for (const [i, bar] of bars.entries()) {
    const fail = () => input.fail('unsupported', 'Incomplete or overlapping repeat structure.', bar.range ?? range);
    if (alternatives && !activeEnding && !bar.ending) fail();
    if (bar.repeatStart) {
      if (start >= 0 || alternatives || bar.repeatStart < 2 || bar.repeatStart > 32) fail();
      start = i;
    }
    if (bar.repeatEnd) {
      if (start < 0) fail();
      if (bars[i + 1]?.ending) {
        alternatives = bars[start].repeatStart!;
        expected = 1;
        structured.add(start);
        structured.add(i);
      }
      start = -1;
    }
    if (bar.ending) {
      if (activeEnding || !alternatives || bar.ending !== expected) fail();
      activeEnding = true;
    }
    if (bar.endingEnd) {
      if (!activeEnding) fail();
      activeEnding = false;
      if (expected++ === alternatives) alternatives = 0;
    }
  }
  if (start >= 0 || alternatives) input.fail('unsupported', 'Unclosed repeat or alternatives.', range);
  return structured;
}

/** Keep every voice on the same grid, even when the source omits it for entire measures. */
export function writeScore(bars: Measure[], input: Input, range: TextRange): ImportedDocument {
  if (!bars.length) input.fail('syntax', 'No measures in the selected score.', range);
  const grouped = new Map<string, Measure[]>();
  for (const bar of bars) {
    const id = JSON.stringify([bar.part, bar.staff]);
    const group = grouped.get(id);
    if (group) group.push(bar);
    else grouped.set(id, [bar]);
  }
  const first = bars[0], writer = new Writer(input, range);
  const meter = (bar: Measure) => bar.beats + '/' + bar.beatType;
  writer.text = 'meter ' + meter(first) + '\n';
  if (first.pickup) writer.text += 'pickup ' + first.pickup.numerator + '/' + first.pickup.denominator + '\n';
  const staves: NonNullable<ImportedDocument['staves']> = [];
  /** Emit part-wide settings once. Piano settings apply to both hands. */
  function settings(measures: Measure[]) {
    const opening = measures[0];
    if (opening.name) writer.text += '  name ' + JSON.stringify(opening.name) + '\n';
    if (!opening.piano && opening.clef !== 'treble') writer.text += '  clef ' + opening.clef + '\n';
    writer.text += '  key ' + opening.key + '\n';
    for (const [i, bar] of measures.entries()) {
      const prev = i ? measures[i - 1] : first;
      if (i && bar.clef !== prev.clef) input.fail('unsupported', 'A timed clef change needs a newer target profile.', bar.range ?? range);
      if (i && bar.key !== prev.key) writer.text += '  key ' + bar.key + ' at ' + (i + 1) + '\n';
      if (meter(bar) !== meter(prev)) writer.text += '  meter ' + meter(bar) + (i ? ' at ' + (i + 1) : '') + '\n';
    }
  }

  /** Source IDs can be arbitrary strings. Generate predictable legal voice names in first-appearance order. */
  function voicesFor(measures: Measure[], target: string) {
    const opening = measures[0];
    if ((opening.pickup ?? zero).compare(first.pickup ?? zero)) input.fail('unsupported', 'Staves must share the pickup.', range);
    const ids = new Set(measures.flatMap(bar => [...bar.voices.keys()]));
    const voices = [...ids].map((source,i) => ({source, target: ['upper','lower'][i] ?? 'voice' + (i + 1)}));
    staves.push({ target, part: opening.part, staff: opening.staff, measures: measures.map(b => b.label), voices });
    const forms = repeatForms(measures, input, range);
    for (const voice of voices) {
      writer.text += '  voice ' + voice.target + ' {';
      for (const [i, bar] of measures.entries()) {
        if (i) writer.text += '\n   ';
        writer.bar(bar, voice.source, forms.has(i), !i);
      }
      writer.text += ' }\n';
    }
  }

  const keyboards = new Set<string>();
  for (const measures of grouped.values()) {
    const opening = measures[0], id = 'staff' + (staves.length + 1);
    if (opening.piano) {
      if (keyboards.has(opening.part)) continue;
      keyboards.add(opening.part);
      const upper = grouped.get(JSON.stringify([opening.part, 1]));
      const lower = grouped.get(JSON.stringify([opening.part, 2]));
      if (!upper || !lower || upper.length !== lower.length)
        return input.fail('unsupported', 'Piano hands must share a measure grid.', range);
      for (const [i, bar] of upper.entries()) {
        const bass = lower[i];
        if (!bar.piano || !bass.piano || bar.clef !== 'treble' || bass.clef !== 'bass' || meter(bar) !== meter(bass)
            || bar.key !== bass.key || bar.extent.compare(bass.extent))
          input.fail('unsupported', 'Independent piano hand settings require a newer target profile.', bass.range ?? range);
      }
      writer.text += 'piano ' + id + ' {\n';
      settings(upper);
      for (const [hand, bars] of [['upper', upper], ['lower', lower]] as const) {
        writer.text += '  ' + hand + ' {\n';
        voicesFor(bars, id + '/' + hand);
        writer.text += '  }\n';
      }
    } else {
      writer.text += (grouped.size > 1 ? 'staff ' + id : 'staff') + ' {\n';
      settings(measures);
      voicesFor(measures, grouped.size > 1 ? id : 'staff');
    }
    writer.text += '}\n';
  }
  if (new TextEncoder().encode(writer.text).length > 65536) input.fail('limit', 'Generated text exceeds 64 KiB.', range);
  const tokens = writer.text.match(/"(?:\\.|[^"\\])*"|[{}()[\],|]|[^\s{}()[\],|"]+/gu);
  if (tokens && tokens.length > 8192) input.fail('limit', 'Generated score exceeds 8,192 target tokens.', range);
  return { text: writer.text, source: {file: input.rootFile, part: first.part, measure: first.label, voices: staves[0].voices},
    staves, ...(input.options.sourceMap && { sourceMap: writer.map }) };
}
