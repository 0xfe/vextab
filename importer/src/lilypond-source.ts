// Index static LilyPond definitions and score blocks before resolving the selected music.
import { Input, sourceLimit } from './score.js';
import type { LilyPondOptions } from './lilypond.js';
import type { TextRange } from './types.js';

/** A group is one token with its original spelling of the opening delimiter. */
export interface Token {
  value: string;
  file: string;
  range: TextRange;
  children?: Token[];
}

/** A snapshot captures source-order bindings without copying the entire symbol table on each use. */
export interface Scope { previous?: Scope; name?: string; value?: Expression; language: string }
export interface Expression { words: Token[]; scope: Scope }
interface Movement extends Expression { print: boolean; midi: boolean; midiSettings?: Token }

/** Tokenize once per virtual file. Strings and comments protect their internal delimiters. */
function tokenize(source: string, input: Input): Token[] {
  const words = /\s+|%\{[\s\S]*?%\}|%(?!\{)[^\r\n]*|"(?:\\.|[^"\\])*"|\\\\|\\[A-Za-z][A-Za-z-]*|\\.|<<|>>|-\.|[A-Za-z]+[',]*|\d+\/\d+|\d+|./guy;
  const groups: Token[][] = [[]], openings: Token[] = [];
  const close: Record<string, string> = { '{': '}', '<<': '>>', '<': '>' };
  let count = 0;
  for (const match of source.matchAll(words)) {
    const value = match[0], range: TextRange = [match.index, match.index + value.length];
    if (/^\s/u.test(value)) continue;
    if (value.startsWith('%')) {
      if (value === '%' && source.startsWith('%{', match.index)) input.fail('syntax', 'Unterminated block comment.', range);
      continue;
    }
    if (value === '"') input.fail('syntax', 'Unterminated quoted text.', range);
    if (++count > 65536 || groups.length > 64) input.fail('limit', 'LilyPond token or nesting limit exceeded.', range);
    if (value === '}' || value === '>' || value === '>>') {
      const opener = openings.pop();
      if (!opener || close[opener.value] !== value) input.fail('syntax', 'Unexpected closing delimiter.', range);
      opener.range = [opener.range[0], range[1]];
      groups.pop();
    } else {
      const token: Token = { value, file: input.file, range };
      groups.at(-1)!.push(token);
      if (Object.hasOwn(close, value)) {
        openings.push(token);
        groups.push(token.children = []);
      }
    }
  }
  if (openings.length) input.fail('syntax', 'Unclosed LilyPond group.', openings.at(-1)!.range);
  return groups[0];
}

/** Match one complete music expression without resolving variable contents. */
export function expressionEnd(words: Token[], start: number, input: Input): number {
  let i = start, depth = 0;
  while (i < words.length && ++depth <= 64) {
    const t = words[i++];
    switch (t.value) {
      case '\\new': case '\\context':
        i++;
        if (words[i]?.value === '=') i += 2;
        break;
      case '\\relative':
        if (words[i] && !words[i].children && !words[i].value.startsWith('\\')) i++;
        break;
      case '\\fixed': case '\\tuplet': case '\\times': i++; break;
      case '\\repeat': i += 2; break;
      case '\\applyMusic': i += 4; break;
      case '\\unfoldRepeats': case '\\absolute': case '\\grace': break;
      default:
        // A single note or chord definition may include its duration outside the token.
        if ((t.value === '<' || /^[a-z]/.test(t.value)) && /^\d+$/.test(words[i]?.value ?? '')) {
          i++;
          while (words[i]?.value === '.') i++;
        }
        if (words[i]?.value === '\\alternative' && words[i + 1]?.value === '{') i += 2;
        return i;
    }
  }
  return input.fail('syntax', 'Expected a bounded music expression.', words[start]?.range ?? [0, 0]);
}

/** Includes are explicit, relative virtual file names. Nothing is opened from the host. */
function includePath(parent: string, request: string, input: Input, range: TextRange) {
  if (!request || /^(\/|[A-Za-z]:)|\\|(?:^|\/)\.\.(?:\/|$)/.test(request))
    input.fail('unsupported', 'Expected a relative virtual include name.', range);
  return [...parent.split('/').slice(0, -1), ...request.split('/')].filter(p => p && p !== '.').join('/');
}

