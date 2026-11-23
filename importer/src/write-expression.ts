// Serialize resolved expressive attachments, instrument settings and physical playing positions.
import type { Expression, HeadDetail, Instrument } from './expression.js';
import type { Event, Input, Pitch } from './score.js';
import type { TextRange } from './types.js';
import type { Time } from './time.js';

/** Keep arbitrary source IDs out of target token syntax. Identical identities share one legal target name. */
export class Names {
  private readonly names = new Map<string, string>();
  get(prefix: string, id: string) {
    const key = prefix + ':' + id;
    let name = this.names.get(key);
    if (!name) {
      name = prefix + (this.names.size + 1);
      this.names.set(key, name);
    }
    return name;
  }
}

function fraction(time: Time) { return time.numerator + '/' + time.denominator; }

/** Head-specific marks stay inside the chord so a tie or fingering never affects a neighboring note. */
export function headMarks(head: HeadDetail, names: Names) {
  const marks: string[] = [];
  if (head.tieStop && !head.tieEndId) marks.push('tie');
  if (head.tieEndId) marks.push('tieEnd ' + names.get('tie', head.tieEndId));
  if (head.tieStartId) marks.push('tieStart ' + names.get('tie', head.tieStartId));
  if (head.finger) marks.push('finger ' + head.finger.value + ' ' + head.finger.side);
  if (head.forcedAccidental) marks.push('showSign');
  if (head.gesture) marks.push(head.gesture);
  if (head.bend !== undefined) marks.push('bend +' + head.bend + ' rise=1/2');
  if (head.releaseAfter) marks.push('sustain ' + fraction(head.releaseAfter));
  return marks;
}

/** Preserve syllabification, verse identity and original lyric text independently. */
export function eventMarks(expression: Expression, names: Names) {
  const marks: string[] = [];
  for (const lyric of expression.lyrics ?? []) {
    const fields = [lyric.verse ? 'verse ' + names.get('verse', lyric.verse) : 'lyric', JSON.stringify(lyric.text)];
    if (lyric.elideWith !== undefined) fields.push('elide', JSON.stringify(lyric.elideWith));
    if (lyric.hyphen) fields.push('hyphen');
    if (lyric.extend) fields.push('extend=' + lyric.extend);
    marks.push(fields.join(' '));
  }
  if (expression.harmony) {
    const {root, quality, bass} = expression.harmony;
    marks.push('harmony ' + root + ' ' + JSON.stringify(quality) + (bass ? ' bass ' + bass : ''));
  }
  if (expression.frame) {
    const {frets, barre, independent} = expression.frame;
    marks.push((independent ? 'diagram (' : 'frame (') + frets.join(' ') + ')' + (barre ? ' barre=' + barre[0] + '/' + barre[1] + '..' + barre[2] : ''));
  }
  if (expression.dynamic) marks.push('dynamic ' + expression.dynamic);
  for (const sign of expression.articulations ?? []) {
    const kind = sign.kind === 'tenuto' ? 'articulation a-' : sign.kind === 'marcato' ? 'articulation a^' : sign.kind;
    marks.push(kind + (sign.side ? ' ' + sign.side : ''));
  }
  if (expression.ornament) marks.push('ornament ' + expression.ornament);
  for (const action of expression.pedal ?? [])
    marks.push('pedal ' + action + (action === 'up' && expression.pedalUpAtOnset ? ' onset' : ''));
  for (const span of expression.spans ?? []) {
    const start = span.edge === 'start';
    const hairpin = span.kind === 'crescendo' || span.kind === 'diminuendo';
    const kind = !start && hairpin ? 'hairpin' : span.kind;
    const fields = [kind + (start ? 'Start' : 'End'), names.get(span.kind, span.id)];
    if (start && span.kind === 'slur' && span.side) fields.push(span.side);
    if (start && hairpin && span.niente) fields.push('niente');
    marks.push(fields.join(' '));
  }
  return marks;
}

/** The grace group borrows from its principal. Chords within the group keep their head order. */
export function graceMark(event: Event, spell: (p: Pitch) => string) {
  const expression = event.expression;
  const pitches = event.grace!.map(chord => chord.length === 1 ? spell(chord[0]) : '(' + chord.map(spell).join(' ') + ')');
  const args = ['grace', expression?.graceSide ?? 'before'];
  if (expression?.graceSlashed) args.push('slashed');
  if (expression?.graceSteal) args.push('steal=' + fraction(expression.graceSteal));
  return args.join(' ') + ' (' + pitches.join(' ') + ')';
}

/** Core guitar tunings are written one octave above their sounding open strings. */
function tuning(pitches: Pitch[], input: Input, range: TextRange) {
  const result = pitches.map(p => {
    if (!/^[A-G]$/.test(p.step) || Math.abs(p.alter) > 1 || p.octave < -1 || p.octave > 7)
      input.fail('unsupported', 'Open string exceeds the writable guitar tuning range.', range);
    return p.step + (p.alter < 0 ? 'b' : p.alter > 0 ? '#' : '') + (p.octave + 1);
  });
  if (result.length < 4 || result.length > 8)
    input.fail('unsupported', 'A fretted part requires four to eight open strings.', range);
  return 'tuning (' + result.join(' ') + ')';
}

/** Write drum labels literally and use generated IDs for their corresponding staff heads. */
export function instrumentSettings(instrument: Instrument, names: Names, input: Input, range: TextRange) {
  if (instrument.kind === 'guitar') {
    return [tuning(instrument.tuning, input, range), 'capo ' + instrument.capo, 'view ' + (instrument.view ?? 'both')];
  }
  return instrument.map.map(drum => 'map ' + names.get('hit', drum.id) + ' ' + JSON.stringify(drum.name) +
    ' line ' + drum.line + ' head ' + drum.head + ' stem ' + drum.stem + ' midi ' + drum.midi);
}
