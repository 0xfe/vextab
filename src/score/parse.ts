// Select the requested score language and validate it without creating rendering objects.
import { compile as compileGrammar2 } from './grammar2/compiler.mts';
import type { ScoreCapacity } from './grammar2/capacity.mts';
import type { ScoreV2 } from './grammar2/model';
import VexFlow, { Fraction, KeyManager, Music, Tuning } from 'vexflow/core';
import { drumError, drumKit } from './drums';
import { isScoreColor } from './color';
import { readSyntax, ScoreError, type SourceRange } from './source';
import { VoiceCommands, resolveMarks } from './commands';
import { midiPitch, soundingGuitarPitch, spellFret, tupletOccupancy } from './music';
import type { Attack, Head, Measure, MeasureVoice, ParsedScore, PianoHand, StaffState, Tie, ScoreSpan } from './model';

export { ScoreV2Error } from './grammar2/compiler.mts';
export type { ScoreCapacity } from './grammar2/capacity.mts';
export type { ScoreV2 } from './grammar2/model';
export { ScoreError, type SourceRange } from './source';
export type { ParsedScore } from './model';

type Token = { range: SourceRange; [key: string]: any };
type Settings = Record<string, string>;
type Rhythm = { base: string; dots: number; slash: boolean; range?: SourceRange };

/** Fixed engraving accepts additional instructions. Point at the first one a view would lose. */
function fixed(token: Token, feature: string): never {
  throw new ScoreError('fixed-layout', `Use fixed layout for ${feature}`, token.range);
}

function invalid(token: Token, message: string): never {
  throw new ScoreError('syntax', message, token.range);
}

/** Convert a validated musical fraction to its canonical whole-note value. */
function fraction(value: string): Fraction {
  return new Fraction().parse(value).simplify();
}

function span(value: string, token: Token): string {
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(value) || !value.split('/').every(n => Number.isSafeInteger(Number(n)))) {
    invalid(token, `Invalid span '${value}'`);
  }
  return fraction(value).toString();
}

function booleanOption(token: Token): boolean {
  if (!['true', 'false'].includes(token.value)) invalid(token, `Expected true or false for ${token.key}`);
  return token.value === 'true';
}

/** A declaration ends at its last option, before its notes or the next voice. */
function declarationRange(node: Token): SourceRange {
  const options = node.options ?? [];
  const end = options.length ? options[options.length - 1].range.end : node.range.start + node.element.length;
  return { ...node.range, end };
}

/** A stave declaration starts a written row and resets its instrument and signature. */
function staffState(node: Token): StaffState {
  const state: StaffState = { tab: node.element === 'tabstave', notation: node.element !== 'tabstave',
    capo: 0, strings: 6, tuning: 'standard', key: 'C', clef: 'treble', meter: '4/4', showTime: false, fragment: false,
    declaration: declarationRange(node), timeRange: { ...node.range, end: node.range.start + node.element.length } };
  if (node.element === 'piano') state.piano = true;
  let visible = true;
  let timeGiven = false;
  for (const opt of node.options ?? []) {
    if (state.piano && ['clef', 'tuning', 'capo', 'strings', 'tablature', 'notation'].includes(opt.key)) {
      invalid(opt, 'A piano uses treble and bass notation staves');
    }
    if (state.piano && opt.key === 'hand') continue;
    switch (opt.key) {
      case 'color':
        if (!isScoreColor(opt.value)) invalid(opt, 'Expected a CSS color name or hex value');
        state.color = opt.value;
        break;
      case 'notation': state.notation = booleanOption(opt); break;
      case 'tablature': state.tab = booleanOption(opt); break;
      case 'fragment': state.fragment = booleanOption(opt); break;
      case 'show-time': visible = booleanOption(opt); state.timeRange = opt.range; break;
      case 'time':
        if (['C', 'C|'].includes(opt.value) || /^(?:\(\d+(?:\+\d+)+\)|\d+(?:\+\d+)+)\/\d+$/.test(opt.value)) {
          fixed(opt, `printed time signature '${opt.value}'`);
        }
        span(opt.value, opt);
        state.meter = opt.value;
        timeGiven = true;
        break;
      case 'pickup': state.pickup = span(opt.value, opt); break;
      case 'key':
        if (!VexFlow.hasKeySignature(opt.value)) invalid(opt, 'Invalid key signature');
        try { new KeyManager(opt.value); } catch { fixed(opt, `key signature '${opt.value}'`); }
        state.key = opt.value;
        break;
      case 'tuning':
        try { new Tuning(opt.value); } catch { invalid(opt, 'Invalid tuning'); }
        state.tuning = opt.value;
        break;
      case 'capo':
        state.capo = Number(opt.value);
        if (!/^\d+$/.test(opt.value) || !Number.isSafeInteger(state.capo)) invalid(opt, 'Expected a nonnegative capo fret');
        break;
      case 'strings':
        state.strings = Number(opt.value);
        if (!Number.isInteger(state.strings) || state.strings < 4 || state.strings > 8) invalid(opt, 'Expected 4–8 strings');
        break;
      case 'clef':
        if (opt.value === 'none') fixed(opt, `clef '${opt.value}'`);
        if (!['treble', 'bass', 'tenor', 'alto', 'percussion'].includes(opt.value)) invalid(opt, 'Invalid clef');
        state.clef = opt.value;
        break;
      case 'fingering': case 'accents': break; // Resolved on the heads by readSyntax.
      case 'voice': break; // Applied when the voice is opened.
      default: fixed(opt, `stave option '${opt.key}'`);
    }
  }
  state.showTime = visible && timeGiven;
  if (!state.notation && !state.tab) invalid(node, 'At least one staff must be visible');
  if (state.pickup && !fraction(state.pickup).lessThan(fraction(state.meter))) invalid(node, 'Pickup must be shorter than the meter');
  return state;
}

