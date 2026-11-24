// Resolve static LilyPond event attachments, with a separate span stack per source voice.
import type { Expression, Guitar, HeadDetail, Side, SpanPoint } from './expression.js';
import { Input, pitch } from './score.js';
import type { Event, Pitch } from './score.js';
import type { Token } from './lilypond-source.js';

/** Active spans can cross each other. Phrasing and ordinary slurs retain separate IDs. */
export interface Attachments {
  spans: Map<string, { id: string; kind: SpanPoint['kind']; beamStart?: { bar: number; expression: Expression } }>;
  side?: Side;
  fingerSide?: NonNullable<HeadDetail['finger']>['side'];
}
export const standardGuitar = (): Guitar => ({
  kind: 'guitar',
  capo: 0,
  view: 'both',
  tuning: [
    pitch('E', 0, 4),
    pitch('B', 0, 3),
    pitch('G', 0, 3),
    pitch('D', 0, 3),
    pitch('A', 0, 2),
    pitch('E', 0, 2),
  ],
});

/** A physical string is explicit or editorial. Honor all supplied strings and open-finger zero first. */
export function frets(heads: Pitch[], details: HeadDetail[], guitar: Guitar, input: Input, token: Token) {
  const fretAt = (p: Pitch, string: number) => p.sounding - guitar.tuning[string - 1].sounding - guitar.capo;
  for (const [i,head] of heads.entries()) {
    const detail=details[i], string=detail.string;
    if (string && string<=guitar.tuning.length && detail.finger?.value==='0' && fretAt(head,string)>0)
      input.omit('Source finger zero conflicts with the explicit string; retaining both marks.',token.range);
  }
  const candidates = heads.map((p, i) =>
    guitar.tuning
      .map((_, j) => j + 1)
      .filter((string) => {
        const fret = fretAt(p, string);
        return (
          (!details[i].string || details[i].string === string) &&
          fret >= 0 &&
          fret <= 36 &&
          (details[i].finger?.value !== '0' || fret === 0 || details[i].string === string)
        );
      })
      .sort((a, b) => fretAt(p, a) - fretAt(p, b)),
  );
  // At most eight strings. Memoizing occupied subsets bounds search even on unplayable chords.
  const order = heads
    .map((_, i) => i)
    .sort((a, b) => candidates[a].length - candidates[b].length || heads[a].sounding - heads[b].sounding);
  const failed = new Set<number>(),
    positions: number[] = [];
  function place(i: number, occupied: number): boolean {
    if (i === order.length) return true;
    if (failed.has(occupied)) return false;
    for (const string of candidates[order[i]]) {
      const bit = 1 << (string - 1);
      if (occupied & bit) continue;
      positions[order[i]] = string;
      if (place(i + 1, occupied | bit)) return true;
    }
    failed.add(occupied);
    return false;
  }
  if (!place(0, 0))
    input.fail('unsupported', 'No playable position for this guitar chord and tuning.', token.range);
  positions.forEach((string, i) => {
    details[i].string = string;
    details[i].fret = fretAt(heads[i], string);
  });
}

/** Consume one compact, per-head modifier, e.g. a string number or a left-hand finger. */
export function headMark(
  words: Token[],
  i: number,
  detail: HeadDetail,
  fingerSide: Attachments['fingerSide'],
  input: Input,
): number {
  const t = words[i];
  if (t?.value === '!') {
    detail.forcedAccidental = true;
    return i + 1;
  }
  if (/^\\[1-8]$/.test(t?.value ?? '')) {
    if (detail.string) input.fail('syntax', 'Duplicate string number on one note.', t.range);
    detail.string = Number(t.value[1]);
    return i + 1;
  }
  const side = t?.value === '^' ? 'above' : t?.value === '_' ? 'below' : undefined;
  if ((side || t?.value === '-') && /^[0-5]$/.test(words[i + 1]?.value ?? '')) {
    detail.finger = { value: words[i + 1].value, side: side ?? fingerSide ?? 'left' };
    return i + 2;
  }
  return i;
}

