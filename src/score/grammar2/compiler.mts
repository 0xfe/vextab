// Compile named parts and finite patterns into independent voice timelines on a shared measure grid.
/// <reference lib="es2020.bigint" />
import { limits, readScore, type DiagnosticCode, type Fail, type Fraction, type Node, type TimedNode,
  type PartSyntax, type StaffSyntax, type VoiceSyntax } from './reader.mts';
import type { ExpansionFrame, Head, HeadRef, ScoreEvent, ScoreV2, ScoreVoice, TextRange } from './model.js';
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

/** Resolve a hammer to the head on the same physical string, even in a reordered chord. */
function hammerSource(head: Head, previous: ScoreEvent | undefined): HeadRef | undefined {
  if (!previous || !('fret' in head) || typeof head.fret !== 'number') return;
  const fret = head.fret;
  const index = previous.heads.findIndex(h =>
    'fret' in h && h.string === head.string && typeof h.fret === 'number' && h.fret < fret);
  if (index >= 0) return { event: previous.id, head: index };
}

/** Every invocation has fresh budgets and IDs. No parsing or expansion state survives an edit. */
export function compile(source: string): ScoreV2 {
  const fail: Fail = (code, reason, range, trace = []) => { throw new ScoreV2Error(code, reason, source, range, trace); };
  const { patterns, parts, meter, meterRange, pickup } = readScore(source, fail);
  const meterText = fractionText(meter);
  const measureLength = fractionText(rational(...meter, fail, [0, 0], []));
  const firstLength = pickup ? fractionText(rational(...pickup, fail, [0, 0], [])) : measureLength;
  const quarter: Fraction = [BigInt(1), BigInt(4)];
  const zero: Fraction = [BigInt(0), BigInt(1)];
  let steps = 0, eventCount = 0, measureCount: number | undefined;

  function spend(range: TextRange, trace: ExpansionFrame[]) {
    if (++steps > limits.steps) fail('work-limit', 'Phrase expansion exceeded its work budget', range, trace);
  }

  /** One voice owns one clock. Patterns and tuplets temporarily change its rhythmic environment. */
  function lower(part: PartSyntax, staff: StaffSyntax, voice: VoiceSyntax, partIndex: number): ScoreVoice {
    const result: ScoreVoice = { name: voice.name, range: voice.range, events: [], measures: [], spans: [] };
    const { events, measures, spans } = result;
    let bar = 1, firstEvent = 0, beat = zero;

    /** Advance this voice by one timed event and resolve references to earlier heads. */
    function emit(node: TimedNode, duration: Fraction, rhythmRange: TextRange | undefined, scale: Fraction, trace: ExpansionFrame[]) {
      if (++eventCount > limits.events) fail('event-limit', 'Too many expanded attacks, rests or skips', node.range, trace);
      const length = rational(duration[0] * scale[0], duration[1] * scale[1], fail, node.range, trace);
      const id = [partIndex + 1, staff.name, voice.name, events.length + 1].join('.');
      const heads = node.kind === 'attack' ? node.heads.map((head, index) => {
        if ((part.kind === 'drums') !== ('drum' in head) || ('string' in head && part.kind !== 'guitar'))
          fail('instrument', 'This head does not belong to ' + part.kind, head.range, trace);
        for (const mark of head.marks) {
          if (['bend', 'prebend', 'slideIn', 'slideOut'].includes(mark.kind) && (!('fret' in head) || typeof head.fret !== 'number'))
            fail('instrument', 'This technique needs a pitched fret', mark.range, trace);
        }
        const hammer = head.marks.find(mark => mark.kind === 'hammer');
        if (!hammer) return head;
        const from = hammerSource(head, events[events.length - 1]);
        if (!from) fail('hammer', 'Expected a lower fret on this string in the preceding attack', hammer.range, trace);
        spans.push({ kind: 'hammer', from, to: { event: id, head: index }, range: hammer.range });
        return { ...head, hammerFrom: from };
      }) : [];
      events.push({ id, bar, at: fractionText(beat), duration: fractionText(length), writtenDuration: fractionText(duration),
        kind: node.kind, heads, marks: node.kind === 'attack' ? node.marks : [], range: node.range, rhythmRange, trace });
      beat = rational(beat[0] * length[1] + length[0] * beat[1], beat[1] * length[1], fail, node.range, trace);
      const limit = bar === 1 && pickup ? pickup : meter;
      if (beat[0] * limit[1] > limit[0] * beat[1]) fail('bar-length', 'Attack crosses the end of bar ' + bar, node.range, trace);
    }

    function walk(body: Node[], duration: Fraction, rhythmRange: TextRange | undefined, scale: Fraction, trace: ExpansionFrame[]) {
      if (trace.length > limits.depth) fail('depth-limit', 'Phrase expansion is too deep', trace[trace.length - 1].range, trace);
      for (const node of body) {
        spend(node.range, trace);
        switch (node.kind) {
          case 'duration':
            duration = node.value;
            rhythmRange = node.range;
            break;
          case '|':
            if (fractionText(beat) !== (bar === 1 ? firstLength : measureLength))
              fail('bar-length', 'Bar ' + bar + ' contains ' + fractionText(beat) + ' of a whole note, expected ' + (bar === 1 && pickup ? firstLength : meterText), node.range, trace);
            measures.push({ number: bar++, start: firstEvent, end: events.length, barlineRange: node.range, trace });
            firstEvent = events.length;
            beat = zero;
            break;
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
    if (measureCount !== undefined && measureCount !== measures.length) fail('alignment', 'Every voice must cover the same number of bars', voice.range);
    measureCount = measures.length;
    return result;
  }
  const compiled = parts.map((part, index) => ({
    ...part, staves: part.staves.map(staff => ({
      name: staff.name, range: staff.range, voices: staff.voices.map(voice => lower(part, staff, voice, index)),
    })),
  }));
  return { language: 2, source, meter: meterText, meterRange, ...(pickup && { pickup: firstLength }), measureCount: compiled[0].staves[0].voices[0].measures.length, parts: compiled };
}
