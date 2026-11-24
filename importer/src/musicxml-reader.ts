// Normalize partwise and timewise MusicXML to exact measured voices in source part order.
import { groupStaves, includesExtended, Input, keys, minorKeys, Measure, meter, pitch } from './score.js';
import { Time, zero } from './time.js';
import type { Event } from './score.js';
import type { MusicXMLOptions, TextRange } from './types.js';
import { one, treeReader, scalar, shape } from './xml.js';
import { addDirection, attachDirections, type Directions } from './musicxml-directions.js';
import {
  appendHead,
  finishNotation,
  graceNote,
  notationState,
  noteMarks,
  headDetail,
  principal,
  type NotationState,
} from './musicxml-expression.js';
import {
  checkPositions,
  drumHead,
  instrumentDefinitions,
  instrumentState,
  staffDetails,
  type InstrumentState,
} from './musicxml-instruments.js';
import type { Element } from './xml.js';
import { barline, collectForm, normalizeForm, type Boundaries } from './musicxml-form.js';

/** Independent state persists at bar boundaries even if divisions change within a measure. */
interface PartState {
  notation: NotationState;
  instruments: InstrumentState;
  id: string;
  name: string;
  divisions: number;
  key: string;
  beats: number;
  beatType: number;
  clefs: string[];
  staffKeys: (string | undefined)[];
  sounds: number[];
  group?: Measure['group'];
  piano: boolean;
  ownership: Map<string, number>;
  pickup?: Time;
  /** Some historical exporters split one numbered measure into, for example, "7" and "7a". */
  shortBar?: { label: string; extent: Time; bars: Measure[] };
  reserved: Set<string>;
  lanes: Map<string, string>;
}
interface BarInput {
  measure: Element;
  children: Element[];
}
const values = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th', '128th', '256th'];

/** Known display-only fields are identified individually in partial mode. Unknown timing is fatal. */
function omit(node: Element, input: Input) {
  input.omit('Omitted MusicXML ' + node.name + '.', node.range);
}
function integer(value: string, range: TextRange, input: Input) {
  if (!/^\d+$/.test(value) || +value < 1 || +value > 0x7fffffff)
    input.fail('unsupported', 'Expected a bounded positive integer.', range);
  return +value;
}
function elapsed(node: Element, divisions: number, input: Input) {
  if (!divisions) input.fail('syntax', 'Duration before divisions.', node.range);
  return new Time(integer(scalar(node, 'duration', input), node.range, input), 4 * divisions);
}

/** Attributes take effect at the cursor; the measured profile supports divisions changes inside a bar. */
function attributes(node: Element, state: PartState, cursor: Time, input: Input, bars: Measure[] = []) {
  const mid = cursor.compare(zero) !== 0;
  const extended = includesExtended(input.options);
  function change(
    kind: 'key' | 'clef' | 'sounds',
    value: string | number,
    number: string | undefined,
    source: Element,
  ) {
    const staffs = number ? [integer(number, source.range, input)] : state.clefs.map((_, i) => i + 1);
    for (const staff of staffs) {
      if (staff > state.clefs.length) input.fail('syntax', 'State for an undeclared staff.', source.range);
      if (mid) {
        bars[staff - 1].changes.push({ kind, value, at: cursor, range: source.range });
        continue;
      }
      if (kind === 'key') state.staffKeys[staff - 1] = String(value);
      else if (kind === 'clef') state.clefs[staff - 1] = String(value);
      else state.sounds[staff - 1] = Number(value);
    }
  }
  shape(node, input, [
    'divisions',
    'key',
    'time',
    'clef',
    'staves',
    'transpose',
    'instruments',
    'measure-style',
    'staff-details',
  ]);
  for (const child of node.children) {
    if (child.name === 'divisions') {
      state.divisions = integer(scalar(node, 'divisions', input), child.range, input);
      continue;
    }
    if (mid && (!extended || !['clef', 'key', 'transpose'].includes(child.name)))
      input.fail('unsupported', 'Mid-measure ' + child.name + ' change.', child.range);
    if (child.name === 'key') {
      shape(child, input, ['fifths', 'mode'], ['number']);
      const fifths = scalar(child, 'fifths', input);
      const mode = scalar(child, 'mode', input, 'major');
      if (!/^-?[0-7]$/.test(fifths) || !['major', 'minor'].includes(mode))
        input.fail('unsupported', 'Unsupported key signature.', child.range);
      const value = (mode === 'minor' ? minorKeys : keys)[7 + +fifths];
      if (child.attributes.number && !extended)
        input.fail('unsupported', 'Staff-local key needs extended target.', child.range);
      if (!mid && !child.attributes.number) state.key = value;
      change('key', value, child.attributes.number, child);
    } else if (child.name === 'time') {
      shape(child, input, ['beats', 'beat-type'], ['symbol']);
      const temp = new Measure();
      meter(scalar(child, 'beats', input), scalar(child, 'beat-type', input), temp, input, child.range);
      state.beats = temp.beats;
      state.beatType = temp.beatType;
      if (child.attributes.symbol) omit(child, input);
    } else if (child.name === 'staves') {
      const count = integer(scalar(node, 'staves', input), child.range, input);
      if (count > 8 || count < state.clefs.length)
        input.fail('unsupported', 'Unsupported staff count change.', child.range);
      if (count > 1 && !(count === 2 && state.piano))
        input.omit('Independent output staves omit the source part grouping.', child.range);
      while (state.clefs.length < count) state.clefs.push('treble');
    } else if (child.name === 'transpose') {
      if (!extended) input.fail('unsupported', 'Instrument transposition needs the extended target.', child.range);
      shape(child, input, ['diatonic', 'chromatic', 'octave-change'], ['number']);
      const chromatic = scalar(child, 'chromatic', input);
      const octave = scalar(child, 'octave-change', input, '0');
      if (![chromatic, octave].every((n) => /^-?\d+$/.test(n)) || Math.abs(+chromatic + 12 * +octave) > 127)
        input.fail('unsupported', 'Unsupported sounding transposition.', child.range);
      change('sounds', +chromatic + 12 * +octave, child.attributes.number, child);
    } else if (child.name === 'clef') {
      shape(child, input, ['sign', 'line', 'clef-octave-change'], ['number']);
      const octave = one(child, 'clef-octave-change', input, true);
      if (octave)
        input.omit('Omitted the octave indication on the clef; retained source pitch and octave.', octave.range);
      const number = integer(child.attributes.number ?? '1', child.range, input);
      const sign = scalar(child, 'sign', input);
      const code = sign + scalar(child, 'line', input, ['TAB', 'percussion'].includes(sign) ? '' : undefined);
      if (input.options.targetProfile === 'expressive' && (sign === 'TAB' || sign === 'percussion')) {
        if (mid) input.fail('unsupported', 'A change of instrument kind requires a new part.', child.range);
        if (sign === 'TAB') state.instruments.tab.add(number);
        change('clef', sign === 'TAB' ? 'treble' : 'percussion', String(number), child);
        continue;
      }
      const clef = ({ G2: 'treble', F4: 'bass', C3: 'alto', C4: 'tenor' } as Record<string, string>)[code];
      if (code.startsWith('TAB') && extended) {
        input.omit('Converted TAB to pitched staff; fret display is outside the measured profile.', child.range);
        change('clef', 'treble', String(number), child);
        continue;
      }
      if (!clef || number > state.clefs.length)
        input.fail('unsupported', 'Unsupported clef or staff.', child.range);
      change('clef', clef, String(number), child);
    } else if (child.name === 'staff-details' && input.options.targetProfile === 'expressive') {
      staffDetails(child, state.instruments, input);
    } else if (child.name === 'measure-style') {
      if (child.children.some((c) => c.name !== 'multiple-rest'))
        input.fail('unsupported', 'Unresolved measure-style playback.', child.range);
      omit(child, input);
    } else omit(child, input);
  }
}