/** Snapshot options when opening a voice. Later declarations cannot restyle it. */
function startVoice(settings: Settings, direction: string | undefined, declaration: SourceRange): MeasureVoice {
  return { declaration, events: [], tuplets: [], span: '0/1', beams: settings.beams !== 'off',
    stem: direction === 'top' ? 'up' : direction === 'bottom' ? 'down' : undefined,
    tabStems: settings['tab-stems'] === 'true', tabDirection: settings['tab-stem-direction'] === 'down' ? -1 : 1,
    beamRests: settings['beam-rests'] !== 'false', stemlets: settings['beam-stemlets'] !== 'false',
    middleRests: settings['beam-middle-only'] === 'true' };
}

function readSettings(settings: Settings, node: Token): void {
  for (const opt of node.params) {
    switch (opt.key) {
      case 'tempo':
        if (!Number.isFinite(Number(opt.value)) || Number(opt.value) <= 0) invalid(opt, 'Tempo must be positive');
        break;
      case 'transpose': case 'instrument': break;
      case 'player': case 'measure-numbers': case 'tab-stems': case 'beam-rests': case 'beam-stemlets': case 'beam-middle-only': booleanOption(opt); break;
      case 'tab-stem-direction':
        if (!['up','down'].includes(opt.value)) invalid(opt, 'Invalid tab stem direction');
        break;
      case 'beams':
        if (opt.value === 'explicit') fixed(opt, 'explicit beam groups');
        if (!['auto', 'off'].includes(opt.value)) invalid(opt, 'Invalid beam mode');
        break;
      default: fixed(opt, `option '${opt.key}'`);
    }
    settings[opt.key] = opt.value;
  }
}

function readRhythm(node: Token): Rhythm {
  const base = node.time.replace(/s$/, '');
  try { VexFlow.durationToTicks(base); } catch { invalid(node, `Invalid duration '${node.time}'`); }
  return { base, dots: Number(node.dot || 0), slash: node.time.endsWith('s'), range: node.range };
}