/** Match the common LilyPond postfixes. A caller stops at the first unconsumed music token. */
export function afterNote(
  words: Token[],
  i: number,
  event: Event,
  state: Attachments,
  bar: number,
  input: Input,
  nextID: () => string,
): number {
  const t = words[i];
  if (!t) return i;
  let j = i,
    value = t.value,
    side: Side | undefined;
  if (['-', '^', '_'].includes(value)) {
    side = value === '^' ? 'above' : value === '_' ? 'below' : undefined;
    value = words[++j]?.value;
  }
  const x: Expression = event.expression ?? {};
  const point = (slot: string, kind: SpanPoint['kind'], start: boolean) => {
    let current = state.spans.get(slot);
    if (start) {
      if (current) input.fail('unsupported', 'Overlapping LilyPond spans with the same identity.', t.range);
      current = { id: nextID(), kind };
      if (kind === 'beam') current.beamStart = { bar, expression: x };
      state.spans.set(slot, current);
    } else {
      if (!current) input.fail('unsupported', 'Missing start for LilyPond span ' + slot + '.', t.range);
      state.spans.delete(slot);
      if (current!.beamStart && current!.beamStart.bar !== bar) {
        // VexTab validates both endpoints against a single bar. Keep the attacks and other spans intact.
        input.omit('Manual beam across a barline omitted.', t.range);
        const first = current!.beamStart.expression;
        first.spans = first.spans!.filter(point => point.id !== current!.id);
        return;
      }
    }
    (x.spans ??= []).push({ id: current!.id, kind: current!.kind, edge: start ? 'start' : 'stop', side: side ?? state.side });
  };
  if (value==='\\markup') {
    const block=words[j+1];
    const fields=block?.children?.map(t=>t.value) ?? [];
    // Literal labels and dynamic/text pairs are common in historical Mutopia scores.
    if (fields[0]==='\\large' && fields.length===2 && /^"[^"\\]+"$/.test(fields[1])) {
      x.label=fields[1].slice(1,-1);
    } else if (fields[0]==='\\dynamic' && fields[2]==='\\italic' && fields.length===4 &&
        /^(?:ppp|pp|p|mp|mf|f|ff|fff)$/.test(fields[1]) && /^"[^"\\]+"$/.test(fields[3])) {
      x.dynamic=fields[1] as Expression['dynamic']; x.label=fields[3].slice(1,-1);
    } else return i;
    input.omit('Markup font and explicit placement omitted.',[t.range[0],block.range[1]]);
    event.expression=x; return j+2;
  }
  if (/^\\(?:ppp|pp|p|mp|mf|f|ff|fff)$/.test(value)) {
    if (state.spans.has('hairpin')) point('hairpin', 'crescendo', false);
    if (side) input.omit('Explicit dynamic placement omitted.', t.range);
    x.dynamic = value.slice(1) as Expression['dynamic'];
  } else if (value === '(' || value === ')' || value === '\\(' || value === '\\)')
    point(value.length === 1 ? 'slur' : 'phraseSlur', 'slur', value.endsWith('('));
  else if (value === '[' || value === ']') point('beam', 'beam', value === '[');
  else if (value === '\\<' || value === '\\>') {
    if (state.spans.has('hairpin')) point('hairpin', 'crescendo', false);
    point('hairpin', value === '\\<' ? 'crescendo' : 'diminuendo', true);
  } else if (value === '\\!') point('hairpin', 'crescendo', false);
  else if (value === '\\sustainOn' || value === '\\sustainOff') {
    (x.pedal ??= []).push(value.endsWith('On') ? 'down' : 'up');
    if (value.endsWith('Off')) x.pedalUpAtOnset = true;
  } else if (value === '\\downmordent' || value === '\\prall') {
    input.omit('LilyPond ornament ' + value + ' omitted.', [t.range[0], words[j].range[1]]);
  } else if (value === '\\trill' || value === '\\turn' || value === '\\mordent')
    x.ornament = value === '\\trill' ? 'tr' : (value.slice(1) as Expression['ornament']);
  else {
    const marks: Record<string, NonNullable<Expression['articulations']>[number]['kind']> = {
      '->': 'accent',
      '--': 'tenuto',
      '-.': 'staccato',
      '\\staccato': 'staccato',
      '\\accent': 'accent',
      '\\tenuto': 'tenuto',
      '\\fermata': 'fermata',
      '\\marcato': 'marcato',
      '>': 'accent',
      '-': 'tenuto',
      '^': 'marcato',
    };
    if (!Object.hasOwn(marks, value)) return i;
    (x.articulations ??= []).push({ kind: marks[value], side });
  }
  event.expression = x;
  return j + 1;
}