/** Derive omitted note types only when an exact binary or dotted spelling exists. */
function rhythm(node: Element, duration: Time, input: Input) {
  const typeNode = one(node, 'type', input, true);
  const type = typeNode && scalar(node, 'type', input);
  const dots = node.children.filter((c) => c.name === 'dot').length;
  const ratio = one(node, 'time-modification', input, true);
  let actual = 1,
    normal = 1;
  if (ratio) {
    shape(ratio, input, ['actual-notes', 'normal-notes', 'normal-type', 'normal-dot']);
    for (const c of ratio.children) if (c.name === 'normal-type' || c.name === 'normal-dot') omit(c, input);
    actual = integer(scalar(ratio, 'actual-notes', input), ratio.range, input);
    normal = integer(scalar(ratio, 'normal-notes', input), ratio.range, input);
  }
  for (let i = 0; i < values.length; i++) {
    if (typeNode && type !== values[i]) continue;
    for (let d = dots; d <= (type || dots ? dots : 3) && d <= 3; d++) {
      if (
        new Time(BigInt(2 ** (d + 1) - 1) * BigInt(normal), BigInt(2 ** (i + d)) * BigInt(actual)).compare(
          duration,
        ) === 0
      )
        return { denominator: 2 ** i, dots: d, actual, normal };
    }
  }
  return input.fail('unsupported', 'Written value disagrees with elapsed MusicXML duration.', node.range);
}

/** Pitch alteration determines sound even if the file separately requests an accidental glyph. */
function notePitch(node: Element, input: Input) {
  shape(node, input, ['step', 'alter', 'octave']);
  const step = scalar(node, 'step', input),
    alter = scalar(node, 'alter', input, '0'),
    octave = scalar(node, 'octave', input);
  if (!/^[A-G]$/.test(step) || !/^-?[012]$/.test(alter) || !/^\d$/.test(octave))
    input.fail('unsupported', 'Unsupported pitch spelling or octave.', node.range);
  return pitch(step, +alter, +octave);
}

/** Keep individual note metadata separate from the identity of a chord's first attack. */
interface Previous {
  voice: string;
  event: Event;
  separateHeads?: number;
}
interface Tuplet {
  actual: number;
  normal: number;
  id: string;
}
/** Resolve printed and sounding ties. Other supported-profile omissions are reported at the mark. */
function readMarks(node: Element, marks: Element | undefined, event: Event, input: Input) {
  const tie = new Set<string>();
  for (const mark of [...node.children.filter((c) => c.name === 'tie'), ...(marks?.children ?? [])]) {
    if (mark.name === 'tie' || mark.name === 'tied') {
      if (!['start', 'stop'].includes(mark.attributes.type))
        input.fail('unsupported', 'Unsupported tie type.', mark.range);
      tie.add(mark.attributes.type);
    } else if (mark.name === 'tuplet') {
      if (!['start', 'stop'].includes(mark.attributes.type))
        input.fail('unsupported', 'Unsupported tuplet boundary.', mark.range);
    } else if (mark.name === 'articulations' || mark.name === 'ornaments') {
      for (const child of mark.children)
        child.name === 'staccato' ? input.omitMark(child.range) : omit(child, input);
    } else omit(mark, input);
  }
  event.tieStart = tie.has('start');
  event.tieStop = tie.has('stop');
  for (const child of node.children)
    if (['beam', 'stem', 'notehead', 'accidental'].includes(child.name)) omit(child, input);
}