/** Resolve pitches and physical positions independently. A named pitch need not have a fret. */
function chordHead(note: Token, state: StaffState, tuning: Tuning, manager: KeyManager, music: Music, slash: boolean): Head {
  if (state.piano && (note.fret !== undefined || !note.abc || !/^[A-G]$/.test(note.abc.key))) {
    invalid(note, 'Write named pitches such as C/4 on a piano stave');
  }
  if (note.decorator) fixed(note, `decorator '${note.decorator}'`);
  if (note.articulation && !['T', '-'].includes(note.articulation)) fixed(note, `technique '${note.articulation}'`);
  const str = Number(note.string);
  let position: Head['position'];
  const attackFret = Number(note.fret) + state.capo + (note.prebend?.semitones ?? 0);
  let sounding: string;
  if (note.fret !== undefined) {
    const fret = Number(note.fret);
    if (str < 1 || str > state.strings || !Number.isSafeInteger(fret)) invalid(note, 'Invalid fret or string');
    try { sounding = soundingGuitarPitch(tuning, attackFret, str); }
    catch { invalid(note, 'String outside the tuning'); }
    position = { str, fret };
  }
  if (note.abc) {
    if (note.abc.key === 'X' && !note.abc.accidental && !note.abc.accidental_type && note.fret === undefined) {
      if (slash && !state.tab) return { range: note.range, written: 'b/4', sounding: null };
      if (str < 1 || str > state.strings) invalid(note, 'Dead strike needs a physical string');
      let written: string;
      try { written = tuning.getNoteForFret(state.capo, str).toLowerCase(); } catch { invalid(note, 'String outside the tuning'); }
      return { range: note.range, written, sounding: null, position: { str, fret: 'X' } };
    }
    if (!/^[A-G]$/.test(note.abc.key)) fixed(note, `notehead '${note.abc.key}'`);
    const sign = note.abc.accidental;
    const pitch = note.abc.key.toLowerCase() + (sign && sign !== 'n' ? sign : '') + '/' + (note.octave ?? str);
    if (!position && state.tab) fixed(note, 'a named pitch without an explicit fret on tab');
    return { range: note.range, written: pitch, sounding: sounding ?? pitch, position,
      inheritSign: !sign && !note.abc.accidental_type, accidental: sign || (note.abc.accidental_type ? 'n' : undefined), cautionary: note.abc.accidental_type === 'c' };
  }
  const [name, octave] = spellFret(tuning, manager, music, String(attackFret), str);
  return { range: note.range, written: name + '/' + octave, sounding, position, ...(note.prebend && { prebend: note.prebend }),
    ...(note.openSlide && { openSlide: note.openSlide }) };
}

/** Keep each drum's identity and source range separate from its display-only staff key. */
function kitHeads(node: Token, state: StaffState, slash: boolean): Head[] {
  const ids: string[] = node.drums.map(hit => hit.id);
  const error = drumError(state.clef, state.tab, ids, slash);
  if (error) invalid(node, error);
  const { keys } = drumKit.note(ids, 'q');
  return ids.map((drum, i) => ({ drum, range: node.drums[i].range, written: keys[i], sounding: null }));
}

/** Match each tied head once. Reordering the destination chord preserves string identity. */
function connect(previous: Attack | undefined, next: Attack, indexes: number[], ties: Tie[], token: Token) {
  const used = new Set<number>();
  for (const toHead of indexes) {
    const head = next.heads[toHead];
    if (head.sounding === null) invalid(token, 'Only a pitched head can be tied');
    const fromHead = previous?.heads.findIndex((prior, i) =>
      !used.has(i) && prior.position?.str === head.position?.str && prior.position?.fret === head.position?.fret &&
      (prior.written === head.written || ((head.inheritSign || prior.inheritSign) && staffPitch(prior) === staffPitch(head)))) ?? -1;
    if (fromHead < 0) invalid(token, 'Tie needs the same pitch and string on the previous attack');
    used.add(fromHead);
    ties.push({ id: next.id + '-tie-' + toHead, from: previous.id, to: next.id, fromHead, toHead, range: token.range });
  }
}

/** Apply the ratio to the captured attacks before computing the bar's onsets. */
function applyTuplet(bar: MeasureVoice, node: Token, meter: string): void {
  const numNotes = Number(node.params.tuplet);
  const count = Number(node.params.notes ?? numNotes);
  const start = bar.events.length - count;
  if (!Number.isSafeInteger(numNotes) || numNotes < 1 || !Number.isSafeInteger(count) || count < 1 || start < 0) {
    invalid(node, 'Tuplet must fit in this bar and voice');
  }
  const notesOccupied = tupletOccupancy(numNotes, meter);
  for (const event of bar.events.slice(start)) {
    event.duration = fraction(event.duration).multiply(notesOccupied, numNotes).simplify().toString();
  }
  bar.tuplets.push({ start, count, numNotes, notesOccupied, range: node.range });
}

