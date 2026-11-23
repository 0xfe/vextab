// Keep the physical position, written pitch and sounding identity independent on TAB and percussion staves.
import type { Drum, Guitar, Instrument } from './expression.js';
import { pitch, type Event, type Input, type Pitch } from './score.js';
import { one, scalar, type Element } from './xml.js';
import { attributesExcept, numberIn, omitElement } from './musicxml-expression.js';

export interface InstrumentState {
  staffs: (Instrument | undefined)[];
  tab: Set<number>;
  names: Map<string, string>;
  midi: Map<string, number>;
}
/** MusicXML MIDI instruments and individual notes both refer to the score-instrument ID. */
export function instrumentState(): InstrumentState {
  return { staffs: [], tab: new Set(), names: new Map(), midi: new Map() };
}
export function instrumentDefinitions(def: Element, state: InstrumentState, input: Input) {
  for (const item of def.children) {
    if (item.name === 'score-instrument') {
      const name = one(item, 'instrument-name', input);
      const id = item.attributes.id;
      if (!id || !name?.text.trim() || state.names.has(id))
        input.fail('syntax', 'Invalid or duplicate score-instrument.', item.range);
      state.names.set(id, name!.text.trim());
      for (const child of item.children)
        if (
          child !== name &&
          !(child.name === 'instrument-sound' && /^keyboard\.(piano|fortepiano)/.test(child.text.trim()))
        )
          omitElement(child, input);
    } else if (item.name === 'midi-instrument') {
      const unpitched = one(item, 'midi-unpitched', input, true);
      if (!unpitched) {
        omitElement(item, input);
        continue;
      }
      const id = item.attributes.id;
      if (!id || state.midi.has(id))
        input.fail('syntax', 'Invalid or duplicate percussion MIDI mapping.', item.range);
      state.midi.set(id, numberIn(unpitched.text.trim(), 1, 128, unpitched, input) - 1);
      for (const child of item.children)
        if (child !== unpitched && !(child.name === 'midi-channel' && child.text.trim() === '10'))
          omitElement(child, input);
    }
  }
}
/** Read a diatonic pitch expressed through a MusicXML child-name prefix. */
export function prefixedPitch(node: Element, prefix: string, input: Input): Pitch {
  const step = scalar(node, prefix + 'step', input);
  if (!/^[A-G]$/.test(step)) input.fail('unsupported', 'Unsupported ' + prefix + 'step.', node.range);
  return pitch(
    step,
    numberIn(scalar(node, prefix + 'alter', input, '0'), -2, 2, node, input),
    numberIn(scalar(node, prefix + 'octave', input), 0, 9, node, input),
  );
}
export function staffDetails(node: Element, state: InstrumentState, input: Input) {
  const staff = numberIn(node.attributes.number ?? '1', 1, 8, node, input),
    i = staff - 1;
  attributesExcept(node, ['number'], input);
  const lines = one(node, 'staff-lines', input, true),
    tunings = node.children.filter((c) => c.name === 'staff-tuning');
  const capo = one(node, 'capo', input, true);
  if (!tunings.length && !capo) {
    if (lines && lines.text.trim() !== '5') input.omit('Omitted non-five-line staff geometry.', lines.range);
    for (const c of node.children) if (c !== lines) omitElement(c, input);
    return;
  }
  const prior = state.staffs[i];
  const count = numberIn(
    lines?.text.trim() ?? String(prior?.kind === 'guitar' ? prior.tuning.length : tunings.length),
    4,
    8,
    node,
    input,
  );
  const guitar: Guitar = {
    kind: 'guitar',
    capo: capo ? numberIn(capo.text.trim(), 0, 24, capo, input) : prior?.kind === 'guitar' ? prior.capo : 0,
    tuning: prior?.kind === 'guitar' ? [...prior.tuning] : Array(count),
    view: state.tab.has(staff) ? 'tab' : 'notation',
  };
  const seen = new Set<number>();
  for (const t of tunings) {
    const line = numberIn(t.attributes.line, 1, count, t, input);
    if (seen.has(line)) input.fail('syntax', 'Duplicate string tuning line.', t.range);
    seen.add(line);
    guitar.tuning[count - line] = prefixedPitch(t, 'tuning-', input);
  }
  if (guitar.tuning.length !== count || Array.from(guitar.tuning).some((p) => !p))
    input.fail('unsupported', 'Every physical string needs an explicit open tuning.', node.range);
  if (prior && JSON.stringify(prior) !== JSON.stringify(guitar))
    input.fail('unsupported', 'Mid-score retuning or capo changes need a new instrument declaration.', node.range);
  state.staffs[i] = guitar;
  for (const c of node.children)
    if (!['staff-tuning', 'staff-lines', 'capo'].includes(c.name)) omitElement(c, input);
}
/** Each rendering variant receives its own map entry, while sharing the declared one-based GM pitch. */
export function drumHead(node: Element, unpitched: Element, state: InstrumentState, staff: number, input: Input) {
  const ref = one(node, 'instrument', input, true);
  const id = ref?.attributes.id ?? (state.names.size === 1 ? [...state.names.keys()][0] : undefined);
  const midi = id && state.midi.get(id),
    name = id && state.names.get(id);
  if (typeof midi !== 'number' || !name)
    return input.fail(
      'unsupported',
      'Unpitched hit requires a named instrument with a declared midi-unpitched key.',
      ref?.range ?? unpitched.range,
    );
  const display = prefixedPitch(unpitched, 'display-', input);
  const line = (display.octave * 7 + 'CDEFGAB'.indexOf(display.step) - 28) / 2;
  if (Math.abs(line) >= 10)
    input.fail('unsupported', 'Drum display position exceeds the staff range.', unpitched.range);
  const notehead = one(node, 'notehead', input, true);
  const head = ({ normal: 'normal', x: 'cross', 'circle-x': 'circle-cross', triangle: 'triangle' } as const)[
    (notehead?.text.trim() ?? 'normal') as 'normal'
  ];
  if (!head) input.fail('unsupported', 'Unsupported percussion notehead.', notehead!.range);
  if (notehead) attributesExcept(notehead, [], input);
  const stem = scalar(node, 'stem', input, line >= 3 ? 'down' : 'up');
  if (stem !== 'up' && stem !== 'down') input.fail('unsupported', 'Unsupported percussion stem.', node.range);
  const kit = (state.staffs[staff - 1] ??= { kind: 'drums', map: [] });
  if (kit.kind !== 'drums')
    return input.fail('unsupported', 'Pitched and percussion mappings share one staff.', node.range);
  const key = JSON.stringify([id, line, head, stem]);
  let entry = kit.map.find((d) => d.id === key);
  if (!entry) {
    entry = { id: key, line, name, head, stem: stem as Drum['stem'], midi };
    kit.map.push(entry);
  }
  return { display, id: entry.id };
}
/** Validate physical assignments after applying the active transposition. Never guess missing strings or tuning. */
export function checkPositions(e: Event, state: InstrumentState, input: Input) {
  const inst = state.staffs[e.staff - 1];
  if (!e.pitch) return;
  if (state.tab.has(e.staff) && inst?.kind !== 'guitar')
    input.fail('unsupported', 'TAB staff is missing its open-string tuning.', e.range);
  const used = new Set<number>();
  for (const [i, head] of (e.headDetails ?? []).entries()) {
    const p = e.pitches?.[i] ?? e.pitch,
      range = e.headRanges?.[i] ?? e.range;
    if (inst?.kind === 'drums' && !head.drum)
      input.fail('unsupported', 'Mixed pitched and unpitched attacks on one percussion staff.', range);
    if (inst?.kind !== 'guitar') {
      if (head.string !== undefined || head.fret !== undefined || head.bend !== undefined)
        input.fail('unsupported', 'Fretted position needs the source open-string tuning.', range);
      continue;
    }
    if (head.string === undefined || typeof head.fret !== 'number')
      input.fail('unsupported', 'Fretted note is missing its explicit string or fret.', range);
    const open = inst.tuning[head.string! - 1];
    if (!open || open.sounding + inst.capo + (head.fret as number) !== p.sounding)
      input.fail('unsupported', 'String, fret, tuning and capo disagree with the declared sounding pitch.', range);
    if (used.has(head.string!))
      input.fail('unsupported', 'Two simultaneous heads occupy one physical string.', range);
    used.add(head.string!);
  }
}