/** Put shorter heads in their own voice when the caller permits the change of engraving. */
function addChordHead(
  previous: Previous | undefined,
  event: Event,
  voice: string,
  bar: Measure,
  state: PartState,
  tuplet: boolean,
  input: Input,
) {
  const { pitch: head, staff, range } = event;
  if (!previous || !head || !previous.event.pitch || previous.voice !== voice || previous.event.staff !== staff)
    input.fail('syntax', 'Chord member without a matching preceding attack.', range);
  const first = previous!.event;
  const difference = event.elapsed.compare(first.elapsed);
  if (difference > 0) input.fail('timing', 'Chord member lasts longer than its primary attack.', range);
  if (input.options.targetProfile === 'expressive') {
    appendHead(first, event, state.notation, input);
    (first.pitches ??= [first.pitch!]).push(head!);
    (first.headRanges ??= [first.range]).push(range);
    return;
  }
  if (difference < 0) {
    if (tuplet || event.tieStart || event.tieStop)
      input.fail('unsupported', 'Unequal tied or tuplet chord heads.', range);
    input.omit('Separated a shorter chord head into a simultaneous voice to preserve its release.', range);
    const headNumber = (previous!.separateHeads = (previous!.separateHeads ?? 0) + 1);
    const identity = JSON.stringify([voice, headNumber]);
    let lane = state.lanes.get(identity);
    if (!lane) {
      lane = voice + ' (short chord head ' + headNumber + ')';
      while (state.reserved.has(lane)) lane += '*';
      state.lanes.set(identity, lane);
      state.reserved.add(lane);
    }
    bar.add(lane, event, input);
    return;
  }
  if (first.tieStart !== event.tieStart || first.tieStop !== event.tieStop)
    input.fail('unsupported', 'Partial chord tie.', range);
  (first.pitches ??= [first.pitch!]).push(head!);
  (first.headRanges ??= [first.range]).push(range);
}

/** A hidden rest can have an engraving duration inconsistent with its elapsed duration.
 * Express the elapsed interval as binary skips, retaining its source range and occupying the voice.
 */
function addHiddenRest(bar: Measure, voice: string, event: Event, input: Input) {
  const { numerator, denominator } = event.elapsed;
  if (256n % denominator) input.fail('unsupported', 'Cannot spell invisible rest with binary skips.', event.range);
  let units = numerator * (256n / denominator);
  if (units > 8192n) input.fail('limit', 'Invisible rest exceeds the measure capacity.', event.range);
  let at = event.at;
  while (units > 0n) {
    const size = Math.min(256, 2 ** Math.floor(Math.log2(Number(units))));
    const elapsed = new Time(size, 256);
    bar.add(voice, { ...event, at, elapsed, denominator: 256 / size }, input);
    at = at.plus(elapsed);
    units -= BigInt(size);
  }
}

/** Read one measured note and advance only on the first head in a chord. */
function note(
  node: Element,
  cursor: Time,
  bars: Measure[],
  state: PartState,
  previous: Previous | undefined,
  groups: Map<string, Tuplet>,
  input: Input,
): { cursor: Time; previous?: Previous } {
  const voice = scalar(node, 'voice', input, '1');
  input.context.voice = voice;
  shape(
    node,
    input,
    [
      'chord',
      'pitch',
      'rest',
      ...(input.options.targetProfile === 'expressive' ? ['unpitched'] : []),
      'grace',
      'duration',
      'voice',
      'type',
      'staff',
      'notations',
      'instrument',
      'lyric',
      'dot',
      'beam',
      'stem',
      'notehead',
      'accidental',
      'time-modification',
      'tie',
    ],
    ['default-x', 'default-y', 'print-object'],
  );
  if (node.attributes['default-x'] || node.attributes['default-y'])
    input.omit('Omitted engraved note position.', node.range);
  const expressive = input.options.targetProfile === 'expressive';
  if (!expressive)
    for (const c of node.children) if (c.name === 'lyric' || c.name === 'instrument') omit(c, input);
  if (!voice) input.fail('syntax', 'Empty voice ID.', node.range);
  const staff = integer(scalar(node, 'staff', input, '1'), node.range, input);
  if (!state.ownership.has(voice)) state.ownership.set(voice, staff);
  const owner = state.ownership.get(voice)!;
  if (owner !== staff && !state.piano)
    input.fail('unsupported', 'Cross-staff voice requires a keyboard staff group.', node.range);
  const bar = bars[owner - 1];
  if (!bar || !bars[staff - 1]) input.fail('syntax', 'Note refers to undeclared staff.', node.range);
  const grace = one(node, 'grace', input, true);
  if (grace) {
    if (grace.attributes['make-time'])
      input.fail('unsupported', 'Measured grace playback requires a separate time model.', grace.range);
    if (one(node, 'duration', input, true))
      input.fail('syntax', 'Grace note contains a measured duration.', node.range);
    if (expressive) {
      const source = one(node, 'pitch', input);
      graceNote(node, grace, voice, notePitch(source!, input), state.notation, input);
    } else omit(grace, input);
    return { cursor };
  }
  const duration = elapsed(node, state.divisions, input);
  const chord = one(node, 'chord', input, true);
  const p = one(node, 'pitch', input, true),
    rest = one(node, 'rest', input, true);
  const unpitched = one(node, 'unpitched', input, true);
  if ([p, unpitched, rest].filter(Boolean).length !== 1)
    input.fail('syntax', 'Expected one rest or pitch.', node.range);
  const drum = unpitched && drumHead(node, unpitched, state.instruments, staff, input);
  if (rest) {
    shape(rest, input, ['display-step', 'display-octave'], ['measure']);
    if (rest.children.length) input.omit('Omitted vertical position of a written rest.', rest.range);
  }
  const head = p ? notePitch(p, input) : drum?.display;
  const hidden = node.attributes['print-object'] === 'no';
  if (hidden && head)
    input.fail('unsupported', 'Hidden pitched notes require independent drawing and playback.', node.range);
  const { denominator, dots, actual, normal } = hidden
    ? { denominator: 1, dots: 0, actual: 1, normal: 1 }
    : rhythm(node, duration, input);
  const event: Event = {
    kind: head ? 'attack' : hidden ? 'skip' : 'rest',
    staff,
    at: chord && previous ? previous.event.at : cursor,
    elapsed: duration,
    range: node.range,
    pitch: head,
    denominator,
    dots,
  };
  // Exporters can split hidden tuplet brackets and visible slurs into separate notation groups.
  const groupsOfMarks = node.children.filter((child) => child.name === 'notations');
  for (const group of groupsOfMarks)
    for (const name of Object.keys(group.attributes))
      input.omit('Omitted notations group attribute ' + name + '.', group.range);
  const marks = groupsOfMarks.length < 2 ? groupsOfMarks[0] :
    {...groupsOfMarks[0], children: groupsOfMarks.flatMap(group => group.children)};
  if (expressive) {
    noteMarks(node, event, state.notation, input, !!drum, marks);
    if (drum) headDetail(event).drum = drum.id;
  } else readMarks(node, marks, event, input);
  if (chord) {
    addChordHead(previous, event, voice, bar, state, actual !== normal, input);
    return { cursor, previous };
  }
  if (expressive) principal(event, voice, state.notation, input);
  const index = staff + '/' + voice;
  if (actual !== normal) {
    const begins = marks?.children.some((m) => m.name === 'tuplet' && m.attributes.type === 'start');
    let group = groups.get(index);
    if (group && begins)
      input.fail('unsupported', 'Nested MusicXML tuplets require separate bracket ratios.', node.range);
    if (!group) {
      group = { actual, normal, id: String(node.range[0]) };
      groups.set(index, group);
    }
    if (group.actual !== actual || group.normal !== normal)
      input.fail('unsupported', 'Tuplet ratio changes within a group.', node.range);
    event.tuplets = [group];
    if (marks?.children.some((m) => m.name === 'tuplet' && m.attributes.type === 'stop')) groups.delete(index);
  } else groups.delete(index);
  if (hidden) addHiddenRest(bar, voice, event, input);
  else bar.add(voice, event, input);
  return { cursor: cursor.plus(duration), previous: hidden ? undefined : { event, voice } };
}

