// Compile finite phrases on a separate measure grid for each instrument.
/// <reference lib="es2020.bigint" />
import { duplicateMark } from './marks.mts';
import { limits, readScore, type DiagnosticCode, type Fail, type Fraction, type Node, type TimedNode,
  type PartSyntax, type StaffSyntax, type VoiceSyntax } from './reader.mts';
import type { ExpansionFrame, Head, HeadRef, ScoreEvent, ScoreV2, ScoreVoice, TextRange, WrittenMeter } from './model.js';
export { limits };

/** V2 diagnostics keep selection offsets and the invocation stack that led to a bad event. */
export class ScoreV2Error extends Error {
  readonly line: number;
  readonly column: number;
  readonly code: DiagnosticCode;
  readonly range: TextRange;
  readonly trace: ExpansionFrame[];

  constructor(code: DiagnosticCode, reason: string, source: string, range: TextRange, trace: ExpansionFrame[]) {
    const prefix = source.slice(0, range[0]);
    const line = prefix.split(/\r\n|\r|\n/).length;
    const column = range[0] - Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('\r'));
    super(`${code} at ${line}:${column}: ${reason}`);
    this.name = 'ScoreV2Error';
    this.code = code;
    this.range = range;
    this.trace = trace;
    this.line = line;
    this.column = column;
  }
}

/** Reduce before testing the cap so equivalent expressions consume the same precision budget. */
function rational(n: bigint, d: bigint, fail: Fail, range: TextRange, trace: ExpansionFrame[]): Fraction {
  let a = n, b = d;
  while (b) [a, b] = [b, a % b];
  n /= a;
  d /= a;
  if (n > limits.fraction || d > limits.fraction) fail('fraction-limit', 'Written time needs a smaller ratio', range, trace);
  return [n, d];
}

const fractionText = ([n, d]: Fraction) => n + '/' + d;

/** Each instrument owns its meter track. Voices and text inside that instrument share its barlines. */
interface PartClock {
  bars: string[];
  voiceLength?: number;
  meters: Record<number, WrittenMeter & { trace?: ExpansionFrame[] }>;
}

function asFraction(value: string): Fraction {
  const [n, d] = value.split('/');
  return [BigInt(n), BigInt(d)];
}

/** Resolve a hammer to the head on the same physical string, even in a reordered chord. */
function hammerSource(head: Head, previous: ScoreEvent | undefined, kind: 'hammer' | 'pull' | 'slide'): HeadRef | undefined {
  if (!previous || !('fret' in head) || typeof head.fret !== 'number') return;
  const fret = head.fret;
  const index = previous.heads.findIndex(h =>
    'fret' in h && h.string === head.string && typeof h.fret === 'number' && (kind === 'hammer' ? h.fret < fret : kind === 'pull' ? h.fret > fret : h.fret !== fret));
  if (index >= 0) return { event: previous.id, head: index };
}

