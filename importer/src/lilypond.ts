// Read static absolute-pitch music on one staff. Unknown commands cannot be skipped safely.
import { convert, Input, keys, Measure, meter, pitch, sourceLimit } from './score.js';
import { Time, zero } from './time.js';
import type { ImportOptions, ImportResult, TextRange } from './types.js';
export type { ImportedDocument, ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';

/** Each token carries its location in the original file, including after comments or CRLF. */
interface Token { value: string; range: TextRange }

/** Split delimiters and commands before interpreting their music or arguments. */
function tokens(source: string, input: Input): Token[] {
  if (source.length > sourceLimit) input.fail('limit', 'LilyPond exceeds the single-measure input budget.', [0, 0]);
  const words = /\s+|%\{[\s\S]*?%\}|%(?!\{)[^\r\n]*|"(?:\\.|[^"\\])*"|\\\\|\\[A-Za-z]+|<<|>>|-\.|[A-Za-z]+[',]*\d*|\d+\/\d+|\d+|./guy;
  const result: Token[] = [];
  for (const token of source.matchAll(words)) {
    if (/^\s|^%(?!$)/u.test(token[0])) continue;
    const range: TextRange = [token.index, token.index + token[0].length];
    if (token[0] === '%') {
      if (source.startsWith('%{', token.index)) input.fail('syntax', 'Unterminated block comment.', range);
      continue;
    }
    if (result.length >= 8192) input.fail('limit', 'Too many LilyPond tokens.', range);
    result.push({ value: token[0], range });
  }
  result.push({ value: '', range: [source.length, source.length] });
  return result;
}

/** Concert-pitch Nederlands note names. Middle C is c followed by one apostrophe. */
function writtenPitch(name: string, marks: string, input: Input, range: TextRange) {
  const normalized = name === 'as' ? 'aes' : name === 'es' ? 'ees' : name;
  const match = /^([a-g])(isis|eses|is|es)?$/.exec(normalized);
  if (!match || (marks.includes("'") && marks.includes(','))) return input.fail('unsupported', 'Expected an absolute Dutch pitch.', range);
  const octave = 3 + (marks.startsWith(',') ? -marks.length : marks.length);
  if (octave < 0 || octave > 9) input.fail('unsupported', 'Pitch exceeds the target octave range.', range);
  const alteration: Record<string, number> = { is: 1, isis: 2, es: -1, eses: -2 };
  return pitch(match[1].toUpperCase(), alteration[match[2]] ?? 0, octave);
}

/** A static staff has a shared meter and key, followed by a sequence or two simultaneous branches. */
function readStaff(source: string, input: Input): [Measure, TextRange] {
  const words = tokens(source, input), bar = new Measure();
  input.context = { part: bar.part, measure: bar.label };
  let i = 0;
  const peek = () => words[i];
  function take(value: string) {
    const t = peek();
    if (t.value !== value) input.fail('unsupported', 'Expected ' + value + ' at this point in the staff.', t.range);
    i++;
  }
  if (peek().value === '\\version') {
    i++;
    if (!/^"2\.(24|26)\.\d+"$/.test(peek().value)) input.fail('unsupported', 'Expected a 2.24 or 2.26 declaration.', peek().range);
    i++;
  }
  if (peek().value === '\\new') { i++; take('Staff'); }
  take('{');
  while (peek().value === '\\key' || peek().value === '\\time') {
    const command = words[i++].value, argument = peek();
    if (command === '\\key') {
      const p = writtenPitch(argument.value, '', input, argument.range);
      const key = p.step + ['bb', 'b', '', '#', '##'][p.alter + 2];
      if (!keys.includes(key)) input.fail('unsupported', 'Unsupported major key.', argument.range);
      bar.key = key;
      i++;
      take('\\major');
    } else {
      const [beats, unit] = argument.value.split('/');
      meter(beats, unit, bar, input, argument.range);
      i++;
    }
  }

  /** Omitted durations inherit within each sequence. A second branch starts explicitly in this profile. */
  function sequence(voice: string, second: boolean) {
    input.context.voice = voice;
    let at = zero, denominator = 4, attacks = 0;
    while (peek().value !== '}') {
      const token = peek();
      if (token.value === '|') {
        if (at.compare(new Time(bar.beats, bar.beatType)) !== 0) input.fail('timing', 'Bar check failed.', token.range);
        i++;
        continue;
      }
      const match = /^([a-z]+)([',]*)(\d*)$/.exec(token.value);
      if (!match) return input.fail('unsupported', 'Expected a note, rest or skip. Unknown music cannot be timed.', token.range);
      i++;
      let value = match[3], end = token.range[1];
      if (!value && /^\d+$/.test(peek().value)) {
        value = peek().value;
        end = words[i++].range[1];
      }
      if (second && !attacks && !value) input.fail('unsupported', 'Specify the opening duration in the second branch.', token.range);
      if (value) {
        if (!/^(?:1|2|4|8|16|32|64|128|256)$/.test(value)) input.fail('unsupported', 'Unsupported undotted duration.', token.range);
        denominator = Number(value);
      }
      const kind = match[1] === 's' ? 'skip' : match[1] === 'r' ? 'rest' : 'attack';
      if (kind !== 'attack' && match[2]) input.fail('syntax', 'A silent event has no octave.', token.range);
      const p = kind === 'attack' ? writtenPitch(match[1], match[2], input, token.range) : undefined;
      const duration = new Time(1, denominator);
      bar.add(voice, { kind, at, elapsed: duration, denominator, staff: 1, pitch: p, range: [token.range[0], end] }, input);
      if (peek().value === '-.') input.omitMark(words[i++].range);
      at = at.plus(duration);
      attacks++;
    }
    if (!attacks) input.fail('unsupported', 'Expected a nonempty voice.', peek().range);
    take('}');
    delete input.context.voice;
  }

  if (peek().value === '<<') {
    i++; take('{'); sequence('upper', false);
    take('\\\\'); take('{'); sequence('lower', true);
    take('>>'); take('}');
  } else sequence('upper', false);
  if (peek().value) input.fail('unsupported', 'Expected just one staff expression.', peek().range);
  return [bar, [0, source.length]];
}

/** Convert one static single-staff expression without running LilyPond or evaluating Scheme. */
export function importLilyPond(source: string, options: ImportOptions = {}): ImportResult {
  return convert(options, 'score.ly', input => readStaff(source, input));
}