/** A voice owns its bar cursor. A trailing boundary closes the bar without creating an empty one. */
function compileVoice(voiceNode: Token, state: StaffState, settings: Settings, direction: string, ties: Tie[],
  cursor: { rhythm: Rhythm }, spans: ScoreSpan[], reference?: MeasureVoice[]): MeasureVoice[] {
  const tuning = new Tuning(state.tuning), manager = new KeyManager(state.key), music = new Music();
  const bars: MeasureVoice[] = [];
  const declaration = declarationRange(voiceNode);
  let bar = startVoice(settings, direction, declaration);
  const commands = new VoiceCommands(state, spans, !reference);
  if (reference?.[0].keyChange) manager.setKey(reference[0].keyChange);
  let previous: Attack;
  for (const node of voiceNode.notes) {
    if (node.time) cursor.rhythm = readRhythm(node);
    if (node.command === 'command') {
      commands.apply(node as { params: string; range: SourceRange }, bar);
      if (bar.keyChange && !bar.events.length) manager.setKey(bar.keyChange);
      continue;
    }
    if (node.command === 'bar') {
      const boundary = { type: node.type, range: node.range };
      if (!bar.events.length && bars.length && !bar.opening) fixed(node, 'consecutive barlines');
      if (!bar.events.length && !bars.length && !['single', 'repeat-begin'].includes(node.type)) fixed(node, 'this opening barline');
      if (bar.events.length) {
        bar.closing = boundary;
        bars.push(bar);
        bar = startVoice(settings, direction, declaration);
        if (reference?.[bars.length]?.keyChange) manager.setKey(reference[bars.length].keyChange);
      } else if (bar.opening) fixed(node, 'consecutive empty barlines');
      if (!bars.length || ['repeat-begin', 'repeat-both'].includes(node.type)) bar.opening = boundary;
      continue;
    }
    if (node.command === 'tuplet') {
      applyTuplet(bar, node, state.meter);
      continue;
    }
    if (['open_beam', 'close_beam'].includes(node.command)) continue; // Legacy auto/off brackets.
    if (node.command && node.command !== 'rest') fixed(node, node.command);
    if (node.command === 'rest' && (node.params.explicit || Number(node.params.position))) fixed(node, 'positioned rest');
    if (node.decorator || (node.articulation && !['T', '-'].includes(node.articulation))) {
      fixed(node, `technique '${node.decorator || node.articulation}'`);
    }
    if (!node.command && !node.chord && !node.drums && !node.abc && node.fret === undefined) continue;
    const members: Token[] = node.command === 'rest' ? [] : node.chord ?? [node];
    if (node.chord && members.some(n => n.time)) fixed(node, 'duration changes inside a chord');
    const heads = node.drums ? kitHeads(node, state, cursor.rhythm.slash)
      : members.map(n => {
        const head = chordHead(n, state, tuning, manager, music, cursor.rhythm.slash);
        if (n.marks) head.marks = n.marks;
        return head;
      });
    const strings = heads.flatMap(h => h.position ? [h.position.str] : []);
    if (new Set(strings).size !== strings.length) fixed(node, 'a multi-stop chord on one string');
    const { base, dots, slash } = cursor.rhythm;
    const ticks = VexFlow.durationToTicks(base);
    const duration = new Fraction(ticks, VexFlow.RESOLUTION).multiply(2 ** (dots + 1) - 1, 2 ** dots).simplify().toString();
    const event: Attack = { id: 'a' + node.range.start, range: node.range, heads, base, dots,
      rhythmRange: cursor.rhythm.range, slash, duration, onset: '0/1' };
    const tied = members.flatMap((n, i) => node.articulation === 'T' || n.articulation === 'T' ? [i] : []);
    connect(previous, event, tied, ties, node);
    bar.events.push(event);
    previous = event;
  }
  commands.finish();
  if (!bar.events.length && bar.boundaryRange) invalid({ range: bar.boundaryRange }, 'Boundary command needs a following measure');
  if (bar.events.length) bars.push(bar);
  else if (bar.opening) fixed({ range: bar.opening.range }, 'a barline without a following measure');
  for (const voice of bars) {
    const time = new Fraction(0, 1);
    for (const event of voice.events) {
      event.onset = time.simplify().toString();
      time.add(fraction(event.duration));
    }
    voice.span = time.simplify().toString();
  }
  return bars;
}

