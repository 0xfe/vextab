// Parse written v2 notation into a bounded syntax tree before expanding any pattern.
import { isControlPosition, isControlSize } from '../../playback/control-options.mts';
import { isPerformerName } from '../../playback/profiles.mts';
import type { GraceFingering, GracePitch, EventMark, Head, HeadMark, PartKind, PartSettings, WrittenMeter, StaffName, TextStyle, LaneStyle, TextBoundary, TextRange, ExpansionFrame, InstrumentIdentity } from './model.js';

import { limits, type capacityLimits } from './capacity.mts';
export { limits };
type Budgets = ReturnType<typeof capacityLimits>;

export type DiagnosticCode = 'syntax' | 'source-limit' | 'token-limit' | 'depth-limit' | 'fraction-limit'
  | 'work-limit' | 'event-limit' | 'hammer' | 'instrument' | 'alignment' | 'bar-length';
export type Fail = (code: DiagnosticCode, reason: string, range: TextRange, trace?: ExpansionFrame[]) => never;
interface Token { text: string; range: TextRange }
export type Fraction = [bigint, bigint];
export type TimedNode = { range: TextRange } & (
  { kind: 'rest' | 'skip' | 'slash'; marks?: EventMark[] } | { kind: 'attack'; heads: Head[]; marks: EventMark[] }
);
export type Node = TimedNode | { kind: import('./model.js').ExpressiveSpan; body: Node[]; niente?: boolean; feather?: 'left' | 'right'; strokes?: number; range: TextRange } | { range: TextRange } & (
  { kind: 'meter'; signature: WrittenMeter } | { kind: 'duration'; value: Fraction } | { kind: 'use'; name: string } |
  { kind: 'times'; count: number; body: Node[] } | { kind: 'tuplet'; scale: Fraction; body: Node[] } |
  { kind: 'volta'; body: Node[]; endings: Node[][] } | { kind: '|'; closing?: string } |
  { kind: 'textBoundary'; boundary: Omit<TextBoundary, 'bar'> } | { kind: 'break' | 'repeatStart' } | { kind: 'mark'; text: string } |
  { kind: 'fragment' | 'slur' | 'beam' | 'palmMute' | 'transpose' | 'octave'; body: Node[]; side?: 'above' | 'below'; strings?: number[]; semitones?: number }
);
export interface VoiceSyntax { settings?: import('./model.js').VoiceSettings; name: string; range: TextRange; body: Node[] }
export interface StaffSyntax extends Omit<InstrumentIdentity, 'name'> { staffChanges?: PartSettings['staffChanges']; displayName?: string; name: StaffName; range: TextRange; voices: VoiceSyntax[] }
export interface PartSyntax extends PartSettings, InstrumentIdentity { lanes?: { voice: VoiceSyntax; style: LaneStyle }[]; kind: PartKind; range: TextRange; staves: StaffSyntax[] }

