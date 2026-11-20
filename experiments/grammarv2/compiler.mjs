// Experimental VexTab 2 reader. Produces timed, source-mapped voices for language-design tests.
// All parsing and expansion state belongs to one compile call. The shipping parser is independent.

/** One compilation shares these budgets across every part, voice and pattern invocation. */
export const limits = Object.freeze({
  bytes: 65536, tokens: 8192, depth: 24, repetitions: 32,
  events: 4096, heads: 16, steps: 32768, fraction: 2147483647n,
});

/** A range uses UTF-16 offsets for DOM selection. Expansion frames identify the invoking phrase. */
class Diagnostic extends Error {
  constructor(code, reason, source, range, trace = []) {
    const prefix = source.slice(0, range[0]);
    const line = prefix.split(/\r\n|\r|\n/).length;
    const column = range[0] - Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('\r'));
    super(`${code} at ${line}:${column}: ${reason}`);
    Object.assign(this, { code, range, trace });
  }
}

/** Comments consume the rest of the line. Punctuation has the same meaning across line breaks. */
function tokenize(source, fail) {
  if (source.length > limits.bytes || new TextEncoder().encode(source).length > limits.bytes) fail('source-limit', 'Score exceeds 64 KiB', [0, 0]);
  const tokens = [];
  for (const match of source.matchAll(/\/\/[^\r\n]*|[{}()[\],|]|(?:\/(?!\/)|[^/\s{}()[\],|])+/gu)) {
    if (match[0].startsWith('//')) continue;
    const range = [match.index, match.index + match[0].length];
    if (tokens.length === limits.tokens) fail('token-limit', 'Too many input tokens', range);
    tokens.push({ text: match[0], range });
  }
  tokens.push({ text: '', range: [source.length, source.length] });
  return tokens;
}

/** Reduce exact whole-note fractions after each operation, including nested tuplets. */
function rational(n, d, fail, range, trace) {
  let a = n, b = d;
  while (b) [a, b] = [b, a % b];
  n /= a;
  d /= a;
  if (n > limits.fraction || d > limits.fraction) fail('fraction-limit', 'Written time needs a smaller ratio', range, trace);
  return [n, d];
}