/** Collect only score-level output selectors; layout, paper and header material are outside music time. */
export function selectScore(source: string, options: LilyPondOptions, input: Input): Expression {
  const movements: Movement[] = [];
  let scope: Scope = { language: 'nederlands' }, chars = 0, declarations = 0;
  const active: string[] = [];
  function scanFile(file: string, content: string) {
    input.file = file;
    chars += content.length;
    if (chars > sourceLimit || active.length >= 24) input.fail('limit', 'LilyPond include budget exceeded.', [0, 0]);
    if (active.includes(file)) input.fail('unsupported', 'Cyclic virtual include.', [0, 0]);
    active.push(file);
    scan(tokenize(content, input));
    active.pop();
    input.file = active.at(-1) ?? file;
  }
  function scan(words: Token[]) {
    for (let i = 0; i < words.length;) {
      const token = words[i++], name = token.value, arg = words[i];
      const value = arg?.value ?? '';
      switch (name) {
        case '\\version':
          if (!/^"2\.(24|26)\.\d+"$/.test(value) && !['"2.14.2"', '"2.17.11"', '"2.16.0"', '"2.23.0"'].includes(value))
            input.fail('unsupported', 'Unqualified LilyPond source version.', token.range);
          i++; break;
        case '\\language':
          if (!/^"(english|nederlands|deutsch)"$/.test(value)) input.fail('unsupported', 'Unsupported note language.', token.range);
          scope = { previous: scope, language: value.slice(1, -1) };
          i++; break;
        case '\\include': {
          if (!/^"[^"\\]+"$/.test(value)) input.fail('syntax', 'Expected a quoted virtual filename.', token.range);
          const file = includePath(token.file, value.slice(1, -1), input, arg.range);
          if (!options.includes || !Object.hasOwn(options.includes, file))
            input.fail('unsupported', 'Missing virtual include ' + file + '.', arg.range);
          scanFile(file, options.includes![file]);
          i++; break;
        }
        case '\\header': case '\\paper': case '\\layout':
          if (value !== '{') input.fail('syntax', 'Expected a settings block.', token.range);
          i++; break;
        case '\\book': case '\\bookpart': {
          if (value !== '{') input.fail('syntax', 'Expected a book block.', token.range);
          const outer = scope;
          scan(arg.children!);
          scope = outer;
          i++; break;
        }
        case '\\score': {
          if (value !== '{') input.fail('syntax', 'Expected a score block.', token.range);
          const music: Token[] = [], body = arg.children!;
          let print = false, midi = false, midiSettings: Token | undefined;
          for (let j = 0; j < body.length; j++) {
            const item = body[j];
            if (['\\layout', '\\midi', '\\header'].includes(item.value)) {
              if (body[++j]?.value !== '{') input.fail('syntax', 'Expected score output settings.', item.range);
              print ||= item.value === '\\layout';
              midi ||= item.value === '\\midi';
              if (item.value === '\\midi' && body[j].children?.length) midiSettings = body[j];
            } else music.push(item);
          }
          movements.push({ words: music, scope, print: print || !midi, midi, midiSettings });
          i++; break;
        }
        default:
          if (/^[A-Za-z]+$/.test(name) && value === '=') {
            if (++declarations > 1024) input.fail('limit', 'Too many music definitions.', token.range);
            const end = expressionEnd(words, ++i, input);
            scope = { previous: scope, language: scope.language, name, value: { words: words.slice(i, end), scope } };
            i = end;
          } else {
            const commands = ['\\new', '\\context', '\\relative', '\\fixed', '\\absolute', '\\unfoldRepeats', '\\repeat', '\\tuplet'];
            if (!token.children && !commands.includes(name)) {
              let binding: Scope | undefined = scope;
              while (binding && ('\\' + binding.name) !== name) binding = binding.previous;
              if (!binding) input.fail('unsupported', 'Unknown top-level music expression ' + name + '.', token.range);
            }
            const end = expressionEnd(words, i - 1, input);
            movements.push({ words: words.slice(i - 1, end), scope, print: true, midi: false });
            i = end;
          }
      }
    }
  }
  scanFile(input.file, source);
  const selected = options.score ?? 'print';
  const movement = typeof selected === 'number' ? movements[selected] : movements.find(m => m[selected]);
  if (!movement) return input.fail('unsupported', 'No matching LilyPond score.', [0, source.length]);
  if (movement.midiSettings && (selected === 'midi' || !movement.print)) {
    input.file = movement.midiSettings.file;
    input.omit('MIDI output settings are outside the written-score profile.', movement.midiSettings.range);
  }
  return movement;
}