/** Comments consume the rest of the line. Punctuation has the same meaning across line breaks. */
function tokenize(source: string, fail: Fail, budgets: Budgets): Token[] {
  if (source.length > budgets.bytes || new TextEncoder().encode(source).length > budgets.bytes) fail('source-limit', 'Score exceeds ' + budgets.bytes / 1024 + ' KiB', [0, 0]);
  const tokens: Token[] = [];
  function emit(text: string, range: TextRange) {
    if (tokens.length === budgets.tokens) fail('token-limit', 'Score exceeds ' + budgets.tokens + ' input tokens', range);
    tokens.push({ text, range });
  }
  const commentTail = /[^\r\n]*/y;
  const words = /\/\/[^\r\n]*|"(?:\\.|[^"\\\r\n])*"|"|[{}()[\],|]|(?:\/(?!\/)|[^/"\s{}()[\],|])+/gu;
  let match: RegExpExecArray | null;
  while ((match = words.exec(source))) {
    if (match[0].startsWith('//')) continue;
    const word = match[0];
    // Keep the complete ink argument, including invalid colours, for its usual diagnostic.
    if (word.startsWith('#') && tokens[tokens.length - 1]?.text !== 'ink') {
      commentTail.lastIndex = match.index;
      commentTail.exec(source);
      words.lastIndex = commentTail.lastIndex;
      continue;
    }
    // Each fret owns its written digits. The final attack also owns the shared string suffix.
    if (/^(?:(?:x|0|[1-9]\d?)-)+(?:x|0|[1-9]\d?)\/[1-8]$/.test(word)) {
      const [frets, string] = word.split('/');
      let start = match.index;
      for (const fret of frets.split('-')) {
        const end = start + fret.length;
        emit(fret + '/' + string, [start, end === match.index + frets.length ? words.lastIndex : end]);
        start = end + 1;
      }
    } else emit(word, [match.index, words.lastIndex]);
  }
  tokens.push({ text: '', range: [source.length, source.length] });
  return tokens;
}

/** Map decoded JSON-string offsets back to written UTF-16 positions, including escapes. */
function aliasTokens(value: string, definition: Token, fail: Fail, budgets: Budgets): Token[] {
  const offsets = [definition.range[0] + 1];
  for (let i = 1; i < definition.text.length - 1;) {
    if (definition.text[i] !== '\\') i++;
    else i += definition.text[i + 1] === 'u' ? 6 : 2;
    offsets.push(definition.range[0] + i);
  }
  const written = ([start, end]: TextRange): TextRange => [offsets[start], offsets[end]];
  return tokenize(value, (code, reason, range) => fail(code, reason, written(range)), budgets)
    .map(token => ({ text: token.text, range: written(token.range) }));
}

const durationPattern = /^:(w|h|q|1|2|4|8|16|32|64|128|256)(\.{0,2})$/;
const notePattern = /^[A-G](?:bb|##|b|#|n)?[0-9]$/;
const positionPattern = /^(x|0|[1-9]\d?)\/([1-8])$/;
const builtInMarks = new Set([
  'sustain', 'hammer', 'tie', 'pull', 'slide', 'courtesy', 'slash', 'accent', 'frame', 'line', 'ink', 'label',
  'tap', 'vibrato', 'brush', 'roll', 'stroke', 'rasgueado', 'symbol', 'write', 'staccato', 'fermata',
  'dynamic', 'harmony', 'onStaff', 'sharedStem', 'pedal', 'ossia', 'grace', 'ornament', 'verse', 'gliss', 'release', 'articulation', 'lyric', 'bend', 'prebend', 'finger',
]);
const standardDrums = ['kick', 'snare', 'hat'];
function isPartKind(name: string): name is PartKind {
  return name === 'guitar' || name === 'piano' || name === 'drums' || name === 'staff';
}

/** Parse a bounded syntax tree. A pattern may refer only to already completed definitions. */
export function readScore(source: string, fail: Fail, budgets: Budgets = limits) {
  let drums = new Set(standardDrums);
  const tempoRanges = new Map<number, TextRange>();
  let tokens = tokenize(source, fail, budgets);
  let cursor = 0, depth = 0;
  const peek = (): string => tokens[Math.min(cursor, tokens.length - 1)].text;
  const take = (): Token => {
    const token = tokens[cursor];
    if (!token.text) error('Unexpected end of score', token);
    cursor++;
    return token;
  };
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
  const scoreMeters: Record<number, WrittenMeter> = {};

  let playback: import('./model.js').ScoreV2['playback'];
  let transpose: number | undefined;
  let measureNumbers: boolean | undefined;
  const groups: import('./model.js').StaffGroup[] = [];
  const editions: import('./model.js').Edition[] = [];
  let layout: import('./model.js').ScoreLayout | undefined;
  let pickup: Fraction | undefined, pickupToken: Token | undefined;

  /** Preserve written grouping and signatures such as cut time alongside their rational length. */
  function readMeter(token: Token): WrittenMeter {
    const range = token.range;
    if (token.text === 'common') return { value: '4/4', sign: 'C', range };
    if (token.text === 'cut') return { value: '2/2', sign: 'C|', range };
    const match = /^(\d{1,2}(?:\+\d{1,2})*)\/(1|2|4|8|16|32|64)$/.exec(token.text);
    if (!match) error('Expected a meter such as 4/4', token);
    const groups = match[1].split('+').map(Number);
    const beats = groups.reduce((total, n) => total + n, 0);
    if (beats > 32 || groups.includes(0)) error('Expected one through 32 beats', token);
    return { value: beats + '/' + match[2], ...(groups.length > 1 && { sign: token.text }), range };
  }

  /** A declaration's bar number belongs to the surrounding score or part. */
  function declareMeter(meters: Record<number, WrittenMeter>, value: Token) {
    const signature = readMeter(value);
    let bar = 1;
    if (peek() === 'at') {
      take(); const at = take();
      if (!/^[1-9]\d{0,3}$/.test(at.text) || Number(at.text) < 2) error('Expected a bar number starting at 2', at);
      bar = Number(at.text);
    }
    if (meters[bar]) error('Meter already declared for bar ' + bar, value);
    meters[bar] = signature;
  }

  function ornamentName() {
    const sign = take();
    if (!['tr', 'turn', 'turn_inverted', 'mordent', 'mordent_inverted'].includes(sign.text)) error('Unknown ornament', sign);
    return sign.text;
  }

  function isEventMark(mark: HeadMark | EventMark): mark is EventMark {
    return ['spanEndpoint','dynamic','harmony','onStaff','sharedStem','pedal','ossia','grace','ornament','slash', 'line', 'accent', 'symbol', 'lyric', 'frame', 'ink', 'label', 'tap', 'vibrato', 'stroke', 'brush', 'roll', 'rasgueado'].includes(mark.kind);
  }

  /** JSON quoting handles embedded punctuation and escaped quotes in musical text. */
  function literal(): string {
    const token = take();
    if (!token.text.startsWith('"')) return error('Expected quoted text', token);
    try { return JSON.parse(token.text); }
    catch { return error('Invalid quoted text', token); }
  }

  /** Physical dimensions use millimeters. Turn references follow a bar, breaks start one. */
  function readEdition(opening: Token) {
    const edition: import('./model.js').Edition = { range: opening.range, settings: {}, anchors: [], cues: [] };
    if (peek() === 'part') { take(); edition.part = identifier(); }
    else if (peek() === 'conductor') { take(); edition.conductor = true; }
    if (editions.some(e => e.part === edition.part && e.conductor === edition.conductor))
      error('Duplicate edition for this target', opening);
    function dimension() {
      const t = take();
      if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(t.text)) error('Expected millimeters', t);
      return Number(t.text);
    }
    function measure() {
      const t = take();
      if (!/^[1-9]\d{0,3}$/.test(t.text)) error('Expected a positive measure number', t);
      return Number(t.text);
    }
    block(() => {
      while (peek() !== '}') {
        const field = take(), key = field.text;
        if (Object.prototype.hasOwnProperty.call(edition.settings, key)) error('Duplicate edition setting', field);
        if (key === 'paper') {
          const t = take();
          if (t.text !== 'A4' && t.text !== 'Letter') error('Expected A4 or Letter', t);
          edition.settings.paper = t.text;
        } else if (key === 'margins') {
          edition.settings.margins = { top: dimension(), right: dimension(), bottom: dimension(), left: dimension() };
        } else if (key === 'staffSize') {
          edition.settings.staffSize = dimension();
          if (!edition.settings.staffSize) error('Expected a positive staff size', field);
        } else if (key === 'title' || key === 'subtitle' || key === 'header' || key === 'footer') {
          edition.settings[key] = literal();
        } else if (key === 'pageNumbers' || key === 'compressRests') {
          const t = take();
          if (t.text !== 'on' && t.text !== 'off') error('Expected on or off', t);
          edition.settings[key] = t.text === 'on';
        } else if (key === 'system' || key === 'page' || key === 'prefer' || key === 'forbid') {
          expect(key === 'system' || key === 'page' ? 'at' : 'after');
          const bar = measure();
          edition.anchors.push({ field: ({ system: 'systemBreaks', page: 'pageBreaks', prefer: 'preferredTurns', forbid: 'forbiddenTurns' } as const)[key],
            measure: bar, range: [field.range[0], tokens[cursor - 1].range[1]] });
        } else if (key === 'cue') {
          if (!edition.part) error('Declare a cue in a player edition', field);
          const part = identifier();
          expect('at');
          const bar = measure(), label = literal();
          if (!label.trim()) error('Expected a cue label', field);
          edition.cues.push({ part, measure: bar, label, range: [field.range[0], tokens[cursor - 1].range[1]] });
        } else error('Unknown edition setting', field);
      }
    });
    edition.range = [opening.range[0], tokens[cursor - 1].range[1]];
    editions.push(edition);
  }

  /** Display and playback metadata are shared by instrument and staff declarations. */
  function identityFields(id?: string): InstrumentIdentity {
    const fields: InstrumentIdentity = id ? { id } : {};
    while (peek() === 'name' || peek() === 'shortName' || (peek() === 'sounds' && tokens[cursor + 2]?.text !== 'at')) {
      const field = take();
      if (Object.prototype.hasOwnProperty.call(fields, field.text)) error('Duplicate instrument field', field);
      if (field.text === 'sounds') {
        const value = take();
        if (!/^[+-]?\d{1,3}$/.test(value.text) || Math.abs(Number(value.text)) > 127)
          error('Expected a sounding interval from -127 to +127 semitones', value);
        fields.sounds = Number(value.text);
      } else fields[field.text as 'name' | 'shortName'] = literal();
    }
    return fields;
  }

  function staffFields(identity: InstrumentIdentity) {
    const { name, ...fields } = identity;
    return { ...fields, ...(name !== undefined && { displayName: name }) };
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

  /** Reduce exact author-supplied timing within the compiler precision budget. */
  function readTiming(token: Token, value: string, share = false): string {
    const match = /^([1-9]\d{0,9})\/([1-9]\d{0,9})$/.exec(value);
    if (!match) error('Expected a positive fraction', token);
    const [n, d] = match.slice(1).map(Number);
    if (n > limits.fraction || d > limits.fraction) error('Timing fraction exceeds precision limit', token);
    if (share && n >= d) error('Grace share must be smaller than one', token);
    let a = n, b = d;
    while (b) [a, b] = [b, a % b];
    return (n / a) + '/' + (d / a);
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
    if (mark.text === 'sustain') {
      const token = take();
      return { kind: 'sustain', duration: readTiming(token, token.text), range: range() };
    }
    if (['slurStart', 'slurEnd', 'beamStart', 'beamEnd', 'crescendoStart', 'diminuendoStart', 'hairpinEnd'].includes(mark.text)) {
      const name = identifier();
      const span = mark.text.startsWith('slur') ? 'slur' : mark.text.startsWith('beam') ? 'beam' : 'hairpin';
      const edge = mark.text.endsWith('Start') ? 'start' : 'end';
      const hairpin = mark.text === 'crescendoStart' ? 'crescendo' : mark.text === 'diminuendoStart' ? 'diminuendo' : undefined;
      const side = mark.text === 'slurStart' && (peek() === 'above' || peek() === 'below') ? take().text as 'above' | 'below' : undefined;
      const niente = !!hairpin && peek() === 'niente';
      if (niente) take();
      return { kind: 'spanEndpoint', name, span, edge, hairpin, side, niente, range: range() };
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
    if (mark.text === 'dynamic') {
      const value = take();
      if (!/^(ppp|pp|p|mp|mf|f|ff|fff)$/.test(value.text)) error('Expected a dynamic from ppp to fff', value);
      return { kind: 'dynamic', value: value.text as import('./model.js').Dynamic, range: range() };
    }
    if (mark.text === 'onStaff') {
      const hand = take();
      if (hand.text !== 'upper' && hand.text !== 'lower') error('Expected upper or lower', hand);
      return { kind: 'onStaff', hand: hand.text, range: range() };
    }
    if (mark.text === 'sharedStem') return { kind: 'sharedStem', name: identifier(), range: range() };
    if (mark.text === 'ornament') {
      return { kind: 'ornament', value: ornamentName(), range: range() };
    }
    if (mark.text === 'pedal') {
      const action = take();
      if (action.text !== 'down' && action.text !== 'up') error('Expected pedal down or up', action);
      const onset = action.text === 'up' && peek() === 'onset';
      if (onset) take();
      return { kind: 'pedal', action: action.text, ...(onset && { onset }), range: range() };
    }
    if (mark.text === 'ossia') {
      const duration = take();
      if (!/^:(?:q|8|16|32)$/.test(duration.text)) error('Expected an ossia note value such as :8', duration);
      const notes: { pitch: string; ornament?: string }[] = [];
      expect('(');
      while (peek() !== ')') {
        const pitch = take();
        if (!notePattern.test(pitch.text) || notes.length >= 16) error('Expected up to 16 ossia notes', pitch);
        let ornament: string;
        if (peek() === '[') {
          take(); expect('ornament');
          ornament = ornamentName();
          expect(']');
        }
        notes.push({ pitch: pitch.text, ornament });
      }
      expect(')');
      if (!notes.length) error('Expected an ossia note', mark);
      return { kind: 'ossia', duration: duration.text.slice(1), notes, range: range() };
    }
    if (mark.text === 'grace') {
      const side = take(), pitches: (GracePitch | GracePitch[])[] = [];
      const fingerings: GraceFingering[] = [];
      if (side.text !== 'before' && side.text !== 'after') error('Expected before or after', side);
      const slash = peek() === 'slashed';
      if (slash) take();
      const token = peek().startsWith('steal=') ? take() : undefined;
      const steal = token && readTiming(token, token.text.slice(6), true);
      expect('(');
      while (peek() !== ')') {
        if (pitches.length >= 16) error('Expected up to 16 grace attacks');
        const chord = peek() === '(';
        if (chord) take();
        const keys: GracePitch[] = [];
        do {
          const pitch = take();
          const position = positionPattern.exec(pitch.text);
          if (keys.length >= limits.heads) error('Too many grace chord heads', pitch);
          if (notePattern.test(pitch.text)) keys.push(pitch.text);
          else if (position && position[1] !== 'x') keys.push({ fret: Number(position[1]), string: Number(position[2]) });
          else error('Expected a grace pitch or fret/string', pitch);
          if (peek() === '[') {
            take();
            if (peek() !== 'finger') error('Expected a finger on the grace head');
            const finger = readMark();
            if (finger.kind !== 'finger') return error('Expected a grace fingering');
            fingerings.push({ attack: pitches.length, head: keys.length - 1, finger: String(finger.value), position: finger.side });
            expect(']');
          }
        } while (chord && peek() !== ')');
        if (chord) expect(')');
        pitches.push(chord ? keys : keys[0]);
      }
      expect(')');
      if (!pitches.length) error('Expected a grace pitch', side);
      return { kind: 'grace', side: side.text, pitches, ...(steal && { steal }), ...(fingerings.length && { fingerings }), ...(slash && { slash }), range: range() };
    }
    if (mark.text === 'harmony') {
      function chordPitch() {
        const t = take();
        if (!/^[A-G](?:b|#)?$/.test(t.text)) error('Expected a chord root or bass pitch', t);
        return t.text;
      }
      const root = chordPitch(), quality = literal();
      let bass: string;
      if (peek() === 'bass') { take(); bass = chordPitch(); }
      return { kind: 'harmony', root, quality, ...(bass && { bass }), range: range() };
    }
    if (mark.text === 'lyric' || mark.text === 'verse') {
      const verse = mark.text === 'verse' ? identifier() : undefined;
      const text = literal();
      let elideWith: string;
      if (peek() === 'elide') { take(); elideWith = literal(); }
      const hyphen = peek() === 'hyphen';
      if (hyphen) take();
      const extension = /^extend=([1-9]\d?)$/.exec(peek());
      if (extension) take();
      return { kind: 'lyric', ...(verse && { verse }), ...(elideWith !== undefined && { elideWith }), text, hyphen, extend: extension ? Number(extension[1]) : 0, range: range() };
    }
    if (mark.text === 'slideIn' || mark.text === 'slideOut') {
      const side = take();
      if (side.text !== 'above' && side.text !== 'below') return error('Expected above or below', side);
      return { kind: mark.text, side: side.text, range: range() };
    }
    if (mark.text === 'gliss') {
      const head = take();
      if (!/^(?:[1-9]|1[0-6])$/.test(head.text)) error('Expected the previous chord head number, 1 through 16', head);
      return { kind: 'gliss', fromHead: Number(head.text) - 1, range: range() };
    }
    if (mark.text === 'release' || mark.text === 'bend') {
      function phase(name: string): [number, number] {
        const token = take();
        const match = /^(\w+)=(\d{1,4})(?:\/(\d{1,4}))?$/.exec(token.text);
        if (!match || match[1] !== name) return error('Expected ' + name + '=N/D', token);
        const n = Number(match[2]), d = Number(match[3] ?? 1);
        if (d < 1 || n < 1 || n > d) return error('Bend phase must lie within the note', token);
        return [n, d];
      }
      if (mark.text === 'release') {
        const hold = phase('hold'), release = phase('release');
        if (release[0] * hold[1] <= hold[0] * release[1]) error('Release must follow the hold', mark);
        return { kind: 'release', hold, release, range: range() };
      }
      const amount = take();
      if (!/^\+(?:[1-9]\d?(?:\.5)?|0\.5)$/.test(amount.text)) error('Expected a positive bend in semitones', amount);
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

  const aliases = new Map<string, HeadMark | EventMark>();

  /** Resolve each definition once. Quoted values contain exactly one built-in mark. */
  function defineAliases() {
    do {
      const name = take();
      const assignment = /^([a-z][a-z0-9_]*)(=?)$/.exec(name.text);
      if (!assignment) error('Expected an alias name', name);
      if (!assignment[2]) expect('=');
      const key = assignment[1];
      if (aliases.has(key)) error('Duplicate alias ' + key, name);
      if (builtInMarks.has(key)) error('Alias would hide the built-in mark ' + key, name);
      const definition = tokens[cursor];
      const value = literal();
      const outer = tokens, next = cursor;
      tokens = aliasTokens(value, definition, fail, budgets);
      cursor = 0;
      try {
        const mark = readMark();
        if (peek()) error('Expected one complete note mark');
        aliases.set(key, mark);
      } finally {
        tokens = outer;
        cursor = next;
      }
    } while (/^[a-z][a-z0-9_]*=$/.test(peek()) || tokens[cursor + 1]?.text === '=');
  }

  function namedMark(): HeadMark | EventMark {
    const mark = aliases.get(peek());
    return mark ? { ...mark, range: take().range } : readMark();
  }

  /** Brackets belong to the head or whole attack immediately preceding them. */
  function marks(): (HeadMark | EventMark)[] {
    if (peek() !== '[') return [];
    take();
    const list = [namedMark()];
    while (peek() === ',') {
      take();
      list.push(namedMark());
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
      } else if (token.text === 'meter') {
        take();
        const signature = readMeter(take());
        node = { kind: 'meter', signature, range: [token.range[0], signature.range[1]] };
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
      } else if (token.text === 'crescendo' || token.text === 'diminuendo' || token.text === 'continuousBeam' || token.text === 'feather' || token.text === 'tremolo') {
        const kind = token.text;
        take();
        let strokes: number, feather: 'left' | 'right', niente: boolean;
        if (kind === 'tremolo') {
          const count = take();
          if (!/^[1-4]$/.test(count.text)) error('Expected one to four tremolo strokes', count);
          strokes = Number(count.text);
        } else if (kind === 'feather') {
          const direction = take();
          if (direction.text !== 'left' && direction.text !== 'right') error('Expected left or right', direction);
          feather = direction.text;
        } else if (kind !== 'continuousBeam' && peek() === 'niente') { take(); niente = true; }
        node = { kind, strokes, feather, niente, body: block(sequence), range: token.range };
      } else if (token.text === 'fragment' || token.text === 'slur' || token.text === 'beam') {
        take();
        const side = token.text === 'slur' && (peek() === 'above' || peek() === 'below') ? take().text as 'above' | 'below' : undefined;
        node = { kind: token.text, side, body: block(sequence), range: token.range };
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
  function voices(allowSketch = false): VoiceSyntax[] {
    if (peek() !== 'voice') {
      const range = tokens[cursor].range;
      const body = sequence(true);
      // An unmetered guitar sketch may consist solely of attacks and durations.
      if (allowSketch && body.some(node => node.kind === 'attack') &&
          body.every(node => ['attack', 'duration', 'rest', 'skip', 'slash'].includes(node.kind))) {
        return [{ name: 'main', range, body: [{ kind: 'fragment', range: [range[0], body[body.length - 1].range[1]], body }] }];
      }
      return [{ name: 'main', range, body }];
    }
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
  /** Timed declarations are bar-local. Normalize offsets so equivalent spellings compare identically. */
  function timedPosition(first: Token) {
    expect('at');
    const bar = take();
    if (!/^[1-9]\d{0,4}$/.test(bar.text)) error('Expected a positive written bar number', bar);
    let at = '0/1', last = bar;
    if (peek() === '+') {
      take(); last = take();
      if (!/^\d{1,9}\/[1-9]\d{0,8}$/.test(last.text)) error('Expected an offset in whole notes', last);
      const [n, d] = last.text.split('/').map(Number);
      let a = n, b = d;
      while (b) [a, b] = [b, a % b];
      at = (n / a) + '/' + (d / a);
    }
    return { bar: Number(bar.text), at, range: [first.range[0], last.range[1]] as TextRange };
  }

  function settings(kind: PartKind, voiceOnly = false, hand = false): PartSettings {
    const result: PartSettings = {};
    /** Apply shared settings to the whole part or to an authored measure boundary. */
    function atBar() {
      expect('at');
      const at = take();
      if (!/^[1-9]\d{0,3}$/.test(at.text) || Number(at.text) < 2) error('Expected a bar number starting at 2', at);
      return Number(at.text);
    }
    function change(values: NonNullable<PartSettings['changes']>[number]) {
      if (peek() !== 'at') { Object.assign(result, values); return; }
      const at = atBar();
      const changes = result.changes ??= {};
      changes[at] = { ...changes[at], ...values };
    }
    const names = hand ? ['key','clef','sounds'] : voiceOnly ? ['stem', 'beams', 'beamRests', 'stemlets', 'middleRests', 'tabStems', 'tabDirection'] : ['program', 'map', 'meter', 'key', 'clef', 'sounds', 'view', 'capo', 'tuning', 'ink', 'stem', 'beams', 'beamRests', 'tabStems', 'stemlets', 'middleRests', 'tabDirection', 'accidentals', 'display', 'groupBeats'];
    while (names.includes(peek())) {
      const option = take(), value = take();
      if (option.text === 'program') {
        if (!/^\d{1,3}$/.test(value.text) || Number(value.text) > 127) error('Expected a MIDI program from 0 to 127', value);
        result.program = Number(value.text);
      } else if (option.text === 'map') {
        if (kind !== 'drums' || !/^[a-z][a-z0-9_]*$/.test(value.text) || drums.has(value.text)) error('Expected a new percussion ID', value);
        const label = literal();
        if (!label.trim()) error('Expected a percussion label', value);
        expect('line'); const line = take();
        expect('head'); const head = take();
        expect('stem'); const stem = take();
        expect('midi'); const midi = take();
        if (!/^-?\d(?:\.5)?$/.test(line.text)) error('Expected a staff line or space', line);
        if (!['normal','cross','circle-cross','triangle'].includes(head.text)) error('Unknown percussion head', head);
        if (stem.text !== 'up' && stem.text !== 'down') error('Expected up or down', stem);
        if (!/^\d{1,3}$/.test(midi.text) || Number(midi.text) > 127) error('Expected a MIDI pitch from 0 to 127', midi);
        (result.drums ??= []).push({ id: value.text, label, line: Number(line.text), head: head.text as 'normal' | 'cross' | 'circle-cross' | 'triangle', stem: stem.text, midi: Number(midi.text) });
        drums.add(value.text);
      } else if (option.text === 'meter') {
        declareMeter(result.meters ??= {}, value);
      } else if (option.text === 'accidentals') {
        if (value.text !== 'standard' && value.text !== 'cautionary') error('Expected standard or cautionary', value);
        result.cautionary = value.text === 'cautionary';
      } else if (option.text === 'display') {
        if (value.text !== 'meter') error('Expected display meter', value);
        const setting = take();
        if (setting.text !== 'hidden' && setting.text !== 'shown') error('Expected hidden or shown', setting);
        change({ displayMeter: setting.text === 'shown' });
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
      } else if (option.text === 'ink') change({ ink: value.text });
      else if (option.text === 'stem' || option.text === 'tabDirection') {
        if (value.text !== 'up' && value.text !== 'down') error('Expected up or down', value);
        result[option.text] = value.text;
      } else if (option.text === 'beams' || option.text === 'beamRests' || option.text === 'tabStems' || option.text === 'stemlets' || option.text === 'middleRests') {
        if (value.text !== 'on' && value.text !== 'off') error('Expected on or off', value);
        result[option.text === 'beams' ? 'beam' : option.text] = value.text === 'on';
      } else if (option.text === 'key') {
        if (!/^(?:Cb|Gb|Db|Ab|Eb|Bb|F|C|G|D|A|E|B|F#|C#|Abm|Ebm|Bbm|Fm|Cm|Gm|Dm|Am|Em|Bm|F#m|C#m|G#m|D#m|A#m)$/.test(value.text))
          error('Expected a key signature', value);
        if (peek() === 'at' || hand) {
          const position = peek() === 'at' ? timedPosition(option) : { bar: 1, at: '0/1', range: option.range };
          if (!hand && position.at === '0/1' && position.bar > 1) (result.keys ??= {})[position.bar] = value.text;
          else (result.staffChanges ??= []).push({ ...position, key: value.text });
        } else result.key = value.text;
      } else if (option.text === 'sounds') {
        if (!/^[+-]?\d{1,3}$/.test(value.text) || Math.abs(Number(value.text)) > 127) error('Invalid sounding interval', value);
        (result.staffChanges ??= []).push({ ...timedPosition(option), sounds: Number(value.text) });
      } else if (option.text === 'clef') {
        if ((kind === 'piano' && !hand) || kind === 'drums') error('Declare the clef on a pitched staff', option);
        const clefs = ['treble', 'bass', 'alto', 'tenor', 'none', 'soprano', 'mezzo-soprano', 'baritone-c', 'baritone-f', 'subbass', 'french', 'percussion'];
        if (!clefs.includes(value.text)) error('Unknown clef', value);
        if (peek() === 'at' || hand) {
          if (value.text === 'none') error('A timed clef must be visible', value);
          const position = peek() === 'at' ? timedPosition(option) : { bar: 1, at: '0/1', range: option.range };
          (result.staffChanges ??= []).push({ ...position, clef: value.text });
        } else result.clef = value.text as PartSettings['clef'];
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
        change({ tuning: pitches.join(',') });
      } else {
        const names: Record<string, string> = { standard: 'standard', dropD: 'dropd', dagdad: 'dagdad', eb: 'eb', standardBanjo: 'standardBanjo' };
        if (!Object.prototype.hasOwnProperty.call(names, value.text)) error('Unknown guitar tuning', value);
        change({ tuning: names[value.text] });
      }
    }
    return result;
  }

  while (peek()) {
    const token = take();
    if (token.text === 'meter') {
      if (parts.length) error('Declare the shared meters before the first part', token);
      declareMeter(scoreMeters, take());
    } else if (token.text === 'pickup') {
      if (pickup || parts.length) error('Declare one pickup before the first part', token);
      pickupToken = take();
      const match = /^([1-9]\d{0,2})\/(1|2|4|8|16|32|64)$/.exec(pickupToken.text);
      if (!match) error('Expected a pickup duration such as 1/8', pickupToken);
      pickup = [BigInt(match[1]), BigInt(match[2])];
    } else if (token.text === 'edition') {
      readEdition(token);
    } else if (token.text === 'layout') {
      if (layout || parts.length) error('Declare layout once before the first part', token);
      layout = {};
      block(() => {
        while (peek() !== '}') {
          const field = take();
          if (field.text === 'heading') {
            if (layout!.heading) error('Declare the score heading once', field);
            const heading: import('./model.js').ScoreHeading = {};
            block(() => {
              while (peek() !== '}') {
                const key = take();
                if (key.text === 'align') {
                  if (heading.align) error('Duplicate score heading alignment', key);
                  expect('center');
                  heading.align = 'center';
                  continue;
                }
                if (key.text !== 'title' && key.text !== 'dedication' && key.text !== 'tempo' && key.text !== 'composer')
                  error('Unknown score heading field', key);
                if (heading[key.text] !== undefined) error('Duplicate score heading field', key);
                heading[key.text] = literal();
              }
            });
            layout!.heading = heading;
            continue;
          }
          const value = take(), number = Number(value.text);
          if (field.text === 'font') {
            if (value.text !== 'Petaluma' && value.text !== 'Bravura') error('Expected Petaluma or Bravura', value);
            layout!.font = value.text;
            continue;
          }
          if (field.text === 'spacing') {
            if (value.text !== 'optical') error('Expected optical spacing', value);
            layout!.spacing = 'optical';
            continue;
          }
          if (field.text !== 'width' && field.text !== 'scale' && field.text !== 'rowGap' && field.text !== 'staffDistance' && field.text !== 'firstSystemIndent' && field.text !== 'top')
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
          if (field.text === 'enabled') {
            const value = take();
            if (value.text !== 'on' && value.text !== 'off') error('Expected on or off', value);
            playback!.enabled = value.text === 'on';
          } else if (field.text === 'tempo') {
            const tempo = take();
            if (!/^[1-9]\d{0,2}$/.test(tempo.text)) error('Expected a positive tempo', tempo);
            if (peek() === 'at') {
              const pos = timedPosition(field);
              if (pos.at !== '0/1') (playback!.tempoChanges ??= []).push({ ...pos, bpm: Number(tempo.text) });
              else {
                if (tempoRanges.has(pos.bar)) error('Duplicate tempo change at this bar', tempo);
                tempoRanges.set(pos.bar, pos.range);
                (playback!.tempos ??= {})[pos.bar] = Number(tempo.text);
              }
            } else playback!.tempo = Number(tempo.text);
          } else if (field.text === 'controls' || field.text === 'controlSize' || field.text === 'position' || field.text === 'inset') {
            const value = take(), controls = playback!.controls ??= {};
            if (field.text === 'controls') {
              if (value.text === 'off' || value.text === 'hover' || value.text === 'always') controls.visibility = value.text;
              else error('Expected controls off, hover or always', value);
            } else if (field.text === 'controlSize') {
              if (!isControlSize(value.text)) error('Expected controlSize auto, mini or large', value);
              else controls.size = value.text;
            } else if (field.text === 'position') {
              if (!isControlPosition(value.text)) error('Unknown control position', value);
              else controls.position = value.text;
            } else {
              if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(value.text)) error('Expected a nonnegative control inset in pixels', value);
              controls.inset = Number(value.text);
            }
          } else if (field.text === 'swing') {
            const feel = take();
            if (feel.text !== 'eighths' && feel.text !== 'off') error('Expected swing eighths or swing off', feel);
            else playback!.swing = feel.text;
          } else if (field.text === 'performer') {
            const name = take();
            if (!isPerformerName(name.text)) error('Unknown performer: ' + name.text, name);
            else playback!.performer = name.text;
          } else if (field.text === 'instrument') {
            const instrument = take();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(instrument.text) && !/^(?:0|[1-9]\d?|1[01]\d|12[0-7])$/.test(instrument.text)) error('Expected an instrument name or MIDI program', instrument);
            playback!.instrument = instrument.text;
          }
          else error('Expected a playback setting', field);
        }
      });
    } else if (token.text === 'transpose') {
      const amount = take();
      if (parts.length || transpose !== undefined) error('Declare a single transposition before the first part', amount);
      if (!/^[+-]?\d{1,3}$/.test(amount.text) || Math.abs(Number(amount.text)) > 127)
        error('Transposition needs an integer from -127 to 127', amount);
      transpose = Number(amount.text);
    } else if (token.text === 'measureNumbers') {
      const value = take();
      if (value.text !== 'off' && value.text !== 'on') error('Expected on or off', value);
      measureNumbers = value.text === 'on';
    } else if (token.text === 'alias') {
      if (parts.length) error('Declare aliases before the first part', token);
      defineAliases();
    } else if (token.text === 'pattern') {
      const nameToken = tokens[cursor];
      const name = identifier();
      if (patterns.has(name)) error('Duplicate pattern ' + name, nameToken);
      patterns.set(name, block(sequence));
    } else if (token.text === 'group') {
      const type = take();
      if (type.text !== 'brace' && type.text !== 'bracket') error('Expected brace or bracket', type);
      expect('('); const names: string[] = [];
      while (peek() !== ')') names.push(identifier());
      const end = take();
      if (names.length < 2) error('A group needs at least two parts', type);
      groups.push({ type: type.text as 'brace' | 'bracket', parts: names, range: [token.range[0], end.range[1]] });
    } else if (isPartKind(token.text)) {
      drums = new Set(standardDrums);
      const idToken = tokens[cursor];
      const id = peek() === '{' ? undefined : identifier();
      if (id && parts.some(part => part.id === id)) error('Duplicate part ID ' + id, idToken);
      let identity: InstrumentIdentity;
      const staves: StaffSyntax[] = [];
      let options: PartSettings = {};
      let lanes: PartSyntax['lanes'];
      if (token.text === 'piano') {
        block(() => {
          identity = identityFields(id);
          options = settings('piano');
          for (const hand of ['upper', 'lower'] as const) {
            const handToken = expect(hand);
            const key = tokens[cursor];
            const staffId = peek() === '{' ? undefined : identifier();
            if (staves.some(staff => (staff.id ?? staff.name) === (staffId ?? hand)))
              error('Duplicate staff ID ' + (staffId ?? hand), staffId ? key : handToken);
            let fields: InstrumentIdentity, handSettings: PartSettings;
            const music = block(() => { fields = identityFields(staffId); handSettings = settings('piano', false, true); return voices(); });
            staves.push({ ...staffFields(fields), ...handSettings, name: hand, range: handToken.range, voices: music });
          }
          lanes = readLanes();
        });
      } else {
        let primary: InstrumentIdentity = {};
        const music = block(() => {
          identity = identityFields(id);
          if (peek() === 'stave') {
            take();
            const staffId = identifier();
            primary = block(() => identityFields(staffId));
          }
          options = settings(token.text as PartKind);
          const unmeteredGuitar = token.text === 'guitar' && !options.meters && !Object.keys(scoreMeters).length && !pickup;
          const partsVoices = voices(unmeteredGuitar);
          lanes = readLanes();
          return partsVoices;
        });
        staves.push({ ...staffFields(primary), name: 'main', range: token.range, voices: music });
      }
      parts.push({ ...identity, ...options, ...(lanes?.length && { lanes }), kind: token.text, range: token.range, staves });
    } else error('Expected a score setting, alias, pattern or part', token);
  }
  if (!parts.length) error('Expected a part');
  return { groups, tempoRanges, editions, patterns, parts, scoreMeters, pickup, pickupRange: pickupToken?.range, playback, measureNumbers, layout, transpose };
}
