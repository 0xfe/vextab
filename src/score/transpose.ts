// Transpose parsed VexTab tokens before either compiler builds a score. Ranges refer to the original source.
import VexFlow, { Music, NotationSpelling, Tuning } from 'vexflow/core';
import { midiPitch } from './music';

/** Jison's options, attacks, and commands share a location, with fields specific to their production. */
type Token = Record<string, any>;
type Instrument = { tuning: Tuning; capo: number };
type Reject = (token: Token, message: string) => never;

/** Pick a conventional major or minor signature, then use its diatonic interval for every note. */
export class Interval {
  readonly steps: number;
  readonly target: string;

  constructor(readonly semitones: number, key: string) {
    // A pure octave must retain enharmonics such as C-flat major.
    if (semitones % 12 === 0) {
      this.steps = semitones / 12 * 7;
      this.target = key;
      return;
    }
    const signatures = VexFlow.getKeySignatures();
    const music = new Music();
    const tonic = key.replace(/m$/, '').toLowerCase();
    const pitchClass = (music.getNoteValue(tonic) + semitones % 12 + 12) % 12;
    const sign = VexFlow.keySignature(key)[0]?.type;
    const preferFlats = sign === 'b' || (!sign && semitones < 0);
    const weight = (name: string) => signatures[name].num * 2 + Number((VexFlow.keySignature(name)[0]?.type === 'b') !== preferFlats);
    const keys = Object.keys(signatures).filter(name => /^[A-G][#b]?m?$/.test(name)
      && name.endsWith('m') === key.endsWith('m') && music.getNoteValue(name.replace(/m$/, '').toLowerCase()) === pitchClass);
    this.target = keys.sort((a, b) => weight(a) - weight(b))[0];
    const destination = this.target.replace(/m$/, '').toLowerCase();
    const root = (name: string) => Music.rootIndexes[name[0]];
    // C-flat is below C and B-sharp is above B in the same written octave.
    const chromatic = (name: string) => Music.rootValues[root(name)] + (name[1] === 'b' ? -1 : Number(name[1] === '#'));
    const octaves = (chromatic(tonic) + semitones - chromatic(destination)) / 12;
    this.steps = octaves * 7 + root(destination) - root(tonic);
  }

  /** Retain degree and accidental spelling, including octave crossings. */
  pitch(name: string, octave: number): string {
    return NotationSpelling.transpose(name + '/' + octave, this.semitones, this.steps);
  }
}

/** A guitar's capo is fixed. Move the finger on the original string or report the offending attack. */
function shiftedFret(value: string, interval: Interval, token: Token, reject: Reject): string {
  const fret = Number(value) + interval.semitones;
  if (!Number.isSafeInteger(fret) || fret < 0) reject(token, 'Transposition puts fret ' + value + ' outside the original string');
  return String(fret);
}

/** Omitted signs continue to inherit the new signature and bar memory. Explicit signs stay explicit. */
function transposeHead(note: Token, interval: Interval, instrument: Instrument, reject: Reject) {
  if (note.fret !== undefined) {
    note.fret = shiftedFret(note.fret, interval, note, reject);
    // VexTab tuning is written an octave up. Its integer fret value is the sounding MIDI pitch.
    const peak = Number(note.fret) + instrument.capo + (note.prebend?.semitones ?? 0);
    const value = instrument.tuning.getValueForFret(peak, note.string);
    if (value < 0 || value > 127) reject(note, 'Transposed fret is outside the playable MIDI range');
  }
  const abc = note.abc;
  if (!abc || !/^[A-G]$/.test(abc.key)) return;
  const octave = Number(note.octave ?? note.string);
  const implicit = !abc.accidental && !abc.accidental_type;
  // Only the destination letter and octave matter for an inherited pitch.
  const [name, targetOctave] = interval.pitch(abc.key + (abc.accidental || ''), octave).split('/');
  // A bare letter inherits its bar accidental. The staff spelling must still fit the supported register.
  if (note.fret === undefined && (Number(targetOctave) < -2 || Number(targetOctave) > 9 ||
      (!implicit && midiPitch(name + '/' + targetOctave) === undefined))) {
    reject(note, 'Transposed note is outside the playable MIDI range');
  }
  abc.key = name[0].toUpperCase();
  abc.transposed = note.range;
  if (!implicit) abc.accidental = name.slice(1) || 'n';
  if (note.octave !== undefined) note.octave = targetOctave;
  else note.string = targetOctave;
}

/** Transpose conventional chord roots and slash basses. Free-form labels, lyrics and annotations are text. */
export function transposeChord(label: string, interval: Interval): string {
  const match = /^([A-G][#b]?)([^\s/]*)(?:\/([A-G][#b]?))?$/.exec(label);
  if (!match || !/^(?:maj|min|dim|aug|sus|add|omit|no|alt|m|M|Δ|ø|°|[0-9#+b(),−-])*$/.test(match[2])) return label;
  const name = (root: string) => {
    const pitch = interval.pitch(root, 4).split('/')[0];
    return pitch[0].toUpperCase() + pitch.slice(1);
  };
  return name(match[1]) + match[2] + (match[3] ? '/' + name(match[3]) : '');
}

/** Structured diagram frets and chord names track the same shift as the preceding attack. */
function transposeMark(node: Token, interval: Interval, reject: Reject) {
  const chord = /^(\s*chord\s+)("(?:[^"\\]|\\.)*")(.*)$/.exec(node.params);
  if (chord) {
    node.params = chord[1] + JSON.stringify(transposeChord(JSON.parse(chord[2]), interval)) + chord[3];
    return;
  }
  const frame = /^(\s*frame\s+)([x\d,]+)(?:\s+barre=(\d+)(:\d+-\d+))?\s*$/.exec(node.params);
  if (frame) {
    const shift = (fret: string) => fret === 'x' ? fret : shiftedFret(fret, interval, node, reject);
    // A barre moved onto the nut becomes open strings.
    const barre = frame[3] && shift(frame[3]);
    node.params = frame[1] + frame[2].split(',').map(shift).join(',') + (barre && barre !== '0' ? ' barre=' + barre + frame[4] : '');
  }
}

/** A key change in the first voice also applies at that bar in every following voice. */
function transposeVoice(node: Token, changes: Map<number, Interval>, instrument: Instrument, reject: Reject) {
  let bar = 0, hasAttack = false, interval = changes.get(0)!;
  for (const item of node.notes ?? []) {
    try {
      const key = item.command === 'command' && /^\s*key\s+(\S+)\s*$/.exec(item.params);
      if (key) {
        if (!VexFlow.hasKeySignature(key[1]) || !/^[A-G][#b]?m?$/.test(key[1])) reject(item, 'Invalid key signature');
        interval = new Interval(interval.semitones, key[1]);
        changes.set(bar, interval);
        item.params = 'key ' + interval.target;
      } else if (item.command === 'bar' && hasAttack) {
        bar++;
        interval = changes.get(bar) ?? interval;
        hasAttack = false;
      } else if (item.command === 'command') {
        transposeMark(item, interval, reject);
      } else if (item.chord || item.abc || item.fret !== undefined || item.command === 'rest') {
        for (const head of item.chord ?? [item]) transposeHead(head, interval, instrument, reject);
        hasAttack = true;
      }
    } catch (error) {
      if (error.code === 'syntax') throw error;
      reject(item, error.message);
    }
  }
}

/** Transform the score once. Voices reuse the first voice's written key changes at each bar. */
export function transposeSyntax(nodes: Token[], reject: Reject) {
  let amount = 0, started = false, percussion = false;
  let instrument: Instrument;
  let changes: Map<number, Interval>;
  for (const node of nodes) {
    if (node.element === 'options') {
      for (const option of node.params) {
        if (option.key !== 'transpose') continue;
        if (started) reject(option, 'Set transpose before the first stave');
        amount = Number(option.value);
        if (!/^[+-]?\d+$/.test(option.value) || !Number.isSafeInteger(amount) || Math.abs(amount) > 127) {
          reject(option, 'Transpose needs an integer from -127 to +127 semitones');
        }
      }
      continue;
    }
    started = true;
    if (!amount) continue;
    if (node.element !== 'voice') {
      percussion = node.options?.some((o: Token) => o.key === 'clef' && o.value === 'percussion');
      if (percussion) continue;
      const key = node.options?.find((o: Token) => o.key === 'key');
      const original = key?.value ?? 'C';
      if (!/^[A-G][#b]?m?$/.test(original) || !VexFlow.hasKeySignature(original)) reject(key ?? node, 'Transposition requires a major or minor key');
      const row = new Interval(amount, original);
      const tuning = node.options?.find((o: Token) => o.key === 'tuning');
      const capo = node.options?.find((o: Token) => o.key === 'capo');
      try { instrument = { tuning: new Tuning(tuning?.value ?? 'standard'), capo: Number(capo?.value ?? 0) }; }
      catch { reject(tuning ?? node, 'Invalid tuning'); }
      changes = new Map([[0, row]]);
      if (key) key.value = row.target;
      else {
        const range = node.range && { ...node.range, end: node.range.start + node.element.length };
        (node.options ??= []).unshift({ key: 'key', value: row.target, range, _l: node._l, _c: node._c });
      }
    }
    if (percussion || !changes) continue;
    transposeVoice(node, changes, instrument, reject);
  }
}