interface Row {
  node: Token;
  state: StaffState;
  voices: { bars: MeasureVoice[]; node: Token }[];
}

/** Check every voice before exposing the measures. Never fill missing time with inferred rests. */
function finishRow(row: Row, measures: Measure[]) {
  const first = row.voices[0]?.bars;
  if (!first?.length) throw new ScoreError('measure', 'Empty stave', row.node.range);
  if (row.state.piano && !row.voices.some(v => v.bars[0]?.hand === 'left')) {
    invalid(row.node, 'A piano needs a left hand. Add voice hand=left and write its notes or rests');
  }
  for (const { bars, node } of row.voices) {
    if (bars.length !== first.length) throw new ScoreError('measure', 'Voices have different bar counts', node.range);
  }
  let state = row.state;
  for (let i = 0; i < first.length; i++) {
    if (first[i].keyChange) state = { ...state, key: first[i].keyChange };
    const voices = row.voices.map(v => v.bars[i]);
    const pickup = i === 0 ? row.state.pickup : undefined;
    const wanted = pickup ?? (row.state.fragment ? first[i].span : fraction(row.state.meter).toString());
    for (const voice of voices) {
      const range = voice.closing?.range ?? voice.events[voice.events.length - 1].range;
      if (voice.span !== wanted) {
        const hint = voice !== first[i] ? 'All voices must fill the same bar'
          : 'Declare a pickup or fragment for an intentional partial bar';
        throw new ScoreError('measure', `Bar ${measures.length + 1} lasts ${voice.span}, expected ${wanted}. ${hint}`, range);
      }
      if (voice !== first[i] && ((voice.closing?.type ?? 'single') !== (first[i].closing?.type ?? 'single')
          || (voice.opening?.type ?? 'single') !== (first[i].opening?.type ?? 'single'))) {
        throw new ScoreError('measure', 'Voice barlines disagree', range);
      }
    }
    const firstEvent = first[i].events[0], lastEvent = first[i].events[first[i].events.length - 1];
    const range = { ...(first[i].opening?.range ?? firstEvent.range), end: (first[i].closing?.range ?? lastEvent.range).end };
    measures.push({ number: measures.length + 1, range, span: wanted, state, voices, newRow: i === 0 });
  }
}

/** Octave-specific position, independent of the sign printed beside the head. */
function staffPitch(head: Head): string {
  return head.written[0] + head.written.slice(head.written.indexOf('/'));
}

/** Resolve implicit named pitches at simultaneous onsets after all voices have been read. */
function resolvePitches(measures: Measure[], ties: Tie[], transposed: boolean): void {
  const music = new Music();
  const heads = new Map<string, Head[]>();
  const arrivals = new Map(ties.map(t => [t.to + '/' + t.toHead, t]));
  for (const m of measures) {
    const signature = music.createScaleMap(m.state.key);
    // Accidental memory is shared by voices on one stave, never between piano hands.
    const memory = new Map<string, string>();
    const beats = new Map<string, { event: Attack; hand?: PianoHand }[]>();
    for (const voice of m.voices) for (const event of voice.events) {
      const group = beats.get(event.onset) ?? [];
      group.push({ event, hand: voice.hand });
      beats.set(event.onset, group);
    }
    for (const beat of [...beats.keys()].sort((a,b) => fraction(a).value() - fraction(b).value())) {
      const updates = new Map<string, string>();
      for (const { event, hand } of beats.get(beat)) {
        heads.set(event.id, event.heads);
        event.heads.forEach((h, index) => {
          if (h.sounding === null) return; // A display head cannot change accidental memory.
          const pitch = staffPitch(h);
          const position = (hand ?? '') + pitch;
          const tie = arrivals.get(event.id + '/' + index);
          const prior = tie && heads.get(tie.from)[tie.fromHead];
          if (h.inheritSign) {
            const name = prior?.written.split('/')[0] ?? memory.get(position) ?? signature[pitch[0]].replace(/n$/, '');
            if (name === '?') throw new ScoreError('syntax', 'Write the accidental after a conflicting unison', h.range);
            h.written = name + pitch.slice(1);
            if (!h.position) h.sounding = h.written;
          }
          if (transposed && midiPitch(h.sounding) === undefined) {
            throw new ScoreError('syntax', 'Transposed note is outside the playable MIDI range', h.range);
          }
          if (prior && prior.written !== h.written) throw new ScoreError('syntax', 'Tied pitches differ', h.range);
          const name = h.written.split('/')[0];
          updates.set(position, updates.has(position) && updates.get(position) !== name ? '?' : name);
        });
      }
      for (const [pitch, name] of updates) memory.set(pitch, name);
    }
  }
}