/** Only an explicit playback offset on the direction displaces the associated sound. */
function tempoPosition(node: Element, sound: Element, cursor: Time, divisions: number, input: Input) {
  let offset = one(sound, 'offset', input, true);
  if (!offset && sound !== node) {
    const visual = one(node, 'offset', input, true);
    if (visual?.attributes.sound === 'yes') offset = visual;
  }
  const raw = offset?.text.trim() ?? '0';
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(+raw) || (+raw && !divisions))
    input.fail('unsupported', 'Invalid playback tempo offset.', node.range);
  return +raw ? cursor.plus(new Time(+raw, 4 * divisions)) : cursor;
}

type GlobalTempo = Measure['tempos'][number] & { ordinal: number };
/** Read global tempos even if their source part or the preceding movement is excluded. */
function measureTempos(record: BarInput, ordinal: number, divisions: number, tempos: GlobalTempo[], input: Input) {
  const timed = record.children.some(
    (c) =>
      (c.name === 'sound' && c.attributes.tempo) ||
      (c.name === 'direction' && c.children.some((n) => n.name === 'sound' && n.attributes.tempo)),
  );
  let cursor = zero;
  for (const child of record.children) {
    if (child.name === 'attributes') {
      const d = one(child, 'divisions', input, true);
      if (d) divisions = integer(d.text.trim(), d.range, input);
    } else if (timed) {
      if (child.name === 'backup') cursor = cursor.minus(elapsed(child, divisions, input));
      else if (
        child.name === 'forward' ||
        (child.name === 'note' && !child.children.some((n) => n.name === 'grace' || n.name === 'chord'))
      )
        cursor = cursor.plus(elapsed(child, divisions, input));
      const sound = child.name === 'sound' ? child : child.children.find((n) => n.name === 'sound');
      if (sound?.attributes.tempo) {
        const bpm = Number(sound.attributes.tempo);
        if (!Number.isInteger(bpm) || bpm < 1 || bpm > 999)
          input.fail('unsupported', 'Tempo exceeds supported integer range.', sound.range);
        tempos.push({
          ordinal,
          bpm,
          at: tempoPosition(child, sound, cursor, divisions, input),
          range: sound.range,
        });
      }
    }
  }

  return divisions;
}
function scopeTempos(records: BarInput[], input: Input) {
  const tempos: GlobalTempo[] = [];
  let divisions = 0;
  for (const [i, record] of records.entries()) divisions = measureTempos(record, i + 1, divisions, tempos, input);
  return tempos;
}

/** Carry the last global tempo into the new first bar, then rebase the selected changes. */
function applySelectionTempo(bars: Measure[], tempos: GlobalTempo[], first: number, input: Input) {
  const head = bars.filter((b) => b.part === bars[0].part && b.staff === bars[0].staff);
  let carry: GlobalTempo | undefined;
  for (const t of tempos.sort((a, b) => a.ordinal - b.ordinal || a.at.compare(b.at))) {
    if (t.ordinal < first) carry = t;
    else if (t.ordinal < first + head.length) {
      const bar = head[t.ordinal - first];
      if (t.at.compare(zero) < 0 || t.at.compare(bar.extent) >= 0)
        input.fail('unsupported', 'Global tempo outside selected measure.', t.range);
      bar.tempos.push(t);
    }
  }
  if (carry && !head[0].tempos.some((t) => !t.at.compare(zero))) head[0].tempos.push({ ...carry, at: zero });
}

