// Parse written v2 notation into a bounded syntax tree before expanding any pattern.
import type { EventMark, Head, HeadMark, PartKind, PartSettings, StaffName, TextStyle, LaneStyle, TextBoundary, TextRange, ExpansionFrame } from './model.js';

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
  { kind: 'rest' | 'skip' | 'slash'; marks?: EventMark[] } | { kind: 'attack'; heads: Head[]; marks: EventMark[] }
);
export type Node = TimedNode | { range: TextRange } & (
  { kind: 'duration'; value: Fraction } | { kind: 'use'; name: string } |
  { kind: 'times'; count: number; body: Node[] } | { kind: 'tuplet'; scale: Fraction; body: Node[] } |
  { kind: 'volta'; body: Node[]; endings: Node[][] } | { kind: '|'; closing?: string } |
  { kind: 'textBoundary'; boundary: Omit<TextBoundary, 'bar'> } | { kind: 'break' | 'repeatStart' } | { kind: 'mark'; text: string } |
  { kind: 'fragment' | 'slur' | 'beam' | 'palmMute' | 'transpose' | 'octave'; body: Node[]; strings?: number[]; semitones?: number }
);
export interface VoiceSyntax { settings?: import('./model.js').VoiceSettings; name: string; range: TextRange; body: Node[] }
export interface StaffSyntax { name: StaffName; range: TextRange; voices: VoiceSyntax[] }
export interface PartSyntax extends PartSettings { lanes?: { voice: VoiceSyntax; style: LaneStyle }[]; kind: PartKind; range: TextRange; staves: StaffSyntax[] }

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