/** Every invocation has fresh budgets and IDs. No parsing or expansion state survives an edit. */
export function compile(source: string): ScoreV2 {
  const fail: Fail = (code, reason, range, trace = []) => { throw new ScoreV2Error(code, reason, source, range, trace); };
  const { patterns, parts, scoreMeters, pickup, pickupRange, playback, measureNumbers, layout, transpose: scoreTranspose } = readScore(source, fail);
  const meterText = scoreMeters[1]?.value ?? '4/4';
  const firstLength = pickup && fractionText(rational(...pickup, fail, pickupRange, []));
  const quarter: Fraction = [BigInt(1), BigInt(4)];
  const zero: Fraction = [BigInt(0), BigInt(1)];
  let steps = 0, eventCount = 0;

  function spend(range: TextRange, trace: ExpansionFrame[]) {
    if (++steps > limits.steps) fail('work-limit', 'Phrase expansion exceeded its work budget', range, trace);
  }

  /** One voice owns one clock. Patterns and tuplets temporarily change its rhythmic environment. */
  function lower(part: PartSyntax, staff: StaffSyntax, voice: VoiceSyntax, partIndex: number, clock: PartClock): ScoreVoice {
    const result: ScoreVoice = { name: voice.name, ...(voice.settings && { settings: voice.settings }), range: voice.range, events: [], measures: [], spans: [] };
    const { events, measures, spans } = result;
    let bar = 1, firstEvent = 0, beat = zero;

    let fragment = false, transpose = 0, soundingOctaves = 0, newRow = false;
    let rehearsal: string | undefined, opening: string | undefined;

    /** A bar's written duration stays exact until every voice has supplied its meter changes. */
    function finishBar(range: TextRange, trace: ExpansionFrame[], closing?: string) {
      const span = fractionText(beat);
      if (clock.bars[bar - 1] !== undefined && clock.bars[bar - 1] !== span)
        fail('alignment', 'Voices disagree on the length of bar ' + bar, range, trace);
      clock.bars[bar - 1] = span;
      measures.push({ number: bar, start: firstEvent, end: events.length, barlineRange: range, trace,
        span, fragment, newRow, rehearsal, closing, opening });
      opening = closing === 'repeat-both' ? 'repeat-begin' : undefined;
      firstEvent = events.length;
      bar++;
      beat = zero;
      rehearsal = undefined;
      newRow = false;
    }

    /** Advance this voice by one timed event and resolve references to earlier heads. */
    function emit(node: TimedNode, duration: Fraction, rhythmRange: TextRange | undefined, scale: Fraction, trace: ExpansionFrame[]) {
      if (++eventCount > limits.events) fail('event-limit', 'Too many expanded attacks, rests or skips', node.range, trace);
      const length = rational(duration[0] * scale[0], duration[1] * scale[1], fail, node.range, trace);
      const duplicate = duplicateMark(node.marks ?? []);
      if (duplicate) fail('syntax', duplicate.reason, duplicate.range, trace);
      const id = [part.id ?? partIndex + 1, staff.id ?? staff.name, voice.name, events.length + 1].join('.');
      const heads = node.kind === 'attack' ? node.heads.map((head, index) => {
        if ((part.kind === 'drums') !== ('drum' in head) || ('string' in head && part.kind !== 'guitar'))
          fail('instrument', 'This head does not belong to ' + part.kind, head.range, trace);
        const duplicate = duplicateMark(head.marks);
        if (duplicate) fail('syntax', duplicate.reason, duplicate.range, trace);
        for (const mark of head.marks) {
          if (['bend', 'prebend', 'slideIn', 'slideOut'].includes(mark.kind) && (!('fret' in head) || typeof head.fret !== 'number'))
            fail('instrument', 'This technique needs a pitched fret', mark.range, trace);
        }
        const hammer = head.marks.find(mark => mark.kind === 'hammer' || mark.kind === 'slide' || mark.kind === 'pull');
        if (!hammer || (hammer.kind !== 'hammer' && hammer.kind !== 'slide' && hammer.kind !== 'pull')) return head;
        const from = hammerSource(head, events[events.length - 1], hammer.kind);
        if (!from) fail('hammer', hammer.kind === 'hammer' ? 'Expected a lower fret on this string in the preceding attack' : 'Expected a compatible preceding fret on this string', hammer.range, trace);
        spans.push({ kind: hammer.kind, from, to: { event: id, head: index }, range: hammer.range });
        return hammer.kind === 'hammer' ? { ...head, hammerFrom: from } : head;
      }) : [];
      events.push({ id, bar, at: fractionText(beat), duration: fractionText(length), writtenDuration: fractionText(duration),
        kind: node.kind, ...(transpose && { transpose }), ...(soundingOctaves && { soundingOctaves }), heads, marks: node.marks ?? [], range: node.range, rhythmRange, trace
      });
      beat = rational(beat[0] * length[1] + length[0] * beat[1], beat[1] * length[1], fail, node.range, trace);
    }

    function walk(body: Node[], duration: Fraction, rhythmRange: TextRange | undefined, scale: Fraction, trace: ExpansionFrame[]) {
      if (trace.length > limits.depth) fail('depth-limit', 'Phrase expansion is too deep', trace[trace.length - 1].range, trace);
      for (const node of body) {
        spend(node.range, trace);
        switch (node.kind) {
          case 'meter': {
            if (beat[0]) fail('alignment', 'Change meter at the beginning of a bar', node.range, trace);
            const prior = clock.meters[bar], next = node.signature;
            if (prior && (prior.value !== next.value || prior.sign !== next.sign))
              fail('alignment', 'Conflicting meters for bar ' + bar, next.range, trace);
            clock.meters[bar] ??= { ...next, ...(trace.length && { trace }) };
            break;
          }
          case 'duration':
            duration = node.value;
            rhythmRange = node.range;
            break;
          case '|':
            finishBar(node.range, trace, node.closing);
            break;
          case 'textBoundary': {
            const target = node.boundary.edge === 'start' ? '0/1' : clock.bars[bar - 1];
            if (fractionText(beat) !== target)
              fail('alignment', 'Put a text boundary at the indicated bar edge', node.range, trace);
            (result.boundaries ??= []).push({ ...node.boundary, bar });
            break;
          }
          case 'mark': case 'break': case 'repeatStart':
            if (beat[0]) fail('alignment', 'Place this directive at the beginning of a bar', node.range, trace);
            if (node.kind === 'mark') rehearsal = node.text;
            else if (node.kind === 'repeatStart') opening = 'repeat-begin';
            else newRow = true;
            break;
          case 'fragment': {
            if (beat[0] || fragment) fail('alignment', 'Start a fragment at a bar boundary', node.range, trace);
            fragment = true;
            const first = bar;
            walk(node.body, duration, rhythmRange, scale, trace);
            if (beat[0] || first === bar) finishBar(node.range, trace);
            fragment = false;
            break;
          }
          case 'octave': {
            const outer = soundingOctaves;
            soundingOctaves += node.semitones! / 12;
            walk(node.body, duration, rhythmRange, scale, trace);
            soundingOctaves = outer;
            break;
          }
          case 'transpose': {
            const outer = transpose;
            transpose += node.semitones!;
            if (Math.abs(transpose) > 127) fail('instrument', 'Transposition exceeds the MIDI range', node.range, trace);
            walk(node.body, duration, rhythmRange, scale, trace);
            transpose = outer;
            break;
          }
          case 'palmMute': case 'slur': case 'beam': {
            const start = events.length;
            walk(node.body, duration, rhythmRange, scale, trace);
            const members = events.slice(start);
            if (!members.length || (node.kind !== 'palmMute' && members.length < 2))
              fail('syntax', 'This span needs more notes', node.range, trace);
            if (node.kind === 'palmMute' && part.kind !== 'guitar') fail('instrument', 'Palm mute needs a guitar', node.range, trace);
            if (node.kind === 'beam' && (members[0].bar !== members[members.length - 1].bar ||
              members.some(e => Number(e.writtenDuration.split('/')[0]) * 4 >= Number(e.writtenDuration.split('/')[1]))))
              fail('syntax', 'Beam short notes within one bar', node.range, trace);
            spans.push({ kind: node.kind, first: members[0].id, last: members[members.length - 1].id, strings: node.strings ?? [], range: node.range });
            break;
          }
          case 'use':
            // The reader accepts only previously defined pattern names.
            walk(patterns.get(node.name)!, quarter, undefined, scale, [...trace, { pattern: node.name, range: node.range }]);
            break;
          case 'times':
            for (let i = 1; i <= node.count; i++) {
              spend(node.range, trace);
              walk(node.body, duration, rhythmRange, scale, [...trace, { iteration: i, range: node.range }]);
            }
            break;
          case 'volta': {
            if (beat[0]) fail('bar-length', 'Start a repeat at a shared barline', node.range, trace);
            const first = bar;
            walk(node.body, duration, rhythmRange, scale, trace);
            const bodyEnd = bar - 1;
            if (beat[0] || bodyEnd < first) fail('bar-length', 'End the repeat body with a full bar', node.range, trace);
            const endings = node.endings.map(body => {
              const start = bar;
              walk(body, duration, rhythmRange, scale, trace);
              if (beat[0] || bar === start) fail('bar-length', 'Each ending needs at least one complete bar', node.range, trace);
              return { first: start, last: bar - 1 };
            });
            (result.repeats ??= []).push({ first, bodyEnd, endings, range: node.range });
            break;
          }
          case 'tuplet': {
            const start = events.length;
            const ratio = node.scale[1] + ':' + node.scale[0];
            const scaled = rational(scale[0] * node.scale[0], scale[1] * node.scale[1], fail, node.range, trace);
            walk(node.body, duration, rhythmRange, scaled, [...trace, { tuplet: ratio, range: node.range }]);
            if (events.length > start) spans.push({ kind: 'tuplet', ratio, first: events[start].id,
              last: events[events.length - 1].id, range: node.range });
            break;
          }
          default:
            emit(node, duration, rhythmRange, scale, trace);
        }
      }
    }
    walk(voice.body, quarter, undefined, [BigInt(1), BigInt(1)], []);
    if (beat[0]) {
      const last = events[events.length - 1];
      fail('bar-length', 'End the final measure with |', last.range, last.trace);
    }
    if (!measures.length) fail('bar-length', 'Expected at least one measure', voice.range);
    if (clock.voiceLength !== undefined && clock.voiceLength !== measures.length) fail('alignment', 'Every voice in a part must cover the same number of bars', voice.range);
    clock.voiceLength = measures.length;
    return result;
  }

  /** Resolve changes after collecting every voice, so a lower voice can author the shared signature. */
  function applyMeters(clock: PartClock, voices: ScoreVoice[], text: ScoreVoice[]) {
    let current: WrittenMeter | undefined, local = false;
    const allVoices = [...voices, ...text];
    for (let i = 0; i < clock.bars.length; i++) {
      const bar = i + 1;
      if (clock.meters[bar]) { current = clock.meters[bar]; local = true; }
      else if (!local && scoreMeters[bar]) current = scoreMeters[bar];
      const value = current?.value ?? '4/4';
      const meter = asFraction(value);
      if (bar === 1 && pickup && pickup[0] * meter[1] >= meter[0] * pickup[1])
        fail('syntax', 'Pickup must be shorter than the opening meter ' + value, pickupRange);
      const expected = bar === 1 && pickup ? pickup : meter;
      const [n, d] = asFraction(clock.bars[i]);
      if (n * expected[1] !== expected[0] * d) {
        const measured = voices.find(voice => !voice.measures[i].fragment);
        if (measured) {
          const m = measured.measures[i];
          if (n * expected[1] > expected[0] * d) {
            // Recover the first overflowing attack, including its original expansion trail.
            for (let index = m.start; index < m.end; index++) {
              const e = measured.events[index], [an, ad] = asFraction(e.at), [dn, dd] = asFraction(e.duration);
              if ((an * dd + dn * ad) * expected[1] > expected[0] * ad * dd)
                fail('bar-length', 'Attack crosses the end of bar ' + bar, e.range, e.trace);
            }
          }
          fail('bar-length', 'Bar ' + bar + ' contains ' + m.span + ' of a whole note, expected ' + fractionText(expected), m.barlineRange, m.trace);
        }
      }
      for (const voice of allVoices) {
        const m = voice.measures[i];
        m.meter = value;
        m.meterSign = current?.sign;
        m.meterRange = current?.range;
      }
    }
  }

  const compiled = parts.map((part, index) => {
    const { lanes, ...instrument } = part;
    const clock: PartClock = { bars: [], meters: { ...part.meters } };
    const staves = part.staves.map(staff => ({
      ...staff, voices: staff.voices.map(voice => lower(part, staff, voice, index, clock)),
    }));
    const text = lanes?.map(lane => ({
      name: lane.voice.name, style: lane.style,
      voice: lower(part, { name: 'main', range: part.range, voices: [] }, { ...lane.voice, name: 'text-' + lane.voice.name }, index, clock)
    }));
    const measureCount = clock.bars.length;
    for (const [n, change] of Object.entries(clock.meters)) {
      if (Number(n) > measureCount) fail('alignment', 'Meter change lies beyond this part', change.range, change.trace);
    }
    for (const n of Object.keys(part.changes ?? {})) {
      if (Number(n) > measureCount) fail('alignment', 'Part setting change lies beyond the score', part.range);
    }
    for (const n of Object.keys(part.keys ?? {})) {
      if (Number(n) > measureCount) fail('alignment', 'Key change lies beyond the score', part.range);
    }
    applyMeters(clock, staves.flatMap(staff => staff.voices), text?.map(lane => lane.voice) ?? []);
    return { ...instrument, ...(Object.keys(clock.meters).length && { meters: clock.meters }), measureCount, staves, ...(text && { text }) };
  });
  const measureCount = Math.max(...compiled.map(part => part.measureCount));
  for (const [n, change] of Object.entries(scoreMeters)) {
    if (Number(n) > measureCount) fail('alignment', 'Meter change lies beyond the score', change.range);
  }
  return { language: 2, ...(scoreTranspose && { transpose: scoreTranspose }), ...(layout && { layout }), ...(playback && { playback }), ...(measureNumbers !== undefined && { measureNumbers }), source, meter: meterText, meterRange: scoreMeters[1]?.range, ...(pickup && { pickup: firstLength }), measureCount, parts: compiled };
}