/** The initial line is the treble voice. Each additional voice names its physical hand. */
function pianoHand(node: Token): PianoHand {
  const opt = node.options?.find((o: Token) => o.key === 'hand');
  if (node.element === 'piano') {
    if (opt && opt.value !== 'right') invalid(opt, 'Start a piano with the right hand, then add voice hand=left');
    return 'right';
  }
  if (!opt || !['right', 'left'].includes(opt.value)) invalid(opt ?? node, 'A piano voice needs hand=right or hand=left');
  return opt.value;
}

/** Pure parse/validation entry. All mutable compiler state is local to this source revision. */
export function parseScore(source: string, options: { language: 1 }): ParsedScore;
export function parseScore(source: string, options?: { language?: 2; capacity?: ScoreCapacity }): ScoreV2;
export function parseScore(source: string, options: { language?: 1 | 2; capacity?: ScoreCapacity }): ParsedScore | ScoreV2;
export function parseScore(source: string, options: { language?: 1 | 2; capacity?: ScoreCapacity } = {}): ParsedScore | ScoreV2 {
  if (options.language === undefined || options.language === 2) return compileGrammar2(source, options.capacity);
  if (options.language !== 1) throw new RangeError('Expected VexTab language 1 or 2');
  const nodes: Token[] = readSyntax(source, true);
  const measures: Measure[] = [], ties: Tie[] = [], spans: ScoreSpan[] = [];
  const cursor = { rhythm: { base: 'q', dots: 0, slash: false } };
  const settings: Settings = {};
  let row: Row;
  for (const node of nodes) {
    if (node.element === 'options') {
      const audio = node.params.find((p: Token) => ['tempo', 'instrument', 'player'].includes(p.key));
      if (row && audio) invalid(audio, 'Set flow playback options before the first stave');
      const numbering = node.params.find((p: Token) => p.key === 'measure-numbers');
      if (row && numbering) invalid(numbering, 'Set measure numbering before the first stave');
      readSettings(settings, node);
      continue;
    }
    if (node.element !== 'voice' || !row) {
      if (row) finishRow(row, measures);
      row = { node, state: staffState(node), voices: [] };
    } else {
      for (const opt of node.options ?? []) {
        if (!['voice', 'fingering', 'accents'].includes(opt.key) && !(row.state.piano && opt.key === 'hand')) fixed(opt, `voice option '${opt.key}'`);
      }
    }
    if (node.text?.length) fixed({ range: node.text[0].declaration }, 'timed text');
    if (node.slurs?.length) fixed(node.slurs[0], 'slur');
    const direction = node.options?.find((o: Token) => o.key === 'voice')?.value;
    if (direction && !['top', 'bottom', 'new'].includes(direction)) invalid(node, 'Invalid voice direction');
    if (node.notes?.length) {
      const hand = row.state.piano ? pianoHand(node) : undefined;
      // Independent hands start with quarter notes even if the other hand ended on a half note.
      const rhythm = hand ? { rhythm: { base: 'q', dots: 0, slash: false } } : cursor;
      const bars = compileVoice(node, row.state, settings, direction, ties, rhythm, spans, row.voices[0]?.bars);
      if (hand) for (const bar of bars) bar.hand = hand;
      row.voices.push({ bars, node });
    } else if (node.element === 'voice' || node.element === 'piano') invalid(node, 'Empty voice');
  }
  if (!row) invalid(nodes[0], 'Expected a stave');
  finishRow(row, measures);
  resolvePitches(measures, ties, Boolean(Number(settings.transpose)));
  resolveMarks(measures, spans);
  const parsed: ParsedScore = { source, measures, ties, spans, measureNumbers: settings['measure-numbers'] === 'true' };
  if (settings.player || settings.tempo || settings.instrument) {
    parsed.playback = { enabled: settings.player === 'true', tempo: settings.tempo ? Number(settings.tempo) : undefined,
      instrument: settings.instrument };
  }
  return parsed;
}
