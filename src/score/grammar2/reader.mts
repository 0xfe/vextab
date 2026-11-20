// Parse written v2 notation into a bounded syntax tree before expanding any pattern.
import type { EventMark, Head, HeadMark, PartKind, PartSettings, StaffName, TextRange, ExpansionFrame } from './model.js';

/** One compilation shares these budgets across all parts, voices and pattern calls. */
export const limits = Object.freeze({
  bytes: 65536, tokens: 8192, depth: 24, repetitions: 32,
  events: 4096, heads: 16, steps: 32768, fraction: 2147483647,
});

export type DiagnosticCode = 'syntax' | 'source-limit' | 'token-limit' | 'depth-limit' | 'fraction-limit'
  | 'work-limit' | 'event-limit' | 'hammer' | 'instrument' | 'alignment' | 'bar-length';
export type Fail = (code: DiagnosticCode, reason: string, range: TextRange, trace?: ExpansionFrame[]) => never;
interface Token { text: string; range: TextRange }
export type Fraction = [bigint, bigint];
export type TimedNode = { range: TextRange } & (
  { kind: 'rest' | 'skip' } | { kind: 'attack'; heads: Head[]; marks: EventMark[] }
);
export type Node = TimedNode | { range: TextRange } & (
  { kind: 'duration'; value: Fraction } | { kind: 'use'; name: string } |
  { kind: 'times'; count: number; body: Node[] } | { kind: 'tuplet'; scale: Fraction; body: Node[] } |
  { kind: 'volta'; body: Node[]; endings: Node[][] } | { kind: '|' }
);
export interface VoiceSyntax { name: string; range: TextRange; body: Node[] }
export interface StaffSyntax { name: StaffName; range: TextRange; voices: VoiceSyntax[] }
export interface PartSyntax extends PartSettings { kind: PartKind; range: TextRange; staves: StaffSyntax[] }