const durationPattern = /^:(w|h|q|1|2|4|8|16|32|64|128|256)(\.{0,2})$/;
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
  const peek = (): string => tokens[Math.min(cursor, tokens.length - 1)].text;
  const take = () => tokens[Math.min(cursor++, tokens.length - 1)];
  const error: (message: string, token?: Token) => never = (message, token = tokens[Math.min(cursor, tokens.length - 1)]) => fail('syntax', message, token.range);
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

  let playback: import('./model.js').ScoreV2['playback'];
  let transpose: number | undefined;
  let measureNumbers: boolean | undefined;
  let layout: import('./model.js').ScoreLayout | undefined;
  let initialSign: string | undefined;
  const meterChanges = new Map<number, { value: Fraction; range: TextRange; sign?: string }>();
  let pickup: Fraction | undefined, pickupToken: Token | undefined;

  function isEventMark(mark: HeadMark | EventMark): mark is EventMark {
    return ['slash', 'line', 'accent', 'symbol', 'lyric', 'frame', 'ink', 'label', 'tap', 'vibrato', 'stroke', 'brush', 'roll', 'rasgueado'].includes(mark.kind);
  }

  /** JSON quoting handles embedded punctuation and escaped quotes in musical text. */
  function literal(): string {
    const token = take();
    if (!token.text.startsWith('"')) return error('Expected quoted text', token);
    try { return JSON.parse(token.text); }
    catch { return error('Invalid quoted text', token); }
  }

  /** Text labels and timed lanes share their font and ink properties. */
  function textStyle(): TextStyle {
    const style: TextStyle = {};
    while (['above', 'below', 'font', 'size', 'style', 'ink'].includes(peek())) {
      const field = take();
      if (field.text === 'above' || field.text === 'below') style.position = field.text;
      else if (field.text === 'font') style.family = literal();
      else {
        const value = take();
        if (field.text === 'ink') style.ink = value.text;
        else if (field.text === 'size') {
          if (!/^\d{1,2}$/.test(value.text) || Number(value.text) < 1) error('Expected a positive font size', value);
          style.size = Number(value.text);
        } else {
          if (value.text !== 'italic' && value.text !== 'normal' && value.text !== 'bold') error('Expected a font style', value);
          style.style = value.text;
        }
      }
    }
    return style;
  }

  /** Each mark keeps the written token range even after pattern expansion. */
  function readMark(): HeadMark | EventMark {
    const mark = take();
    if (mark.text === 'hammer' || mark.text === 'tie' || mark.text === 'pull' || mark.text === 'slide' || mark.text === 'courtesy' || mark.text === 'showSign') return { kind: mark.text, range: mark.range };
    const range = (): TextRange => [mark.range[0], tokens[cursor - 1].range[1]];
    if (mark.text === 'slash') return { kind: 'slash', range: mark.range };
    if (mark.text === 'accent') {
      if (peek() === 'above' || peek() === 'below') return { kind: 'sign', code: 'a>', position: take().text as 'above' | 'below', range: range() };
      return { kind: 'accent', range: range() };
    }
    if (mark.text === 'tieStart' || mark.text === 'tieEnd') {
      const name = identifier();
      return { kind: mark.text, name, range: range() };
    }
    if (mark.text === 'frame') {
      expect('(');
      const frets: (number | 'x')[] = [];
      while (peek() !== ')') {
        const cell = take();
        if (!/^(?:x|\d{1,2})$/.test(cell.text) || frets.length >= 8) error('Expected up to eight diagram frets', cell);
        frets.push(cell.text === 'x' ? 'x' : Number(cell.text));
      }
      take();
      let barre: [number, number, number] | undefined;
      if (peek().startsWith('barre=')) {
        const cell = take(), parsed = /^barre=(\d{1,2})\/([1-8])\.\.([1-8])$/.exec(cell.text);
        if (!parsed) error('Expected barre=fret/from..to', cell);
        barre = [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
      }
      return { kind: 'frame', frets, barre, range: range() };
    }
    if (mark.text === 'line') {
      const value = take();
      if (!/^-?\d{1,2}(?:\.5)?$/.test(value.text)) error('Expected a staff line', value);
      return { kind: 'line', value: Number(value.text), range: range() };
    }
    if (mark.text === 'ink') return { kind: 'ink', value: take().text, range: range() };
    if (mark.text === 'label') {
      const text = literal(), style = textStyle();
      return { kind: 'label', text, style, range: range() };
    }
    if (mark.text === 'tap' || mark.text === 'vibrato') {
      const wide = mark.text === 'vibrato' && peek() === 'wide';
      if (wide) take();
      return { kind: mark.text, wide, range: range() };
    }
    if (mark.text === 'brush' || mark.text === 'roll' || mark.text === 'stroke' || mark.text === 'rasgueado') {
      const direction = take();
      if (direction.text !== 'up' && direction.text !== 'down') error('Expected up or down', direction);
      return { kind: mark.text, direction: direction.text, range: range() };
    }
    if (mark.text === 'symbol') {
      const text = literal();
      let ink: string | undefined;
      if (peek() === 'ink') { take(); ink = take().text; }
      return { kind: 'symbol', text, ink, range: range() };
    }
    if (mark.text === 'write') {
      const pitch = take();
      if (!notePattern.test(pitch.text)) error('Expected a written pitch', pitch);
      return { kind: 'write', pitch: pitch.text, range: range() };
    }
    if (['staccato', 'fermata', 'articulation'].includes(mark.text)) {
      const code = mark.text === 'articulation' ? (peek().startsWith('"') ? literal() : take().text) : mark.text === 'fermata' ? 'a@a' : 'a.';
      const position = peek() === 'below' ? 'below' : 'above';
      if (peek() === 'below' || peek() === 'above') take();
      return { kind: 'sign', code, position, range: range() };
    }
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
    if (mark.text !== 'finger' && mark.text !== 'stringNumber') return error('Unknown note mark ' + mark.text, mark);
    if (mark.text === 'finger' ? !/^[0-5Tpimac]$/.test(peek()) : !/^[1-8]$/.test(peek())) return error('Invalid finger or string number');
    const digit = take();
    const placement = peek();
    const side = placement === 'left' || placement === 'right' || placement === 'above' || placement === 'below' ? placement : undefined;
    if (side) take();
    return { kind: mark.text, value: /^\d$/.test(digit.text) ? Number(digit.text) : digit.text, side: side ?? 'left', range: [mark.range[0], tokens[cursor - 1].range[1]] };
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
          if (mark.kind === 'accent') { item.marks.push({ kind: 'sign', code: 'a>', position: 'above', range: mark.range }); continue; }
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
    if (chord && headMarks.some(mark => mark.kind !== 'sign')) error('Place a head mark inside the chord', first);
    heads[0].marks.push(...headMarks);
    return { kind: 'attack', heads, marks: annotations.filter(isEventMark), range: [first.range[0], tokens[cursor - 1].range[1]] };
  }

  function durationNode(duration: RegExpExecArray, range: TextRange): Node {
    const denominator = { w: 1, h: 2, q: 4 }[duration[1]] ?? Number(duration[1]);
    const dotFactor = 2 ** duration[2].length;
    return { range, kind: 'duration', value: [BigInt(dotFactor * 2 - 1), BigInt(denominator * dotFactor)] };
  }

  function sequence(stopAtText = false): Node[] {
    const result: Node[] = [];
    while (peek() !== '}' && !(stopAtText && peek() === 'text')) {
      const token = tokens[cursor];
      if (!token.text) error('Expected a closing brace');
      let node: Node;
      const duration = durationPattern.exec(token.text);
      if (duration) {
        take();
        node = durationNode(duration, token.range);
      } else if (token.text === 'use') {
        take();
        const target = tokens[cursor];
        const name = identifier();
        if (!patterns.has(name)) error('Declare pattern ' + name + ' before using it (including inside patterns)', target);
        node = { range: token.range, kind: 'use', name };
      } else if (token.text === 'bar') {
        take();
        const type = take();
        const types: Record<string, string> = { double: 'double', final: 'end', repeatEnd: 'repeat-end', repeatBoth: 'repeat-both', single: 'single' };
        if (!Object.prototype.hasOwnProperty.call(types, type.text)) error('Unknown closing barline', type);
        node = { kind: '|', closing: types[type.text], range: token.range };
      } else if (token.text === 'repeatStart') {
        take(); node = { kind: 'repeatStart', range: token.range };
      } else if (token.text === 'break') {
        take(); expect('system');
        node = { kind: 'break', range: token.range };
      } else if (token.text === 'mark') {
        take(); node = { kind: 'mark', text: literal(), range: token.range };
      } else if (token.text === 'fragment' || token.text === 'slur' || token.text === 'beam') {
        take(); node = { kind: token.text, body: block(sequence), range: token.range };
      } else if (token.text === 'palmMute') {
        take(); expect('strings'); expect('(');
        const strings: number[] = [];
        while (peek() !== ')') {
          const value = take();
          if (!/^[1-8]$/.test(value.text) || strings.includes(Number(value.text))) error('Expected distinct string numbers', value);
          strings.push(Number(value.text));
        }
        if (!strings.length) error('Expected a string number');
        take(); node = { kind: 'palmMute', strings, body: block(sequence), range: token.range };
      } else if (token.text === 'transpose' || token.text === 'octave') {
        take(); const value = take();
        const semitones = Number(value.text) * (token.text === 'octave' ? 12 : 1);
        if (!/^[+-]?\d{1,3}$/.test(value.text) || Math.abs(semitones) > 127) error('Invalid transposition interval', value);
        node = { kind: token.text, semitones, body: block(sequence), range: token.range };
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
      } else if (token.text === 'rest' || token.text === 'skip' || token.text === 'slash' || token.text === '|') {
        take();
        if (token.text === '|') node = { kind: '|', range: token.range };
        else {
          const decorations = marks();
          if (decorations.some(m => !isEventMark(m))) error('This rhythm has no pitched head', token);
          node = { kind: token.text, marks: decorations as EventMark[], range: token.range };
        }
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
    if (peek() !== 'voice') return [{ name: 'main', range: tokens[cursor].range, body: sequence(true) }];
    const result = [];
    const names = new Set();
    while (peek() === 'voice') {
      take();
      const nameToken = tokens[cursor];
      const name = identifier();
      if (names.has(name)) error('Duplicate voice ' + name, nameToken);
      names.add(name);
      const overrides = settings('staff', true);
      result.push({ name, range: nameToken.range, settings: overrides, body: block(sequence) });
    }
    return result;
  }

  /** Text settings persist until the next written change in this lane. */
  function laneStyle(): LaneStyle {
    const style: LaneStyle = {};
    while (['font', 'size', 'style', 'ink', 'line', 'align', 'spacing'].includes(peek())) {
      if (['font', 'size', 'style', 'ink'].includes(peek())) { Object.assign(style, textStyle()); continue; }
      const field = take(), value = take();
      if (field.text === 'line') {
        if (!/^-?\d{1,2}$/.test(value.text)) error('Expected a staff line', value);
        style.line = Number(value.text);
      } else if (field.text === 'align') {
        if (value.text !== 'left' && value.text !== 'right' && value.text !== 'center') error('Invalid text alignment', value);
        style.align = value.text;
      } else {
        if (value.text !== 'strict' && value.text !== 'smooth') error('Expected strict or smooth spacing', value);
        style.smooth = value.text === 'smooth';
      }
    }
    return style;
  }

  /** Text lanes share the music grid and advance independently of the played voices. */
  function readLanes(): NonNullable<PartSyntax['lanes']> {
    const lanes: NonNullable<PartSyntax['lanes']> = [];
    while (peek() === 'text') {
      take();
      const range = tokens[cursor].range, name = identifier();
      if (lanes.some(lane => lane.voice.name === name)) error('Duplicate text lane');
      const style = laneStyle();
      const body = block(() => {
        const body: Node[] = [];
        let active = style;
        while (peek() !== '}') {
          const token = tokens[cursor], duration = durationPattern.exec(peek());
          if (duration) { take(); body.push(durationNode(duration, token.range)); }
          else if (peek() === '|') { take(); body.push({ kind: '|', range: token.range }); }
          else if (peek() === 'skip') { take(); body.push({ kind: 'skip', range: token.range }); }
          else if (['font', 'size', 'style', 'ink', 'line', 'align', 'spacing'].includes(peek())) active = { ...active, ...laneStyle() };
          else {
            const edge = peek() === 'start' || peek() === 'end' ? take().text : undefined;
            const glyph = peek() === 'sign';
            let text: string;
            if (glyph) { take(); text = identifier(); }
            else text = literal();
            const range: TextRange = [token.range[0], tokens[cursor - 1].range[1]];
            if (edge === 'start' || edge === 'end') body.push({ kind: 'textBoundary', boundary: { edge, text, glyph, style: active, range }, range });
            else body.push({ kind: 'attack', heads: [], marks: [{ kind: 'text', text, glyph, style: active, range }], range });
          }
        }
        return body;
      });
      lanes.push({ voice: { name, range, body }, style });
    }
    return lanes;
  }

  /** Read settings before the part's first voice so every voice shares the same instrument. */
  function settings(kind: PartKind, voiceOnly = false): PartSettings {
    const result: PartSettings = {};
    const names = voiceOnly ? ['stem', 'beams', 'beamRests', 'stemlets', 'middleRests', 'tabStems', 'tabDirection'] : ['key', 'clef', 'view', 'capo', 'tuning', 'ink', 'stem', 'beams', 'beamRests', 'tabStems', 'stemlets', 'middleRests', 'tabDirection', 'accidentals', 'display', 'groupBeats'];
    while (names.includes(peek())) {
      const option = take(), value = take();
      if (option.text === 'accidentals') {
        if (value.text !== 'standard' && value.text !== 'cautionary') error('Expected standard or cautionary', value);
        result.cautionary = value.text === 'cautionary';
      } else if (option.text === 'display') {
        if (value.text !== 'meter') error('Expected display meter', value);
        const setting = take();
        if (setting.text !== 'hidden' && setting.text !== 'shown') error('Expected hidden or shown', setting);
        result.displayMeter = setting.text === 'shown';
      } else if (option.text === 'groupBeats') {
        if (value.text !== '(') error('Expected beat groups in parentheses', value);
        const groups: number[] = [];
        while (peek() !== ')') {
          const count = take();
          if (!/^[1-9]\d?$/.test(count.text) || groups.length >= 32) error('Invalid beat group', count);
          groups.push(Number(count.text));
        }
        if (!groups.length) error('Expected at least one beat group');
        take(); result.beatGroups = groups;
      } else if (option.text === 'ink') result.ink = value.text;
      else if (option.text === 'stem' || option.text === 'tabDirection') {
        if (value.text !== 'up' && value.text !== 'down') error('Expected up or down', value);
        result[option.text] = value.text;
      } else if (option.text === 'beams' || option.text === 'beamRests' || option.text === 'tabStems' || option.text === 'stemlets' || option.text === 'middleRests') {
        if (value.text !== 'on' && value.text !== 'off') error('Expected on or off', value);
        result[option.text === 'beams' ? 'beam' : option.text] = value.text === 'on';
      } else if (option.text === 'key') {
        if (!/^(?:Cb|Gb|Db|Ab|Eb|Bb|F|C|G|D|A|E|B|F#|C#|Abm|Ebm|Bbm|Fm|Cm|Gm|Dm|Am|Em|Bm|F#m|C#m|G#m|D#m|A#m)$/.test(value.text))
          error('Expected a key signature', value);
        if (peek() === 'at') {
          take(); const at = take();
          if (!/^[1-9]\d{0,3}$/.test(at.text) || Number(at.text) < 2) error('Expected a bar number starting at 2', at);
          (result.keys ??= {})[Number(at.text)] = value.text;
        } else result.key = value.text;
      } else if (option.text === 'clef') {
        if (kind === 'piano' || kind === 'drums') error('This part supplies its own clefs', option);
        const clefs = ['treble', 'bass', 'alto', 'tenor', 'none', 'soprano', 'mezzo-soprano', 'baritone-c', 'baritone-f', 'subbass', 'french', 'percussion'];
        if (!clefs.includes(value.text)) error('Unknown clef', value);
        result.clef = value.text as PartSettings['clef'];
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
      if (parts.length) error('Declare the shared meters before the first part', token);
      const value = take();
      let sign: string | undefined;
      let valuePair: Fraction;
      if (value.text === 'common' || value.text === 'cut') {
        sign = value.text === 'common' ? 'C' : 'C|';
        valuePair = value.text === 'common' ? [BigInt(4), BigInt(4)] : [BigInt(2), BigInt(2)];
      } else {
        const match = /^(\d{1,2}(?:\+\d{1,2})*)\/(1|2|4|8|16|32|64)$/.exec(value.text);
        if (!match) error('Expected a meter such as 4/4', value);
        const groups = match[1].split('+').map(Number);
        const beats = groups.reduce((total, n) => total + n, 0);
        if (beats > 32 || groups.includes(0)) error('Expected one through 32 beats', value);
        valuePair = [BigInt(beats), BigInt(match[2])];
        if (groups.length > 1) sign = value.text;
      }
      if (peek() === 'at') {
        take(); const n = take();
        if (!/^[1-9]\d{0,3}$/.test(n.text) || Number(n.text) < 2 || meterChanges.has(Number(n.text))) error('Expected a unique bar number starting at 2', n);
        meterChanges.set(Number(n.text), { value: valuePair, range: value.range, sign });
      } else {
        if (meterRange) error('Declare one initial meter', token);
        meter = valuePair;
        initialSign = sign;
        meterRange = value.range;
      }
    } else if (token.text === 'pickup') {
      if (pickup || parts.length) error('Declare one pickup before the first part', token);
      pickupToken = take();
      const match = /^([1-9]\d{0,2})\/(1|2|4|8|16|32|64)$/.exec(pickupToken.text);
      if (!match) error('Expected a pickup duration such as 1/8', pickupToken);
      pickup = [BigInt(match[1]), BigInt(match[2])];
    } else if (token.text === 'layout') {
      if (layout || parts.length) error('Declare layout once before the first part', token);
      layout = {};
      block(() => {
        while (peek() !== '}') {
          const field = take(), value = take(), number = Number(value.text);
          if (field.text !== 'width' && field.text !== 'scale' && field.text !== 'rowGap' && field.text !== 'staffDistance' && field.text !== 'top')
            error('Unknown score layout setting', field);
          if (!/^\d{1,4}(?:\.\d{1,3})?$/.test(value.text) || (field.text === 'width' && number <= 20) ||
            (field.text === 'scale' && (!number || number > 8))) error('Invalid layout dimension', value);
          layout![field.text] = number;
        }
      });
    } else if (token.text === 'play') {
      if (parts.length || playback) error('Set playback once before the first part', token);
      playback = { enabled: true };
      block(() => {
        while (peek() !== '}') {
          const field = take();
          if (field.text === 'tempo') {
            const tempo = take();
            if (!/^[1-9]\d{0,2}$/.test(tempo.text)) error('Expected a positive tempo', tempo);
            playback!.tempo = Number(tempo.text);
          } else if (field.text === 'instrument') {
            const instrument = take();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(instrument.text) && !/^(?:0|[1-9]\d?|1[01]\d|12[0-7])$/.test(instrument.text)) error('Expected an instrument name or MIDI program', instrument);
            playback!.instrument = instrument.text;
          }
          else error('Expected tempo or instrument', field);
        }
      });
    } else if (token.text === 'transpose') {
      const amount = take();
      if (parts.length || transpose !== undefined || !/^[+-]?\d{1,3}$/.test(amount.text) || Math.abs(Number(amount.text)) > 127)
        error('Declare a single transposition before the first part', amount);
      transpose = Number(amount.text);
    } else if (token.text === 'measureNumbers') {
      const value = take();
      if (value.text !== 'off' && value.text !== 'on') error('Expected on or off', value);
      measureNumbers = value.text === 'on';
    } else if (token.text === 'pattern') {
      const nameToken = tokens[cursor];
      const name = identifier();
      if (patterns.has(name)) error('Duplicate pattern ' + name, nameToken);
      patterns.set(name, block(sequence));
    } else if (isPartKind(token.text)) {
      const staves: StaffSyntax[] = [];
      let options: PartSettings = {};
      let lanes: PartSyntax['lanes'];
      if (token.text === 'piano') {
        block(() => {
          options = settings('piano');
          for (const hand of ['upper', 'lower'] as const) {
            const handToken = expect(hand);
            staves.push({ name: hand, range: handToken.range, voices: block(voices) });
          }
          lanes = readLanes();
        });
      } else staves.push({ name: 'main', range: token.range, voices: block(() => { options = settings(token.text as PartKind); const music = voices(); lanes = readLanes(); return music; }) });
      parts.push({ ...options, ...(lanes?.length && { lanes }), kind: token.text, range: token.range, staves });
    } else error('Expected meter, pattern, guitar, staff, drums, or piano', token);
  }
  if (!parts.length) error('Expected a part');
  if (pickup && pickup[0] * meter[1] >= meter[0] * pickup[1]) error('Pickup must be shorter than the meter', pickupToken);
  return { patterns, parts, meter, meterRange, initialSign, pickup, meterChanges, playback, measureNumbers, layout, transpose };
}