/** Reconstruct one part's shared document cursor before distributing events to their displaying staves. */
function measure(data: BarInput, state: PartState, index: number, input: Input) {
  const node = data.measure,
    label = node.attributes.number ?? String(index + 1);
  input.context = { part: state.id, measure: label };
  for (const name of Object.keys(node.attributes)) {
    if (!['number', 'implicit', 'width', 'non-controlling'].includes(name))
      input.fail('unsupported', 'Unknown measure attribute ' + name + '.', node.range);
  }
  if (node.attributes['non-controlling'] === 'yes')
    input.fail('unsupported', 'Non-controlling measure.', node.range);
  if (node.attributes.width) input.omit('Omitted engraved measure width.', node.range);

  const bars: Measure[] = [];
  function synchronize() {
    for (let i = 0; i < state.clefs.length; i++) {
      const bar = bars[i] ?? new Measure();
      Object.assign(bar, {
        part: state.id,
        staff: i + 1,
        label,
        name: state.name,
        key: state.staffKeys[i] ?? state.key,
        sounds: state.sounds[i] ?? 0,
        group: state.group,
        instrument: state.instruments.staffs[i],
        beats: state.beats,
        beatType: state.beatType,
        clef: state.clefs[i],
        piano: state.piano && state.clefs.length === 2,
        range: node.range,
      });
      bars[i] = bar;
    }
  }
  synchronize();
  let cursor = zero,
    extent = zero,
    lastDivisionChange = zero,
    previous: Previous | undefined;
  const groups = new Map<string, Tuplet>();
  const pending: Directions = [];
  for (const child of data.children) {
    delete input.context.voice;
    if (child.name === 'note') {
      const result = note(child, cursor, bars, state, previous, groups, input);
      cursor = result.cursor;
      previous = result.previous;
    } else {
      previous = undefined;
      if (child.name === 'attributes') {
        const before = state.divisions;
        attributes(child, state, cursor, input, bars);
        if (before !== state.divisions) lastDivisionChange = cursor;
        if (!cursor.compare(zero)) synchronize();
      } else if (child.name === 'backup' || child.name === 'forward') {
        shape(child, input, child.name === 'forward' ? ['duration', 'voice', 'staff'] : ['duration']);
        const delta = elapsed(child, state.divisions, input);
        cursor = child.name === 'forward' ? cursor.plus(delta) : cursor.minus(delta);
        if (cursor.compare(lastDivisionChange) < 0 && lastDivisionChange.compare(zero) > 0)
          input.fail('timing', 'Cursor crosses a mid-measure divisions change.', child.range);
        if (cursor.compare(zero) < 0)
          input.fail('timing', 'Backup crosses the beginning of the measure.', child.range);
      } else if (child.name === 'barline') {
        if (!child.children.some(mark => mark.name === 'repeat' || mark.name === 'ending')) barline(child, input);
      }
      else if (['direction', 'print', 'harmony', 'sound'].includes(child.name)) {
        const sound = child.name === 'sound' ? child : child.children.find((c) => c.name === 'sound');
        const expressiveDirection =
          input.options.targetProfile === 'expressive' && (child.name === 'direction' || child.name === 'harmony');
        if (expressiveDirection) addDirection(child, cursor, state.divisions, pending, input);
        if (sound?.attributes.tempo && includesExtended(input.options)) {
          const tempo = Number(sound.attributes.tempo);
          if (!Number.isInteger(tempo) || tempo < 1 || tempo > 999)
            input.fail('unsupported', 'Tempo exceeds supported integer range.', sound.range);
          const at = tempoPosition(child, sound, cursor, state.divisions, input);
          bars[0].tempos.push({ bpm: tempo, at, range: sound.range });
          if (child !== sound && !expressiveDirection)
            for (const visual of child.children)
              if (!['sound', 'offset'].includes(visual.name))
                input.omit('Retained playback tempo; omitted MusicXML ' + visual.name + ' display.', visual.range);
          if (Object.keys(sound.attributes).some((name) => name !== 'tempo') || sound.children.length)
            input.omit('Retained playback tempo; omitted additional sound settings.', sound.range);
        } else if (!expressiveDirection) omit(child, input);
        else if (sound) omit(sound, input);
      } else input.fail('unsupported', 'Unsupported measure content ' + child.name + '.', child.range);
    }
    if (cursor.compare(extent) > 0) extent = cursor;
  }
  attachDirections(pending, bars, input);
  if (!extent.compare(zero)) input.fail('timing', 'Empty measured timeline.', node.range);
  const length = new Time(state.beats, state.beatType);
  if (extent.compare(length) > 0) input.fail('timing', 'Events exceed the active meter.', node.range);
  const boundary = data.children.some(
    (c) =>
      c.name === 'barline' &&
      c.children.some((s) => s.name === 'repeat' || s.name === 'bar-style' && ['light-light', 'light-heavy'].includes(s.text.trim())),
  );
  const priorShort = state.shortBar;
  const split = priorShort && label === priorShort.label + 'a' && extent.plus(priorShort.extent).compare(length) === 0;
  if (split) for (const prior of priorShort.bars) {
    prior.extent = priorShort.extent;
    if (!prior.pickup) prior.fragment = priorShort.extent;
  }
  state.shortBar = extent.compare(length) < 0 ? {label, extent, bars} : undefined;
  for (const bar of bars) {
    bar.changes.sort((a, b) => a.at.compare(b.at));
    const writtenPositions = new Set<string>();
    for (const change of bar.changes) {
      const position = change.kind + ':' + change.at.numerator + '/' + change.at.denominator;
      if (writtenPositions.has(position))
        input.fail('unsupported', 'Duplicate simultaneous ' + change.kind + ' change.', change.range);
      writtenPositions.add(position);
      if (change.at.compare(extent) >= 0)
        input.fail('unsupported', 'Staff change outside this measure.', change.range);
      if (change.kind === 'clef') state.clefs[bar.staff - 1] = String(change.value);
      else if (change.kind === 'key') state.staffKeys[bar.staff - 1] = String(change.value);
      else state.sounds[bar.staff - 1] = Number(change.value);
    }
    for (const t of bar.tempos)
      if (t.at.compare(zero) < 0 || t.at.compare(extent) >= 0)
        input.fail('unsupported', 'Tempo outside this measure.', t.range);
    for (const events of bar.voices.values())
      for (const event of events) {
        const display = bars[event.staff - 1];
        let key = display.key,
          sounds = display.sounds;
        for (const change of display.changes) {
          if (change.at.compare(event.at) > 0) continue;
          if (change.kind === 'key') key = String(change.value);
          else if (change.kind === 'sounds') sounds = Number(change.value);
        }
        event.key = key;
        for (const p of event.pitches ?? (event.pitch ? [event.pitch] : [])) p.sounding += sounds;
        if (input.options.targetProfile === 'expressive') checkPositions(event, state.instruments, input);
      }
    if (!bar.voices.size) bar.voices.set('1', []);
    bar.instrument = state.instruments.staffs[bar.staff - 1];
    bar.extent = length;
    const complement = boundary && state.pickup && extent.plus(state.pickup).compare(length) === 0;
    if (extent.compare(length) < 0 && (node.attributes.implicit === 'yes' || (index === 0 && label === '0') || complement || split)) {
      bar.extent = extent;
      if (index === 0) {
        bar.pickup = extent;
        state.pickup = extent;
      } else bar.fragment = extent;
    }
  }
  return bars;
}