/** Comments consume the rest of the line. Punctuation has the same meaning across line breaks. */
function tokenize(source: string, fail: Fail): Token[] {
  if (source.length > limits.bytes || new TextEncoder().encode(source).length > limits.bytes) fail('source-limit', 'Score exceeds 64 KiB', [0, 0]);
  const tokens: Token[] = [];
  const words = /\/\/[^\r\n]*|"(?:\\.|[^"\\\r\n])*"|"|[{}()[\],|]|(?:\/(?!\/)|[^/"\s{}()[\],|])+/gu;
  let match: RegExpExecArray | null;
  while ((match = words.exec(source))) {
    if (match[0].startsWith('//')) continue;
    const range: TextRange = [match.index, match.index + match[0].length];
    if (tokens.length === limits.tokens) fail('token-limit', 'Too many input tokens', range);
    tokens.push({ text: match[0], range });
  }
  tokens.push({ text: '', range: [source.length, source.length] });
  return tokens;
}

const durationPattern = /^:(w|h|q|1|2|4|8|16|32|64)(\.{0,2})$/;
const notePattern = /^[A-G](?:bb|##|b|#|n)?[0-8]$/;
const positionPattern = /^(x|0|[1-9]\d?)\/([1-8])$/;
const drums = new Set(['kick', 'snare', 'hat']);
function isPartKind(name: string): name is PartKind {
  return name === 'guitar' || name === 'piano' || name === 'drums' || name === 'staff';
}

/** Parse a bounded syntax tree. A pattern may refer only to already completed definitions. */
export function readScore(source: string, fail: Fail) {
  const tokens = tokenize(source, fail);
  let cursor = 0, depth = 0;
  const peek = (): string => tokens[cursor].text;
  const take = () => tokens[cursor++];
  const error: (message: string, token?: Token) => never = (message, token = tokens[cursor]) => fail('syntax', message, token.range);
  function expect(text: string) {
    if (peek() !== text) error('Expected ' + text);
    return take();
  }
  function identifier() {
    if (!/^[a-z][a-z0-9_]*$/.test(peek())) error('Expected a lowercase name');
    return take().text;
  }
  function block<T>(body: () => T): T {
    const opening = expect('{');
    if (++depth > limits.depth) fail('depth-limit', 'Too many nested blocks', opening.range);
    const result = body();
    expect('}');
    depth--;
    return result;
  }
  const patterns = new Map<string, Node[]>();
  const parts: PartSyntax[] = [];
  let meter: Fraction = [BigInt(4), BigInt(4)], meterRange: TextRange | undefined;

  let pickup: Fraction | undefined, pickupToken: Token | undefined;

  function isEventMark(mark: HeadMark | EventMark): mark is EventMark {
    return mark.kind === 'accent' || mark.kind === 'symbol' || mark.kind === 'lyric';
  }

  /** JSON quoting handles embedded punctuation and escaped quotes in musical text. */
  function literal(): string {
    const token = take();
    if (!token.text.startsWith('"')) return error('Expected quoted text', token);
    try { return JSON.parse(token.text); }
    catch { return error('Invalid quoted text', token); }
  }

  /** Each mark keeps the written token range even after pattern expansion. */
  function readMark(): HeadMark | EventMark {
    const mark = take();
    if (mark.text === 'accent' || mark.text === 'hammer' || mark.text === 'tie') return { kind: mark.text, range: mark.range };
    const range = (): TextRange => [mark.range[0], tokens[cursor - 1].range[1]];
    if (mark.text === 'symbol') return { kind: 'symbol', text: literal(), range: range() };
    if (mark.text === 'lyric') {
      const text = literal();
      const hyphen = peek() === 'hyphen';
      if (hyphen) take();
      const extension = /^extend=([1-9]\d?)$/.exec(peek());
      if (extension) take();
      return { kind: 'lyric', text, hyphen, extend: extension ? Number(extension[1]) : 0, range: range() };
    }
    if (mark.text === 'slideIn' || mark.text === 'slideOut') {
      const side = take();
      if (side.text !== 'above' && side.text !== 'below') return error('Expected above or below', side);
      return { kind: mark.text, side: side.text, range: range() };
    }
    if (mark.text === 'bend') {
      const amount = take();
      if (!/^\+(?:[1-9]\d?(?:\.5)?|0\.5)$/.test(amount.text)) error('Expected a positive bend in semitones', amount);
      function phase(name: string): [number, number] {
        const token = take();
        const match = /^(\w+)=(\d{1,4})(?:\/(\d{1,4}))?$/.exec(token.text);
        if (!match || match[1] !== name) return error('Expected ' + name + '=N/D', token);
        const n = Number(match[2]), d = Number(match[3] ?? 1);
        if (d < 1 || n < 1 || n > d) return error('Bend phase must lie within the note', token);
        return [n, d];
      }
      const rise = phase('rise');
      const hold = peek().startsWith('hold=') ? phase('hold') : undefined;
      const release = peek().startsWith('release=') ? phase('release') : undefined;
      const end = hold ?? rise;
      if ((hold && hold[0] * rise[1] < rise[0] * hold[1]) || (release && release[0] * end[1] <= end[0] * release[1]))
        error('Bend phases must follow musical time', mark);
      return { kind: 'bend', semitones: Number(amount.text), rise, hold, release, range: range() };
    }
    if (mark.text === 'prebend') {
      const amount = take();
      if (!/^\+[1-9]\d?$/.test(amount.text)) return error('Expected a positive bend in semitones', amount);
      const release = peek() === 'release';
      if (release) take();
      return { kind: 'prebend', semitones: Number(amount.text), release, range: range() };
    }
    if (mark.text !== 'finger') return error('Unknown note mark ' + mark.text, mark);
    if (!/^[0-5]$/.test(peek())) return error('Expected a finger from 0 to 5');
    const digit = take();
    const placement = peek();
    const side = placement === 'left' || placement === 'right' || placement === 'above' || placement === 'below' ? placement : undefined;
    if (side) take();
    return { kind: 'finger', value: Number(digit.text), side: side ?? 'left', range: [mark.range[0], tokens[cursor - 1].range[1]] };
  }

  /** Brackets belong to the head or whole attack immediately preceding them. */
  function marks(): (HeadMark | EventMark)[] {
    if (peek() !== '[') return [];
    take();
    const list = [readMark()];
    while (peek() === ',') {
      take();
      list.push(readMark());
    }
    expect(']');
    return list;
  }

  function head(): Head {
    const token = take();
    const position = positionPattern.exec(token.text);
    if (position) return { marks: [], fret: position[1] === 'x' ? 'x' : Number(position[1]), string: Number(position[2]), range: token.range };
    if (notePattern.test(token.text)) return { marks: [], pitch: token.text, range: token.range };
    if (drums.has(token.text)) return { marks: [], drum: token.text, range: token.range };
    error('Expected a pitch, fret/string, or drum name', token);
  }

  function attack(): Node {
    const first = tokens[cursor];
    const chord = peek() === '(';
    const heads: Head[] = [];
    if (chord) {
      take();
      do {
        if (heads.length === limits.heads) error('Too many heads in a chord');
        const item = head();
        for (const mark of marks()) {
          if (isEventMark(mark)) return error('Place the attack mark after the closing parenthesis', first);
          item.marks.push(mark);
        }
        heads.push(item);
      } while (peek() !== ')');
      take();
    } else heads.push(head());
    const strings = new Set(), kit = new Set();
    for (const item of heads) {
      if ('string' in item && strings.has(item.string)) error('A chord needs distinct strings', first);
      if ('drum' in item && kit.has(item.drum)) error('A chord needs distinct drum instruments', first);
      if ('string' in item) strings.add(item.string);
      if ('drum' in item) kit.add(item.drum);
    }
    const annotations = marks();
    const headMarks = annotations.filter((mark): mark is HeadMark => !isEventMark(mark));
    if (chord && headMarks.length) error('Place a head mark inside the chord', first);
    if (!chord) heads[0].marks = headMarks;
    return { kind: 'attack', heads, marks: annotations.filter(isEventMark), range: [first.range[0], tokens[cursor - 1].range[1]] };
  }

  function sequence(): Node[] {
    const result: Node[] = [];
    while (peek() !== '}') {
      const token = tokens[cursor];
      if (!token.text) error('Expected a closing brace');
      let node: Node;
      const duration = durationPattern.exec(token.text);
      if (duration) {
        take();
        const denominator = { w: 1, h: 2, q: 4 }[duration[1]] ?? Number(duration[1]);
        const dotFactor = 2 ** duration[2].length;
        node = { range: token.range, kind: 'duration', value: [BigInt(dotFactor * 2 - 1), BigInt(denominator * dotFactor)] };
      } else if (token.text === 'use') {
        take();
        const target = tokens[cursor];
        const name = identifier();
        if (!patterns.has(name)) error('Declare pattern ' + name + ' before using it (including inside patterns)', target);
        node = { range: token.range, kind: 'use', name };
      } else if (token.text === 'volta') {
        take();
        const count = take();
        if (!/^(?:[2-9]|[12]\d|3[0-2])$/.test(count.text)) error('Expected 2 through 32 repeat passes', count);
        const body = block(sequence), endings: Node[][] = [];
        for (let i = 1; i <= Number(count.text); i++) {
          expect('ending');
          expect(String(i));
          endings.push(block(sequence));
        }
        node = { kind: 'volta', body, endings, range: token.range };
      } else if (token.text === 'times' || token.text === 'tuplet') {
        take();
        const parameter = take();
        if (token.text === 'times') {
          if (!/^[1-9]\d?$/.test(parameter.text) || Number(parameter.text) > limits.repetitions)
            error('Use a literal repeat count from 1 to ' + limits.repetitions, parameter);
          node = { range: token.range, kind: 'times', count: Number(parameter.text), body: block(sequence) };
        } else {
          const ratio = /^([1-9]\d?):([1-9]\d?)$/.exec(parameter.text);
          if (!ratio || ratio.slice(1).some(number => Number(number) > 16)) error('Use an actual:normal tuplet ratio from 1 to 16 on each side', parameter);
          node = { range: token.range, kind: 'tuplet', scale: [BigInt(ratio[2]), BigInt(ratio[1])], body: block(sequence) };
        }
      } else if (token.text === 'rest' || token.text === 'skip' || token.text === '|') {
        take();
        node = { kind: token.text, range: token.range };
      } else {
        result.push(attack());
        continue;
      }
      node.range = [token.range[0], tokens[cursor - 1].range[1]];
      result.push(node);
    }
    return result;
  }

  /** Explicit voices receive independent clocks. An unnamed sequence becomes the main voice. */
  function voices(): VoiceSyntax[] {
    if (peek() !== 'voice') return [{ name: 'main', range: tokens[cursor].range, body: sequence() }];
    const result = [];
    const names = new Set();
    while (peek() === 'voice') {
      take();
      const nameToken = tokens[cursor];
      const name = identifier();
      if (names.has(name)) error('Duplicate voice ' + name, nameToken);
      names.add(name);
      result.push({ name, range: nameToken.range, body: block(sequence) });
    }
    return result;
  }

  /** Read settings before the part's first voice so every voice shares the same instrument. */
  function settings(kind: PartKind): PartSettings {
    const result: PartSettings = {};
    while (['key', 'clef', 'view', 'capo', 'tuning'].includes(peek())) {
      const option = take(), value = take();
      if (option.text === 'key') {
        if (!/^(?:Cb|Gb|Db|Ab|Eb|Bb|F|C|G|D|A|E|B|F#|C#|Abm|Ebm|Bbm|Fm|Cm|Gm|Dm|Am|Em|Bm|F#m|C#m|G#m|D#m|A#m)$/.test(value.text))
          error('Expected a key signature', value);
        result.key = value.text;
      } else if (option.text === 'clef') {
        if (kind === 'piano' || kind === 'drums') error('This part supplies its own clefs', option);
        if (value.text !== 'treble' && value.text !== 'bass' && value.text !== 'alto' && value.text !== 'tenor') error('Expected a pitched clef', value);
        result.clef = value.text;
      } else if (kind !== 'guitar') error('This setting needs a guitar part', option);
      else if (option.text === 'view') {
        if (value.text !== 'tab' && value.text !== 'both' && value.text !== 'notation') error('Expected tab, notation or both', value);
        result.view = value.text;
      }
      else if (option.text === 'capo') {
        if (!/^(?:0|[1-9]|1\d|2[0-4])$/.test(value.text)) error('Expected capo fret 0 through 24', value);
        result.capo = Number(value.text);
      } else if (value.text === '(') {
        const pitches: string[] = [];
        while (peek() !== ')') {
          const pitch = take();
          if (!/^[A-G](?:#|b)?[0-8]$/.test(pitch.text)) error('Expected an open string pitch such as E4', pitch);
          if (pitches.length === 8) error('A tuning supports up to eight strings', pitch);
          pitches.push(pitch.text.slice(0, -1) + '/' + pitch.text.slice(-1));
        }
        if (pitches.length < 4) error('A tuning needs at least four strings', value);
        take();
        result.tuning = pitches.join(',');
      } else {
        const names: Record<string, string> = { standard: 'standard', dropD: 'dropd', dagdad: 'dagdad', eb: 'eb', standardBanjo: 'standardBanjo' };
        if (!Object.prototype.hasOwnProperty.call(names, value.text)) error('Unknown guitar tuning', value);
        result.tuning = names[value.text];
      }
    }
    return result;
  }

  while (peek()) {
    const token = take();
    if (token.text === 'meter') {
      if (meterRange || parts.length) error('Declare one meter before the first part', token);
      const value = take();
      const match = /^([1-9]|[12]\d|3[0-2])\/(1|2|4|8|16|32|64)$/.exec(value.text);
      if (!match) error('Expected a meter such as 4/4', value);
      meter = [BigInt(match[1]), BigInt(match[2])];
      meterRange = value.range;
    } else if (token.text === 'pickup') {
      if (pickup || parts.length) error('Declare one pickup before the first part', token);
      pickupToken = take();
      const match = /^([1-9]\d{0,2})\/(1|2|4|8|16|32|64)$/.exec(pickupToken.text);
      if (!match) error('Expected a pickup duration such as 1/8', pickupToken);
      pickup = [BigInt(match[1]), BigInt(match[2])];
    } else if (token.text === 'pattern') {
      const nameToken = tokens[cursor];
      const name = identifier();
      if (patterns.has(name)) error('Duplicate pattern ' + name, nameToken);
      patterns.set(name, block(sequence));
    } else if (isPartKind(token.text)) {
      const staves: StaffSyntax[] = [];
      let options: PartSettings = {};
      if (token.text === 'piano') {
        block(() => {
          options = settings('piano');
          for (const hand of ['upper', 'lower'] as const) {
            const handToken = expect(hand);
            staves.push({ name: hand, range: handToken.range, voices: block(voices) });
          }
        });
      } else staves.push({ name: 'main', range: token.range, voices: block(() => { options = settings(token.text as PartKind); return voices(); }) });
      parts.push({ ...options, kind: token.text, range: token.range, staves });
    } else error('Expected meter, pattern, guitar, staff, drums, or piano', token);
  }
  if (!parts.length) error('Expected a part');
  if (pickup && pickup[0] * meter[1] >= meter[0] * pickup[1]) error('Pickup must be shorter than the meter', pickupToken);
  return { patterns, parts, meter, meterRange, pickup };
}