const fractionText = ([n, d]) => n + '/' + d;
const durationPattern = /^:(w|h|q|1|2|4|8|16|32|64)(\.{0,2})$/;
const notePattern = /^[A-G](?:bb|##|b|#|n)?[0-8]$/;
const positionPattern = /^(x|0|[1-9]\d?)\/([1-8])$/;
const drums = new Set(['kick', 'snare', 'hat']);
const partKinds = new Set(['guitar', 'piano', 'drums', 'staff']);

/** Parse a bounded syntax tree. A pattern may refer only to already completed definitions. */
function readScore(tokens, fail) {
  let cursor = 0, depth = 0;
  const peek = () => tokens[cursor].text;
  const take = () => tokens[cursor++];
  const error = (message, token = tokens[cursor]) => fail('syntax', message, token.range);
  function expect(text) {
    if (peek() !== text) error('Expected ' + text);
    return take();
  }
  function identifier() {
    if (!/^[a-z][a-z0-9_]*$/.test(peek())) error('Expected a lowercase name');
    return take().text;
  }
  function block(body) {
    const opening = expect('{');
    if (++depth > limits.depth) fail('depth-limit', 'Too many nested blocks', opening.range);
    const result = body();
    expect('}');
    depth--;
    return result;
  }
  const patterns = new Map();
  const parts = [];
  let meter = [4n, 4n], hasMeter = false;

  /** Head and attack modifiers have different attachment points in a chord. */
  function marks() {
    if (peek() !== '[') return [];
    take();
    const list = [];
    do {
      const mark = take();
      if (mark.text === 'accent' || mark.text === 'hammer') list.push({ kind: mark.text, range: mark.range });
      else if (mark.text === 'finger') {
        if (!/^[0-5]$/.test(peek())) error('Expected a finger from 0 to 5');
        const digit = take();
        const side = ['left', 'right', 'above', 'below'].includes(peek()) ? take() : undefined;
        list.push({ kind: 'finger', value: Number(digit.text), side: side?.text ?? 'left', range: [mark.range[0], (side ?? digit).range[1]] });
      } else error('Expected finger, hammer, or accent', mark);
      if (peek() !== ',') break;
      take();
    } while (true);
    expect(']');
    return list;
  }

  function head() {
    const token = take();
    const position = positionPattern.exec(token.text);
    if (position) return { fret: position[1] === 'x' ? 'x' : Number(position[1]), string: Number(position[2]), range: token.range };
    if (notePattern.test(token.text)) return { pitch: token.text, range: token.range };
    if (drums.has(token.text)) return { drum: token.text, range: token.range };
    error('Expected a pitch, fret/string, or drum name', token);
  }

  function attack() {
    const first = tokens[cursor];
    const chord = peek() === '(';
    const heads = [];
    if (chord) {
      take();
      do {
        if (heads.length === limits.heads) error('Too many heads in a chord');
        const item = head();
        item.marks = marks();
        if (item.marks.some(mark => mark.kind === 'accent')) error('Place the accent after the closing parenthesis', first);
        heads.push(item);
      } while (peek() !== ')');
      take();
    } else heads.push(head());
    const strings = new Set(), kit = new Set();
    for (const item of heads) {
      if (item.string && strings.has(item.string)) error('A chord needs distinct strings', first);
      if (item.drum && kit.has(item.drum)) error('A chord needs distinct drum instruments', first);
      if (item.string) strings.add(item.string);
      if (item.drum) kit.add(item.drum);
    }
    const annotations = marks();
    const headMarks = annotations.filter(mark => mark.kind !== 'accent');
    if (chord && headMarks.length) error('Place a head mark inside the chord', first);
    if (!chord) heads[0].marks = headMarks;
    return { kind: 'attack', heads, marks: annotations.filter(mark => mark.kind === 'accent'), range: [first.range[0], tokens[cursor - 1].range[1]] };
  }

  function sequence() {
    const result = [];
    while (peek() !== '}') {
      const token = tokens[cursor];
      if (!token.text) error('Expected a closing brace');
      let node;
      const duration = durationPattern.exec(token.text);
      if (duration) {
        take();
        const denominator = { w: 1, h: 2, q: 4 }[duration[1]] ?? Number(duration[1]);
        const dotFactor = 2 ** duration[2].length;
        node = { kind: 'duration', value: [BigInt(dotFactor * 2 - 1), BigInt(denominator * dotFactor)] };
      } else if (token.text === 'use') {
        take();
        const target = tokens[cursor];
        const name = identifier();
        if (!patterns.has(name)) error('Declare pattern ' + name + ' before using it (including inside patterns)', target);
        node = { kind: 'use', name };
      } else if (token.text === 'times' || token.text === 'tuplet') {
        take();
        const parameter = take();
        if (token.text === 'times') {
          if (!/^[1-9]\d?$/.test(parameter.text) || Number(parameter.text) > limits.repetitions)
            error('Use a literal repeat count from 1 to ' + limits.repetitions, parameter);
          node = { kind: 'times', count: Number(parameter.text) };
        } else {
          const ratio = /^([1-9]\d?):([1-9]\d?)$/.exec(parameter.text);
          if (!ratio || ratio.slice(1).some(number => Number(number) > 16)) error('Use an actual:normal tuplet ratio from 1 to 16 on each side', parameter);
          node = { kind: 'tuplet', scale: [BigInt(ratio[2]), BigInt(ratio[1])] };
        }
        node.body = block(sequence);
      } else if (['rest', 'skip', '|'].includes(token.text)) {
        take();
        node = { kind: token.text };
      } else {
        result.push(attack());
        continue;
      }
      node.range = [token.range[0], tokens[cursor - 1].range[1]];
      result.push(node);
    }
    return result;
  }

  function voices() {
    if (peek() !== 'voice') return [{ name: 'main', body: sequence() }];
    const result = [];
    const names = new Set();
    while (peek() === 'voice') {
      take();
      const nameToken = tokens[cursor];
      const name = identifier();
      if (names.has(name)) error('Duplicate voice ' + name, nameToken);
      names.add(name);
      result.push({ name, body: block(sequence) });
    }
    return result;
  }

  while (peek()) {
    const token = take();
    if (token.text === 'meter') {
      if (hasMeter || parts.length) error('Declare one meter before the first part', token);
      const value = take();
      const match = /^([1-9]|[12]\d|3[0-2])\/(1|2|4|8|16|32|64)$/.exec(value.text);
      if (!match) error('Expected a meter such as 4/4', value);
      meter = match.slice(1).map(BigInt);
      hasMeter = true;
    } else if (token.text === 'pattern') {
      const nameToken = tokens[cursor];
      const name = identifier();
      if (patterns.has(name)) error('Duplicate pattern ' + name, nameToken);
      patterns.set(name, block(sequence));
    } else if (partKinds.has(token.text)) {
      const staves = [];
      if (token.text === 'piano') {
        block(() => {
          for (const hand of ['upper','lower']) {
            expect(hand);
            staves.push({ name: hand, voices: block(voices) });
          }
        });
      } else staves.push({ name: 'main', voices: block(voices) });
      parts.push({ kind: token.text, range: token.range, staves });
    } else error('Expected meter, pattern, guitar, staff, drums, or piano', token);
  }
  if (!parts.length) error('Expected a part');
  return { patterns, parts, meter };
}

/** Lower serial sequences into parallel named voice streams. Each expanded event retains its origin. */
export function compile(source) {
  const fail = (code, reason, range, trace) => { throw new Diagnostic(code, reason, source, range, trace); };
  const { patterns, parts, meter } = readScore(tokenize(source, fail), fail);
  const meterText = fractionText(meter);
  const measureLength = fractionText(rational(...meter, fail, [0, 0]));
  let steps = 0, eventCount = 0, scoreBars;
  const spend = (range, trace) => {
    if (++steps > limits.steps) fail('work-limit', 'Phrase expansion exceeded its work budget', range, trace);
  };

  // A hammer connects pitched positions on the same string in consecutive attacks of this voice.
  function resolveHammer(head, previous, trace) {
    const hammer = head.marks.find(mark => mark.kind === 'hammer');
    if (!hammer) return head;
    const source = previous?.heads.findIndex(item => item.string === head.string && Number.isInteger(item.fret) && item.fret < head.fret);
    if (!Number.isInteger(head.fret) || source === undefined || source < 0)
      fail('hammer', 'Expected a lower fret on this string in the preceding attack', hammer.range, trace);
    return { ...head, hammerFrom: { event: previous.id, head: source } };
  }

  function lower(part, staff, voice, partIndex) {
    const events = [];
    let bar = 1, beat = [0n, 1n];
    function walk(body, duration, scale, trace) {
      if (trace.length > limits.depth) fail('depth-limit', 'Phrase expansion is too deep', trace.at(-1).range, trace);
      for (const node of body) {
        spend(node.range, trace);
        switch (node.kind) {
          case 'duration': duration = node.value; break;
          case '|':
            if (fractionText(beat) !== measureLength) fail('bar-length', 'Bar ' + bar + ' contains ' + fractionText(beat) + ' of a whole note, expected ' + meterText, node.range, trace);
            bar++;
            beat = [0n, 1n];
            break;
          case 'use':
            walk(patterns.get(node.name), [1n, 4n], scale, [...trace, { pattern: node.name, range: node.range }]);
            break;
          case 'times':
            for (let i = 1; i <= node.count; i++) {
              spend(node.range, trace);
              walk(node.body, duration, scale, [...trace, { iteration: i, range: node.range }]);
            }
            break;
          case 'tuplet': {
            const ratio = rational(scale[0] * node.scale[0], scale[1] * node.scale[1], fail, node.range, trace);
            walk(node.body, duration, ratio, [...trace, { tuplet: node.scale[1] + ':' + node.scale[0], range: node.range }]);
            break;
          }
          default: {
            for (const head of node.heads ?? []) {
              if ((part.kind === 'drums') !== !!head.drum || (head.string && part.kind !== 'guitar'))
                fail('instrument', 'This head does not belong to ' + part.kind, head.range, trace);
            }
            if (++eventCount > limits.events) fail('event-limit', 'Too many expanded attacks, rests or skips', node.range, trace);
            const length = rational(duration[0] * scale[0], duration[1] * scale[1], fail, node.range, trace);
            const id = [partIndex + 1, staff.name, voice.name, events.length + 1].join('.');
            events.push({ id, bar, at: fractionText(beat), duration: fractionText(length), writtenDuration: fractionText(duration), kind: node.kind,
              heads: (node.heads ?? []).map(head => resolveHammer(head, events.at(-1), trace)),
              marks: node.marks ?? [], range: node.range, trace });
            beat = rational(beat[0] * length[1] + length[0] * beat[1], beat[1] * length[1], fail, node.range, trace);
            if (beat[0] * meter[1] > meter[0] * beat[1]) fail('bar-length', 'Attack crosses the end of bar ' + bar, node.range, trace);
          }
        }
      }
    }
    walk(voice.body, [1n, 4n], [1n, 1n], []);
    if (beat[0]) fail('bar-length', 'End the final measure with |', events.at(-1).range, events.at(-1).trace);
    if (bar === 1) fail('bar-length', 'Expected at least one measure', part.range);
    if (scoreBars !== undefined && scoreBars !== bar - 1) fail('alignment', 'Every voice must cover the same number of bars', part.range);
    scoreBars = bar - 1;
    return { name: voice.name, events };
  }
  return { meter: meterText, parts: parts.map((part, index) => ({
    kind: part.kind, staves: part.staves.map(staff => ({
      name: staff.name, voices: staff.voices.map(voice => lower(part, staff, voice, index)),
    })),
  })) };
}