/** Check ties against adjacent attacks in musical time before emitting the target's stop marks. */
function validateTies(bars: Measure[], input: Input) {
  const active = new Map<string, { event: Event; until: Time }>();
  const starts = new Map<number, Time>();
  const heads = (event: Event) =>
    (event.pitches ?? (event.pitch ? [event.pitch] : []))
      .map((h) => h.step + ':' + h.alter + ':' + h.octave)
      .sort()
      .join('/');
  for (const bar of bars) {
    const start = starts.get(bar.staff) ?? zero;
    for (const [voice, events] of bar.voices) {
      const key = JSON.stringify([bar.staff, voice]);
      input.context = { part: bar.part, measure: bar.label, voice };
      for (const event of [...events].sort((a, b) => a.at.compare(b.at))) {
        const prior = active.get(key);
        if (
          event.tieStop &&
          (!prior || heads(prior.event) !== heads(event) || prior.until.compare(start.plus(event.at)))
        )
          input.fail('unsupported', 'Tie stop without adjacent matching pitches.', event.range);
        if (prior && !event.tieStop)
          input.fail('unsupported', 'Tie start without matching stop.', prior.event.range);
        if (event.tieStart) active.set(key, { event, until: start.plus(event.at).plus(event.elapsed) });
        else active.delete(key);
      }
    }
    starts.set(bar.staff, start.plus(bar.extent));
  }
  for (const { event } of active.values())
    input.fail('unsupported', 'Tie extends beyond the selected score.', event.range);
}

/** Build the ordered part registry once, sharing a group identity across its members. */
function definitions(list: Element, input: Input) {
  const states = new Map<string, PartState>();
  let activeGroup: Measure['group'];
  let groupNumber: string | undefined;
  for (const def of list.children) {
    if (def.name === 'part-group') {
      if (includesExtended(input.options)) {
        if (def.attributes.type === 'start') {
          if (groupNumber !== undefined) input.fail('unsupported', 'Nested staff groups.', def.range);
          groupNumber = def.attributes.number ?? '1';
          const glyph = one(def, 'group-symbol', input, true);
          const symbol = glyph?.text.trim() ?? 'none';
          if (glyph && Object.keys(glyph.attributes).length)
            input.omit('Omitted group-symbol positioning.', glyph.range);
          if (symbol === 'brace' || symbol === 'bracket') activeGroup = { symbol, parts: [] };
          else
            input.omit(
              'The ' + symbol + ' staff group has no matching target delimiter; conductor defaults apply.',
              glyph?.range ?? def.range,
            );
          for (const c of def.children) if (c.name !== 'group-symbol') omit(c, input);
        } else if (def.attributes.type === 'stop' && (def.attributes.number ?? '1') === groupNumber) {
          activeGroup = undefined;
          groupNumber = undefined;
        } else input.fail('syntax', 'Unmatched staff group boundary.', def.range);
      } else omit(def, input);
      continue;
    }
    const id = def.attributes.id;
    if (def.name !== 'score-part' || !id || states.has(id))
      input.fail('syntax', 'Invalid or duplicate part definition.', def.range);
    activeGroup?.parts.push(id);
    const name = one(def, 'part-name', input)!;
    const instruments = instrumentState();
    const expressive = input.options.targetProfile === 'expressive';
    if (expressive) instrumentDefinitions(def, instruments, input);
    for (const c of def.children)
      if (c !== name && !(expressive && ['midi-instrument', 'score-instrument'].includes(c.name))) omit(c, input);
    const piano = def.children.some(
      (c) =>
        c.name === 'score-instrument' &&
        c.children.some(
          (i) => i.name === 'instrument-sound' && /^keyboard\.(?:piano|fortepiano)(?:\.|$)/.test(i.text.trim()),
        ),
    );
    states.set(id, {
      instruments,
      notation: notationState(),
      id,
      name: name.text.trim(),
      divisions: 0,
      key: 'C',
      beats: 4,
      beatType: 4,
      clefs: ['treble'],
      staffKeys: [],
      sounds: [],
      group: activeGroup,
      piano,
      ownership: new Map(),
      reserved: new Set(),
      lanes: new Map(),
    });
  }
  if (groupNumber !== undefined) input.fail('syntax', 'Unclosed staff group.', list.range);
  if (!states.size) input.fail('syntax', 'Missing part definitions.', list.range);
  return states;
}

