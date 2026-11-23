// Resolve static LilyPond music into measured voices without executing user code.
import { convert, Input, keys, Measure, meter, minorKeys, pitch } from './score.js';
import type { Event, Pitch } from './score.js';
import { selectScore } from './lilypond-source.js';
import type { Expression, Scope, Token } from './lilypond-source.js';
import { Time, zero } from './time.js';
import type { ImportOptions, ImportResult, TextRange } from './types.js';
export type { ImportedDocument, ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';
/** Selection is zero-based among all scores. Strings select the first matching output. */
export interface LilyPondOptions extends ImportOptions {
  includes?: Readonly<Record<string, string>>;
  score?: number | 'print' | 'midi';
}

/** All duration fields are lexical. Variables carry their own duration defaults. */
interface Rhythm { denominator: number; dots: number }
interface State {
  part: string; voice: string; piano?: { id: string; hands: string[] }; display?: number; index: number; at: Time;
  mode: 'absolute' | 'relative' | 'fixed'; anchor: Pitch; fixed: number;
  rhythm: Rhythm; last: Pitch[]; tuplets: NonNullable<Event['tuplets']>;
  pendingGrace: Pitch[][]; collectGrace?: Pitch[][]; tie?: Pitch[]; uses: NonNullable<Event['uses']>;
}
const quarter = { denominator: 4, dots: 0 };
const letters = 'CDEFGAB';

/** Read a pitch name in the declared language, independently of the key signature. */
function readPitch(t: Token, state: State, language: string, input: Input): Pitch {
  let value = t.value;
  if (language === 'deutsch') {
    value = value.replace(/^b(?=[',]|$)/, 'bes').replace(/^h/, 'b');
  }
  if (language !== 'english') value = value.replace(/^as(?=[',]|$)/, 'aes').replace(/^es(?=[',]|$)/, 'ees');
  const match = /^([a-g])([a-z]*)(,*|'*)$/.exec(value);
  const signs: Record<string, number> = language === 'english' ? { '': 0, f: -1, ff: -2, s: 1, ss: 2 } :
    { '': 0, es: -1, eses: -2, is: 1, isis: 2 };
  if (!match || !Object.hasOwn(signs, match[2])) return input.fail('unsupported', 'Unknown ' + language + ' pitch ' + t.value + '.', t.range);
  const step = match[1].toUpperCase(), marks = match[3];
  let octave = state.mode === 'fixed' ? state.fixed : 3;
  if (state.mode === 'relative') {
    const delta = letters.indexOf(step) - letters.indexOf(state.anchor.step);
    octave = state.anchor.octave + (delta > 3 ? -1 : delta < -3 ? 1 : 0);
  }
  octave += marks.startsWith(',') ? -marks.length : marks.length;
  if (octave < 0 || octave > 9) return input.fail('unsupported', 'Pitch outside target octave range.', t.range);
  return pitch(step, signs[match[2]], octave);
}

/** Consume a duration, retaining the previous number and dots when both are omitted. */
function readRhythm(words: Token[], start: number, previous: Rhythm, input: Input): [Rhythm, number] {
  let i = start;
  if (!/^\d+$/.test(words[i]?.value ?? '')) return [previous, i];
  const token = words[i++];
  if (!/^(1|2|4|8|16|32|64|128|256)$/.test(token.value)) input.fail('unsupported', 'Unsupported written duration.', token.range);
  let dots = 0;
  while (words[i]?.value === '.') { dots++; i++; }
  if (dots > 2) input.fail('unsupported', 'At most two augmentation dots are supported.', token.range);
  return [{ denominator: Number(token.value), dots }, i];
}

/** Convert the written length and all enclosing tuplets to one exact elapsed fraction. */
function length(rhythm: Rhythm, tuplets: State['tuplets'] = []) {
  const factor = 2 ** rhythm.dots;
  let n = BigInt(factor * 2 - 1), d = BigInt(factor * rhythm.denominator);
  for (const t of tuplets) { n *= BigInt(t.normal); d *= BigInt(t.actual); }
  return new Time(n, d);
}

/** Resolve only the chosen movement, retaining distinct clocks for simultaneous music. */
class Resolver {
  private readonly parts = new Map<string, Measure[]>();
  private work = 0;
  private serial = 0;
  constructor(private readonly input: Input) {}

  /** Assign opening attributes from the preceding bar when first visiting a written measure. */
  private measure(s: State): Measure {
    if (s.index >= 4096) this.input.fail('limit', 'Exceeded 4,096 written bars.', [0, 0]);
    let bars = this.parts.get(s.part);
    if (!bars) this.parts.set(s.part, bars = []);
    if (!bars[s.index]) {
      const previous = bars[s.index - 1], bar = new Measure();
      if (previous) {
        bar.beats = previous.beats; bar.beatType = previous.beatType;
        bar.key = previous.key; bar.clef = previous.clef;
      }
      bar.part = s.piano?.id ?? s.part;
      if (s.piano) {
        bar.piano = true;
        bar.staff = s.piano.hands.indexOf(s.part) + 1;
        if (!previous && bar.staff === 2) bar.clef = 'bass';
      }
      bar.label = String(s.index + 1);
      bars[s.index] = bar;
    }
    return bars[s.index];
  }

  /** Every indexed bar comes from an actual event or timing directive. Reject dangling attachments. */
  resolve(expr: Expression) {
    const state: State = { part: 'staff', voice: 'upper', index: 0, at: zero,
      mode: 'absolute', anchor: pitch('F', 0, 3), fixed: 3, rhythm: quarter,
      last: [], tuplets: [], pendingGrace: [], uses: [] };
    this.sequence(expr.words, state, expr.scope, 0);
    if (state.pendingGrace.length || state.tie) this.input.fail('timing', 'Missing attachment target.', expr.words.at(-1)!.range);
    return [...this.parts.values()].flat();
  }

  /** Report the offending token in the original definition or virtual file. */
  private sequence(words: Token[], s: State, scope: Scope, depth: number) {
    for (let i = 0; i < words.length;) i = this.one(words, i, s, scope, depth);
  }

  /** Expressions consume their exact operands so neighboring simultaneous branches remain independent. */
  private one(words: Token[], index: number, s: State, scope: Scope, depth: number): number {
    let i = index;
    const t = words[i++], command = t.value, input = this.input;
    input.file = t.file;
    input.context = { part: s.part, measure: String(s.index + 1), voice: s.voice };
    if (depth > 64 || ++this.work > 65536) input.fail('limit', 'LilyPond expansion budget exceeded.', t.range);
    const next = () => words[i++] ?? input.fail('syntax', 'Missing argument to ' + command + '.', t.range);
    const child = () => {
      if (!words[i]) input.fail('syntax', 'Expected music after ' + command + '.', t.range);
      i = this.one(words, i, s, scope, depth + 1);
    };
    const boundary = () => {
      if (s.at.compare(zero)) input.fail('timing', 'Expected a measure boundary.', t.range);
    };
    switch (command) {
      case '{': this.sequence(t.children!, s, scope, depth + 1); break;
      case '<<': this.simultaneous(t, s, scope, depth); break;
      case '\\new': case '\\context': {
        const context = next().value;
        if (!['Staff', 'PianoStaff', 'StaffGroup', 'Voice'].includes(context))
          input.fail('unsupported', 'Unsupported context ' + context + '.', t.range);
        const oldPart = s.part, oldVoice = s.voice, oldPiano = s.piano, oldDisplay = s.display;
        let id: string | undefined;
        if (words[i]?.value === '=') {
          i++; const label = next();
          if (!/^"[^"\\]+"$|^[A-Za-z]+$/.test(label.value)) input.fail('syntax', 'Expected a literal context ID.', label.range);
          id = label.value.replace(/^"|"$/g, '');
        }
        if (context === 'PianoStaff') {
          const group = words[i];
          if (group?.value !== '<<') input.fail('unsupported', 'Expected two simultaneous piano staves.', t.range);
          const branches = group.children!, hands: string[] = [];
          for (const [j, branch] of branches.entries()) {
            if (!['\\context', '\\new'].includes(branch.value) || branches[j + 1]?.value !== 'Staff') continue;
            if (branches[j + 2]?.value !== '=') input.fail('unsupported', 'Expected a named piano staff.', branch.range);
            hands.push(branches[j + 3]?.value.replace(/^"|"$/g, ''));
          }
          if (hands.length !== 2 || hands[0] === hands[1]) input.fail('unsupported', 'Expected two distinct piano hands.', t.range);
          s.piano = { id: id ?? 'piano' + ++this.serial, hands };
        }
        if (context === 'StaffGroup') input.omit('Staff-group bracket omitted.', t.range);
        if (context === 'Staff') s.part = id ?? (s.part === 'staff' && !this.parts.has('staff') ? 'staff' : 'staff' + ++this.serial);
        if (context === 'Voice' && id) s.voice = id;
        child();
        s.part = oldPart; s.voice = oldVoice; s.piano = oldPiano; s.display = oldDisplay;
        break;
      }
      case '\\change': {
        if (next().value !== 'Staff' || next().value !== '=') input.fail('unsupported', 'Expected a staff change.', t.range);
        const name = next().value.replace(/^"|"$/g, '');
        if (!s.piano || !s.piano.hands.includes(name)) input.fail('unsupported', 'Unknown display staff ' + name + '.', t.range);
        s.display = s.piano!.hands.indexOf(name) + 1;
        break;
      }
      case '\\relative': case '\\absolute': case '\\fixed': {
        const old = { mode: s.mode, fixed: s.fixed, anchor: s.anchor };
        s.mode = 'absolute';
        let reference = pitch('F', 0, 3);
        if (command === '\\fixed' || (command === '\\relative' && /^[a-z]/.test(words[i]?.value ?? '')))
          reference = readPitch(next(), s, scope.language, input);
        s.mode = command === '\\relative' ? 'relative' : command === '\\fixed' ? 'fixed' : 'absolute';
        s.anchor = reference; s.fixed = reference.octave;
        child();
        Object.assign(s, old);
        break;
      }
      case '\\time': {
        boundary();
        const ratio = next(), [a, b] = ratio.value.split('/');
        meter(a, b, this.measure(s), input, ratio.range);
        break;
      }
      case '\\key': {
        boundary();
        const p = readPitch(next(), { ...s, mode: 'absolute' }, scope.language, input);
        const tonic = p.step + ['bb', 'b', '', '#', '##'][p.alter + 2];
        const mode = next().value;
        if (mode === '\\major' && keys.includes(tonic)) this.measure(s).key = tonic;
        else if (mode === '\\minor' && minorKeys.includes(tonic + 'm')) this.measure(s).key = tonic + 'm';
        else input.fail('unsupported', 'Unqualified key signature.', t.range);
        break;
      }
      case '\\clef': {
        boundary();
        const clef = next().value.replace(/^"|"$/g, '');
        if (!['treble', 'bass', 'alto', 'tenor'].includes(clef)) input.fail('unsupported', 'Unsupported clef.', t.range);
        this.measure(s).clef = clef;
        break;
      }
      case '\\partial': {
        boundary();
        if (s.index || !/^\d+$/.test(words[i]?.value ?? '')) input.fail('timing', 'Expected an opening pickup duration.', t.range);
        const [duration, end] = readRhythm(words, i, quarter, input);
        this.measure(s).pickup = length(duration); i = end;
        break;
      }
      case '|': boundary(); break;
      case '\\tuplet': case '\\times': {
        const ratio = next(), match = /^([1-9]\d?)\/([1-9]\d?)$/.exec(ratio.value);
        if (!match || +match[1] > 16 || +match[2] > 16 || s.tuplets.length >= 8)
          return input.fail('unsupported', 'Unsupported tuplet ratio or nesting.', ratio.range);
        const reverse = command === '\\times';
        s.tuplets = [...s.tuplets, { actual: +match[reverse ? 2 : 1], normal: +match[reverse ? 1 : 2], id: 't' + ++this.serial }];
        child();
        s.tuplets = s.tuplets.slice(0, -1);
        break;
      }
      case '\\grace': {
        if (s.collectGrace || s.pendingGrace.length) input.fail('unsupported', 'Nested grace groups.', t.range);
        s.collectGrace = s.pendingGrace;
        child();
        delete s.collectGrace;
        break;
      }
      case '\\unfoldRepeats': case '\\applyMusic': {
        if (command === '\\applyMusic') {
          // Mutopia's 2.14 edition spells this one built-in as a Scheme identifier.
          for (const literal of ['#', 'unfold', '-', 'repeats']) {
            if (words[i]?.value !== literal) input.fail('unsupported', 'Unknown music transformation.', t.range);
            i++;
          }
        }
        boundary();
        const start = s.index;
        child();
        boundary();
        this.unfoldBars(s, start, t);
        break;
      }
      case '\\repeat': return this.repeat(words, i, s, scope, depth, t);
      default: {
        if (command.startsWith('\\')) {
          let binding: Scope | undefined = scope;
          while (binding && binding.name !== command.slice(1)) binding = binding.previous;
          if (!binding?.value) return input.fail('unsupported', 'Cannot resolve music command ' + command + '.', t.range);
          const rhythm = s.rhythm;
          s.uses.push({ file: t.file, range: t.range });
          s.rhythm = quarter;
          this.sequence(binding.value.words, s, binding.value.scope, depth + 1);
          s.uses.pop(); s.rhythm = rhythm;
        } else return this.note(words, index, s, scope.language);
      }
    }
    return i;
  }

  /** Time branches from one origin. LilyPond resolves relative pitch and inherited duration in source order. */
  private simultaneous(token: Token, s: State, scope: Scope, depth: number) {
    const words = token.children!;
    let longest: State = { ...s }, branch = 0;
    for (let i = 0; i < words.length;) {
      if (words[i].value === '\\\\') this.input.fail('syntax', 'Missing simultaneous branch.', words[i].range);
      const v: State = { ...s, voice: branch === 0 ? s.voice : branch === 1 ? 'lower' : 'voice' + (branch + 1),
        pendingGrace: [], tie: undefined };
      i = this.one(words, i, v, scope, depth + 1);
      if (v.tie || v.pendingGrace.length) this.input.fail('unsupported', 'Dangling branch attachment.', token.range);
      s.rhythm = v.rhythm; s.anchor = v.anchor; s.last = v.last;
      if (v.index > longest.index || (v.index === longest.index && v.at.compare(longest.at) > 0)) longest = v;
      if (words[i]?.value === '\\\\') {
        if (++i === words.length) this.input.fail('syntax', 'Missing simultaneous branch.', token.range);
      }
      branch++;
    }
    s.index = longest.index; s.at = longest.at;
  }

  /** Expand already-resolved written bars, preserving relative pitch and pass-specific endings. */
  private unfoldBars(s: State, start: number, token: Token) {
    const bars = this.parts.get(s.part);
    if (!bars || bars.length !== s.index || start >= s.index)
      this.input.fail('unsupported', 'Unfolding requires complete bars in one staff.', token.range);
    const out: Measure[] = [];
    const append = (bar: Measure) => {
      this.work += [...bar.voices.values()].reduce((n, events) => n + events.length, 0);
      if (out.length >= 4096 || this.work > 65536) this.input.fail('limit', 'Unfolded music exceeds budget.', token.range);
      const copy = Object.assign(new Measure(), bar, { label: String(start + out.length + 1) });
      copy.voices = new Map([...bar.voices].map(([voice, events]) => [voice, [...events]]));
      delete copy.repeatStart; delete copy.repeatEnd; delete copy.ending; delete copy.endingEnd;
      out.push(copy);
    };
    let i = start;
    while (i < bars.length) {
      const count = bars[i].repeatStart;
      if (!count) { append(bars[i++]); continue; }
      const body = i;
      while (i < bars.length && !bars[i].repeatEnd) i++;
      if (i === bars.length) this.input.fail('unsupported', 'Unclosed written repeat.', token.range);
      const end = ++i, choices: Measure[][] = [];
      while (bars[i]?.ending) {
        const from = i;
        while (i < bars.length && !bars[i].endingEnd) i++;
        if (i === bars.length) this.input.fail('unsupported', 'Unclosed written ending.', token.range);
        choices.push(bars.slice(from, ++i));
      }
      for (let pass = 0; pass < count; pass++) {
        for (let j = body; j < end; j++) append(bars[j]);
        for (const bar of choices[pass] ?? []) append(bar);
      }
    }
    bars.splice(start, bars.length - start, ...out);
    s.index = bars.length;
  }

  /** Represent written volta bars once. Unfold repeats replay the resolved music with bounded work. */
  private repeat(words: Token[], i: number, s: State, scope: Scope, depth: number, t: Token): number {
    const style = words[i++]?.value, n = words[i++]?.value, input = this.input;
    if (!n || !/^(?:[1-9]|[12]\d|3[0-2])$/.test(n) || !['volta', 'unfold'].includes(style))
      return input.fail('unsupported', 'Expected a literal bounded volta or unfold repeat.', t.range);
    const first = i, start = s.index, relative = s.anchor, rhythm = s.rhythm;
    if (!words[first]) return input.fail('syntax', 'Missing repeat body.', t.range);
    if (style === 'unfold') {
      for (let pass = 0; pass < +n; pass++) {
        s.anchor = relative; s.rhythm = rhythm;
        i = this.one(words, first, s, scope, depth + 1);
      }
      return i;
    }
    if (s.at.compare(zero)) input.fail('unsupported', 'Volta must start on a written boundary.', t.range);
    this.measure(s).repeatStart = +n;
    const contents = words[first].children;
    let choices: Token | undefined;
    if (contents && contents.at(-2)?.value === '\\alternative') {
      choices = contents.at(-1);
      this.sequence(contents.slice(0, -2), s, scope, depth + 1);
      i = first + 1;
    } else i = this.one(words, first, s, scope, depth + 1);
    if (s.index === start || s.at.compare(zero)) input.fail('unsupported', 'Volta must end on a written boundary.', t.range);
    this.parts.get(s.part)![s.index - 1].repeatEnd = true;
    if (words[i]?.value === '\\alternative') {
      if (choices) input.fail('unsupported', 'Duplicate alternative blocks.', t.range);
      choices = words[++i]; i++;
    }
    if (choices) {
      if (choices.value !== '{') input.fail('syntax', 'Expected a group of alternatives.', choices.range);
      const items = choices.children!, endings: Token[] = [];
      for (let k = 0; k < items.length;) {
        if (items[k].value === '\\volta') {
          k++;
          if (items[k++]?.value !== String(endings.length + 1)) input.fail('unsupported', 'Expected consecutive pass numbers.', choices.range);
        }
        const item = items[k++];
        if (item?.value !== '{') input.fail('unsupported', 'Expected a sequential alternative.', choices.range);
        endings.push(item);
      }
      if (endings.length !== +n) input.fail('unsupported', 'Expected one ending per pass.', choices.range);
      for (const [j, ending] of endings.entries()) {
        const before = s.index;
        this.measure(s).ending = j + 1;
        this.sequence(ending.children!, s, scope, depth + 1);
        if (s.index === before || s.at.compare(zero)) input.fail('unsupported', 'Ending must fill written bars.', ending.range);
        this.parts.get(s.part)![s.index - 1].endingEnd = true;
      }
    }
    return i;
  }

  /** Resolve chord heads in order, then restore the first head as the next relative reference. */
  private note(words: Token[], i: number, s: State, language: string) {
    const t = words[i], input = this.input;
    let heads: Pitch[] = [], kind: Event['kind'] = 'attack';
    if (/^\d+$/.test(t.value) || t.value === 'q') {
      if (!s.last.length) input.fail('unsupported', 'Repeated pitch has no preceding attack.', t.range);
      heads = s.last;
      if (t.value === 'q') i++;
    } else {
      i++;
      if (t.value === 'r' || t.value === 'R') kind = 'rest';
      else if (t.value === 's') kind = 'skip';
      else {
        const notes = t.value === '<' ? t.children! : [t];
        if (!notes.length || notes.length > 16) input.fail('limit', 'Invalid number of chord heads.', t.range);
        for (const item of notes) {
          const p = readPitch(item, s, language, input);
          heads.push(p); s.anchor = p;
        }
        s.anchor = heads[0];
      }
    }
    const [rhythm, end] = readRhythm(words, i, s.rhythm, input);
    s.rhythm = rhythm; i = end;
    const range: TextRange = [t.range[0], words[i - 1].range[1]];
    if (s.collectGrace) {
      if (!heads.length || s.collectGrace.length >= 16) input.fail('unsupported', 'Unsupported grace event.', range);
      // The target grace spelling carries ordered heads but does not retain a written duration.
      if (rhythm.denominator !== 8 || rhythm.dots) input.omit('Grace duration is normalized to an eighth.', range);
      s.collectGrace.push(heads);
      s.last = heads;
      return i;
    }
    const bar = this.measure(s), elapsed = length(rhythm, s.tuplets);
    const endTime = s.at.plus(elapsed), barLength = bar.pickup ?? new Time(bar.beats, bar.beatType);
    if (endTime.compare(barLength) > 0) return input.fail('timing', 'Event crosses a bar without a written tie.', range);
    if (t.value === 'R' && (s.at.compare(zero) || elapsed.compare(barLength)))
      input.fail('unsupported', 'A full-measure rest must occupy a complete bar.', range);
    const event: Event = { kind, at: s.at, elapsed, ...rhythm, staff: s.display ?? bar.staff, pitch: heads[0], pitches: heads,
      range, file: t.file, uses: [...s.uses], tuplets: s.tuplets };
    if (s.pendingGrace.length) {
      if (!heads.length) input.fail('unsupported', 'Expected a pitched grace anchor.', range);
      event.grace = s.pendingGrace; s.pendingGrace = [];
    }
    if (s.tie) {
      if (heads.length !== s.tie.length || s.tie.some((p, j) => p.step !== heads[j].step ||
        p.alter !== heads[j].alter || p.octave !== heads[j].octave)) input.fail('unsupported', 'Only matching whole-event ties are qualified.', range);
      event.tieStop = true; delete s.tie;
    }
    if (words[i]?.value === '~') {
      if (!heads.length) input.fail('syntax', 'Cannot tie a silent event.', range);
      s.tie = heads; event.tieStart = true; i++;
    }
    if (words[i]?.value === '-.') input.omitMark(words[i++].range);
    if (/^\\(?:p{1,4}|f{1,4}|mp|mf)$/.test(words[i]?.value ?? '')) {
      const mark = words[i++];
      input.omit('Dynamic ' + mark.value + ' omitted.', mark.range);
    }
    bar.add(s.voice, event, input);
    s.last = heads;
    if (endTime.compare(barLength) === 0) { s.index++; s.at = zero; } else s.at = endTime;
    return i;
  }
}

/** Convert a selected static movement. Embedded Scheme and external file access are never executed. */
export function importLilyPond(source: string, options: LilyPondOptions = {}): ImportResult {
  return convert(options, 'score.ly', input => {
    const file = input.file;
    const bars = new Resolver(input).resolve(selectScore(source, options, input));
    input.file = file;
    return [bars, [0, source.length]];
  });
}
