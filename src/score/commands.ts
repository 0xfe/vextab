// Interpret flow commands at musical boundaries and on their preceding attack.
import { FrettedInstrument, VexFlow, KeyManager, type TimedStringBend, type FretDiagramSpec } from 'vexflow';
import type { Attack, Measure, MeasureVoice, ScoreSpan, StaffState } from './model';
import { ScoreError, type SourceRange } from './source';

type Command = { range: SourceRange; params: string };
type OpenMute = { event: Attack; strings: number[]; range: SourceRange };

function fail(range: SourceRange, message: string): never {
  throw new ScoreError('syntax', message, range);
}

/** Quoted labels use JSON string escapes and preserve commas and spaces. */
function label(text: string, range: SourceRange): string {
  try {
    const value = JSON.parse(text);
    if (typeof value === 'string' && value.trim() && !/[\r\n]/.test(value)) return value;
  } catch { /* Report the source command below. */ }
  fail(range, 'Expected nonempty text in double quotes');
}

/** Phase endpoints are exact fractions of the attack, including dotted and tuplet time. */
function bend(text: string, event: Attack, state: StaffState, range: SourceRange): TimedStringBend {
  const match = /^(\d+)\s+\+(\d+(?:\.\d+)?)\s+rise=(\d+\/\d+)(?:\s+hold=(\d+\/\d+))?(?:\s+release=(\d+\/\d+))?$/.exec(text);
  if (!match) fail(range, 'Expected bend STRING +SEMITONES rise=N/D [hold=N/D] [release=N/D]');
  function pair(value: string): [number, number] | undefined {
    if (!value) return;
    const [n, d] = value.split('/').map(Number);
    return [n, d];
  }
  const spec = { string: +match[1], semitones: +match[2], rise: pair(match[3]), hold: pair(match[4]), release: pair(match[5]) };
  if (event.heads.some(h => h.prebend && h.position.str === spec.string)) fail(range, 'This string already has a pre-bend');
  const positions = event.heads.map(h => h.position);
  if (!positions.length || positions.some(p => !p || p.fret === 'X')) fail(range, 'A bend needs a pitched fretted attack');
  try {
    new FrettedInstrument(state.tuning, state.capo).bentAttack(positions as {str: number; fret: number}[], event.base, spec);
  } catch (error) { fail(range, error.message); }
  return spec;
}

/** Frames use low-to-high frets. Check the diagram against the actual, capo-relative voicing. */
function frame(text: string, event: Attack, state: StaffState, range: SourceRange): FretDiagramSpec {
  const match = /^([x\d,]+)(?:\s+barre=(\d+):(\d+)-(\d+))?$/.exec(text);
  if (!match || !event.chord) fail(range, 'A frame follows a chord label and needs low-to-high frets');
  const cells = match[1].split(',');
  if (cells.length !== state.strings || cells.some(c => !/^(x|\d+)$/.test(c))) fail(range, 'Supply one fret or x per string');
  const frets = cells.map(c => c === 'x' ? 'x' : Number(c));
  if (frets.every(fret => fret === 'x')) fail(range, 'A frame needs at least one sounding string');
  for (const [i, fret] of frets.entries()) {
    const head = event.heads.find(h => h.position?.str === state.strings - i);
    const played = head?.position?.fret;
    if (!Number.isSafeInteger(fret) && fret !== 'x') fail(range, 'Invalid frame fret');
    if (fret === 'x' ? played !== undefined && played !== 'X' : played !== fret) fail(range, 'Frame disagrees with the fretted chord');
  }
  if (event.heads.some(h => !h.position)) fail(range, 'A frame needs an explicit string for each chord member');
  const stopped = frets.filter((n): n is number => typeof n === 'number' && n > 0);
  const firstFret = Math.max(...stopped) > 4 ? Math.min(...stopped) : 1;
  if (Math.max(...stopped) - firstFret >= 4) fail(range, 'Frame spans more than four frets');
  let barre: FretDiagramSpec['barre'];
  if (match[2]) {
    const [fret, from, to] = match.slice(2).map(Number);
    if (from <= to || to < 1 || from > state.strings || fret < firstFret ||
        frets[state.strings - from] !== fret || frets[state.strings - to] !== fret ||
        frets.slice(state.strings - from, state.strings - to + 1).some(n => typeof n !== 'number' || n < fret)) {
      fail(range, 'Barre endpoints must stop at the given fret, from lower to higher string');
    }
    barre = { fret, from, to };
  }
  return { frets, firstFret, barre };
}