/** Read the state at the selection boundary in musical order, including measures with backups. */
function carryMeasure(prior: BarInput, state: PartState, input: Input) {
  let at = zero,
    divisions = state.divisions;
  const changes: { at: Time; node: Element }[] = [];
  for (const child of prior.children) {
    if (child.name === 'attributes') {
      changes.push({ at, node: child });
      const d = one(child, 'divisions', input, true);
      if (d) divisions = integer(d.text.trim(), d.range, input);
    }
    if (child.name === 'backup') at = at.minus(elapsed(child, divisions, input));
    if (
      child.name === 'forward' ||
      (child.name === 'note' && !child.children.some((n) => n.name === 'grace' || n.name === 'chord'))
    )
      at = at.plus(elapsed(child, divisions, input));
  }
  for (const change of changes.sort((a, b) => a.at.compare(b.at))) attributes(change.node, state, zero, input);
}
/** Normalize a selected part and discard its XML elements before processing the next part. */
function readPart(
  all: BarInput[],
  state: PartState,
  input: Input,
  selection: MusicXMLOptions['selection'],
  range: TextRange,
) {
  const first = selection?.firstMeasure ?? 1,
    last = selection?.lastMeasure ?? all.length;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first < 1 ||
    last < first ||
    last > all.length
  )
    input.fail('syntax', 'Invalid inclusive one-based measure selection.', range);
  for (let i = 0; i < first - 1; i++) carryMeasure(all[i], state, input);
  const records = all.slice(first - 1, last);
  if (!records.length) input.fail('syntax', 'Missing part ' + state.id + '.', range);
  for (const record of records)
    for (const child of record.children)
      if (child.name === 'note') state.reserved.add(scalar(child, 'voice', input, '1'));
  const partBars: Measure[] = [];
  for (let i = 0; i < records.length; i++) partBars.push(...measure(records[i], state, i, input));

  return finishPart(partBars, state, range, input);
}

/** Pair boundaries on the complete selected voice after each XML measure has released its element tree. */
function finishPart(
  partBars: Measure[],
  state: PartState,
  range: TextRange,
  input: Input,
) {
  if (input.options.targetProfile === 'expressive') {
    for (const bar of partBars) {
      const instrument = state.instruments.staffs[bar.staff - 1];
      if (instrument && !bar.instrument) {
        if ([...bar.voices.values()].some((events) => events.some((e) => e.pitch)))
          input.fail('unsupported', 'Instrument kind changes after the first pitched attack.', bar.range ?? range);
        // A part may begin with several bars of rest before its first percussion hit declares its display map.
        bar.instrument = instrument;
      }
    }
    finishNotation(partBars, state.notation, input);
  } else validateTies(partBars, input);
  return partBars;
}

/** Normalize each representation to ordered part-measure records before interpreting music. */
function readScore(
  root: Element,
  input: Input,
  selection?: MusicXMLOptions['selection'],
  resolved?: Map<string, Measure[]>,
  registry?: Map<string, PartState>,
  tempos: GlobalTempo[] = [],
  form: Boundaries = new Map(),
): [Measure[], TextRange] {
  if (
    !['score-timewise', 'score-partwise'].includes(root.name) ||
    !['3.0', '3.1', '4.0'].includes(root.attributes.version)
  )
    input.fail('unsupported', 'Expected partwise or timewise MusicXML 3.0, 3.1 or 4.0.', root.range);
  const timewise = root.name === 'score-timewise';
  const structural = timewise ? 'measure' : 'part';
  shape(
    root,
    input,
    [structural, 'part-list', 'identification', 'defaults', 'work', 'credit', 'movement-title', 'movement-number'],
    ['version', 'xmlns'],
  );
  if (root.attributes.xmlns && root.attributes.xmlns !== 'http://www.musicxml.org/ns/musicxml')
    input.fail('unsupported', 'Unknown score namespace.', root.range);
  const list = one(root, 'part-list', input)!;
  for (const child of root.children) {
    if (child.name === structural || child === list) continue;
    if (['identification', 'defaults', 'work', 'credit', 'movement-title', 'movement-number'].includes(child.name))
      omit(child, input);
    else input.fail('unsupported', 'Unsupported score content ' + child.name + '.', child.range);
  }
  const states = registry ?? definitions(list, input);
  if (selection?.parts && (!selection.parts.length || selection.parts.some((id) => !states.has(id))))
    input.fail('syntax', 'The selected part IDs must exist in the part list.', list.range);
  if (resolved) {
    const all: Measure[] = [];
    for (const state of states.values()) {
      if (!resolved.has(state.id)) input.fail('syntax', 'Missing score part.', list.range);
      all.push(...resolved.get(state.id)!);
    }
    return [all, root.range];
  }
  const data = new Map([...states.keys()].map((id) => [id, [] as BarInput[]]));
  for (const block of root.children.filter((c) => c.name === 'measure')) {
    const seen = new Set<string>();
    for (const part of block.children) {
      const id = part.attributes.id;
      if (part.name !== 'part' || !data.has(id) || seen.has(id))
        input.fail('syntax', 'Unmatched or duplicate timewise part.', part.range);
      seen.add(id);
      data.get(id)!.push({ measure: block, children: part.children });
    }
    if (seen.size !== data.size) input.fail('unsupported', 'Missing part from timewise measure.', block.range);
  }
  const bars: Measure[] = [];
  for (const state of states.values()) {
    for (const [index, record] of data.get(state.id)!.entries()) {
      if (index + 1 > (selection?.lastMeasure ?? Infinity)) continue;
      input.context = {part:state.id, measure:record.measure.attributes.number};
      collectForm(record.children, index + 1, form, selection?.firstMeasure ?? 1, input);
    }
    if (selection && includesExtended(input.options)) tempos.push(...scopeTempos(data.get(state.id)!, input));
    if (selection?.parts && !selection.parts.includes(state.id)) continue;
    bars.push(...readPart(data.get(state.id)!, state, input, selection, root.range));
  }
  return [bars, root.range];
}

/** The active part keeps normalized bars, two division clocks and the repeat state at a selected boundary. */
interface StreamingPart {
  state: PartState;
  selected: boolean;
  divisions: number;
  count: number;
  bars: Measure[];
}

/** Incrementally build partwise music while preserving the document offsets and root validation of timewise scores. */
export function musicXMLReader(size: number, asText: boolean, input: Input, options: MusicXMLOptions) {
  const form: Boundaries = new Map();
  const resolved = new Map<string, Measure[]>(),
    tempos: GlobalTempo[] = [];
  let registry: Map<string, PartState> | undefined;
  // The expressive reader preserves short chord heads in-place, so it can normalize each measure on arrival.
  // Older profiles reserve every source voice ID first to allocate collision-free synthetic chord voices.
  const stream = options.targetProfile === 'expressive';
  const selection = options.selection,
    first = selection?.firstMeasure ?? 1,
    last = selection?.lastMeasure ?? Infinity;
  if (
    stream &&
    (!Number.isSafeInteger(first) ||
      first < 1 ||
      (selection?.lastMeasure !== undefined && (!Number.isSafeInteger(last) || last < first)))
  )
    input.fail('syntax', 'Invalid inclusive one-based measure selection.', [0, 0]);
  let current: StreamingPart | undefined;
  function streamMeasure(node: Element, part: Element, ordinal: number) {
    if (!current) {
      const id = part.attributes.id,
        state = registry?.get(id);
      if (!state || resolved.has(id)) return input.fail('syntax', 'Unmatched or duplicate part ID.', part.range);
      current = {
        state,
        selected: !selection?.parts || selection.parts.includes(id),
        divisions: 0,
        count: 0,
        bars: [],
      };
    }
    current.count = ordinal;
    const record = { measure: node, children: node.children };
    if (ordinal <= last) {
      input.context = {part:current.state.id, measure:node.attributes.number};
      collectForm(node.children, ordinal, form, first, input);
    }
    if (selection && ordinal <= last)
      current.divisions = measureTempos(record, ordinal, current.divisions, tempos, input);
    if (!current.selected || ordinal > last) return;
    if (ordinal < first) carryMeasure(record, current.state, input);
    else current.bars.push(...measure(record, current.state, ordinal - first, input));
  }
  const tree = treeReader(
    size,
    asText,
    input,
    options.selection,
    (node, root) => {
      if (root.name !== 'score-partwise') return;
      if (node.name === 'part-list') {
        registry = definitions(node, input);
      } else if (node.name === 'part') {
        const id = node.attributes.id,
          state = registry?.get(id);
        if (!state || resolved.has(id)) input.fail('syntax', 'Unmatched or duplicate part ID.', node.range);
        shape(node, input, ['measure'], ['id']);
        if (stream) {
          if (!current) return input.fail('syntax', 'Empty part.', node.range);
          if (
            current.selected &&
            (first > current.count || (selection?.lastMeasure !== undefined && last > current.count))
          )
            input.fail('syntax', 'Invalid inclusive one-based measure selection.', node.range);
          resolved.set(
            id,
            current.selected ? finishPart(current.bars, current.state, node.range, input) : [],
          );
          current = undefined;
          return;
        }
        if (!node.children.length) input.fail('syntax', 'Empty part.', node.range);
        const selected = !options.selection?.parts || options.selection.parts.includes(id);
        const records = node.children.map((measure) => ({ measure, children: measure.children }));
        for (const [i, record] of records.entries()) if (i+1 <= last) {
          input.context = {part:id, measure:record.measure.attributes.number};
          collectForm(record.children, i+1, form, first, input);
        }
        if (options.selection && includesExtended(options)) tempos.push(...scopeTempos(records, input));
        const bars = selected ? readPart(records, state!, input, options.selection, node.range) : [];
        resolved.set(id, bars);
        node.children = [];
      }
    },
    stream ? streamMeasure : undefined,
  );
  function finish(): [Measure[], TextRange] {
    const root = tree.finish();
    input.context = {};
    const [bars, range] = readScore(
      root,
      input,
      options.selection,
      root.name === 'score-partwise' ? resolved : undefined,
      registry,
      tempos,
      form,
    );
    if (form.size) {
      const staves = groupStaves(bars);
      const reference = staves.values().next().value!;
      for (const staff of staves.values()) {
        if (staff.length !== reference.length || staff.some((bar,i) => bar.extent.compare(reference[i].extent)))
          input.fail('unsupported', 'Shared MusicXML repeats require coincident measure boundaries.', staff[0].range ?? range);
        normalizeForm(staff, form, first, range, input);
      }
    }
    if (options.selection && includesExtended(options))
      applySelectionTempo(bars, tempos, options.selection.firstMeasure ?? 1, input);
    return [bars, range];
  }
  return { tree, finish };
}