/** Prefix commands belong to the next measure in the top voice. */
function setBoundary(bar: MeasureVoice, name: string, args: string, range: SourceRange): void {
  if (bar.events.length) fail(range, 'Put this command at the start of a bar');
  bar.boundaryRange ??= range;
  if (name === 'key') {
    if (bar.keyChange || !VexFlow.hasKeySignature(args)) fail(range, 'Expected one key signature per boundary');
    try { new KeyManager(args); } catch { fail(range, 'Unsupported key signature'); }
    bar.keyChange = args;
  } else if (name === 'mark') {
    if (bar.rehearsal) fail(range, 'Duplicate rehearsal mark');
    bar.rehearsal = label(args, range);
  } else {
    const m = /^([1-9]\d*)\s+bars=([1-9]\d*)$/.exec(args);
    if (!m || bar.ending) fail(range, 'Expected one ending NUMBER bars=COUNT');
    bar.ending = { label: m[1] + '.', bars: Number(m[2]), range };
  }
}

/** State for paired commands is local to a voice. It never crosses to another player or voice. */
export class VoiceCommands {
  private mute?: OpenMute;
  constructor(private readonly state: StaffState, private readonly spans: ScoreSpan[], private readonly firstVoice: boolean) {}

  apply(node: Command, bar: MeasureVoice): void {
    const { range } = node;
    const [, name, args = ''] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(node.params.trim()) ?? [];
    if (['key', 'mark', 'ending'].includes(name)) {
      if (!this.firstVoice) fail(range, 'Put this command in the first voice');
      setBoundary(bar, name, args, range);
      return;
    }
    const event = bar.events[bar.events.length - 1];
    if (!event) fail(range, 'Put this command immediately after an attack in this bar');
    switch (name) {
      case 'bend':
        if (event.bend) fail(range, 'One timed bend per attack');
        event.bend = { spec: bend(args, event, this.state, range), range };
        break;
      case 'pm': {
        const strings = args.split(',').map(Number);
        if (this.mute || !/^\d+(,\d+)*$/.test(args) || new Set(strings).size !== strings.length ||
            strings.some(n => n < 1 || n > this.state.strings) || !event.heads.some(h => strings.includes(h.position?.str))) {
          fail(range, 'Start one palm mute on a played target string');
        }
        this.mute = { event, strings, range };
        break;
      }
      case 'end-pm': {
        if (args || !this.mute || !event.heads.some(h => this.mute.strings.includes(h.position?.str))) {
          fail(range, 'End the open palm mute on a played target string');
        }
        const { strings, event: start, range: opening } = this.mute;
        this.spans.push({ kind: 'palmMute', id: 'pm' + opening.start, from: start.id, to: event.id, strings, range: opening });
        this.mute = undefined;
        break;
      }
      case 'silent':
        if (args || event.heads.length || event.silent) fail(range, 'Put !silent! after a rest');
        event.silent = range;
        break;
      case 'chord':
        if (!event.heads.length) fail(range, 'A chord label needs a note or slash');
        if (event.chord) fail(range, 'Duplicate chord label');
        event.chord = { text: label(args, range), range };
        break;
      case 'frame':
        if (event.frame) fail(range, 'Duplicate chord frame');
        event.frame = { spec: frame(args, event, this.state, range), range };
        break;
      case 'lyric': {
        const m = /^("(?:[^"\\]|\\.)*")(?:\s+(-)|\s+extend=([1-9]\d*))?$/.exec(args);
        if (!m || event.lyric || !event.heads.length) fail(range, 'Expected one lyric "syllable" with an optional - or extend=COUNT on a note');
        event.lyric = { text: label(m[1], range), hyphen: !!m[2], extend: Number(m[3] ?? 0), range };
        break;
      }
      default: throw new ScoreError('fixed-layout', 'Use fixed layout for command ' + name, range);
    }
  }

  finish(): void {
    if (this.mute) fail(this.mute.range, 'Unclosed palm mute');
  }
}

/** Resolve counted endings and measure-local lyric connectors after bars have aligned. */
export function resolveMarks(measures: Measure[], spans: ScoreSpan[]): void {
  let previousEnd = 0;
  for (const measure of measures) {
    const voice = measure.voices[0];
    const ending = voice.ending;
    if (ending) {
      const lastBar = measure.number + ending.bars - 1;
      const last = measures[lastBar - 1]?.voices[0].events;
      if (!last || previousEnd >= measure.number) fail(ending.range, 'Ending overlaps another ending or extends beyond the score');
      spans.push({ kind: 'volta', id: 'ending' + ending.range.start, label: ending.label, from: voice.events[0].id,
        to: last[last.length - 1].id, firstBar: measure.number, lastBar, range: ending.range });
      previousEnd = lastBar;
    }
    for (const v of measure.voices) v.events.forEach((event, i) => {
      const lyric = event.lyric;
      if (lyric?.hyphen && !v.events.slice(i + 1).some(e => e.lyric)) fail(lyric.range, 'Hyphen needs a following syllable in this bar and voice');
      if (lyric?.extend && !v.events[i + lyric.extend]) fail(lyric.range, 'Lyric extender must end in this bar and voice');
    });
  }
}
