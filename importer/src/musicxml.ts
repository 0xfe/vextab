// Normalize partwise and timewise MusicXML to exact measured voices in source part order.
import { convert, Input, keys, Measure, meter, pitch } from './score.js';
import { Time, zero } from './time.js';
import type { Event } from './score.js';
import type { ImportOptions, ImportResult, TextRange } from './types.js';
import { one, readTree, scalar, shape, sourceText } from './xml.js';
import type { Element } from './xml.js';
export type { ImportedDocument, ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';

/** Independent state persists at bar boundaries even if divisions change within a measure. */
interface PartState {
  id: string;
  name: string;
  divisions: number;
  key: string;
  beats: number;
  beatType: number;
  clefs: string[];
  piano: boolean;
  ownership: Map<string, number>;
  pickup?: Time;
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
function attributes(node: Element, state: PartState, cursor: Time, input: Input) {
  shape(node, input, ['divisions', 'key', 'time', 'clef', 'staves']);
  for (const child of node.children) {
    if (child.name === 'divisions') {
      state.divisions = integer(scalar(node, 'divisions', input), child.range, input);
      continue;
    }
    if (cursor.compare(zero)) input.fail('unsupported', 'Mid-measure ' + child.name + ' change.', child.range);
    if (child.name === 'key') {
      shape(child, input, ['fifths', 'mode']);
      const fifths = scalar(child, 'fifths', input);
      const mode = scalar(child, 'mode', input, 'major');
      if (!/^-?[0-7]$/.test(fifths) || !['major', 'minor'].includes(mode))
        input.fail('unsupported', 'Unsupported key signature.', child.range);
      const minor = [
        'Abm',
        'Ebm',
        'Bbm',
        'Fm',
        'Cm',
        'Gm',
        'Dm',
        'Am',
        'Em',
        'Bm',
        'F#m',
        'C#m',
        'G#m',
        'D#m',
        'A#m',
      ];
      state.key = (mode === 'minor' ? minor : keys)[7 + +fifths];
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
    } else {
      shape(child, input, ['sign', 'line'], ['number']);
      const number = integer(child.attributes.number ?? '1', child.range, input);
      const code = scalar(child, 'sign', input) + scalar(child, 'line', input);
      const clef = ({ G2: 'treble', F4: 'bass', C3: 'alto', C4: 'tenor' } as Record<string, string>)[code];
      if (!clef || number > state.clefs.length)
        input.fail('unsupported', 'Unsupported clef or staff.', child.range);
      state.clefs[number - 1] = clef;
    }
  }
}

/** Derive omitted note types only when an exact binary or dotted spelling exists. */
function rhythm(node: Element, duration: Time, input: Input) {
  const type = one(node, 'type', input, true);
  const dots = node.children.filter((c) => c.name === 'dot').length;
  const ratio = one(node, 'time-modification', input, true);
  let actual = 1,
    normal = 1;
  if (ratio) {
    shape(ratio, input, ['actual-notes', 'normal-notes']);
    actual = integer(scalar(ratio, 'actual-notes', input), ratio.range, input);
    normal = integer(scalar(ratio, 'normal-notes', input), ratio.range, input);
  }
  for (let i = 0; i < values.length; i++) {
    if (type && scalar(node, 'type', input) !== values[i]) continue;
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
      'grace',
      'duration',
      'voice',
      'type',
      'staff',
      'notations',
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
    omit(grace, input);
    return { cursor };
  }
  const duration = elapsed(node, state.divisions, input);
  const chord = one(node, 'chord', input, true);
  const p = one(node, 'pitch', input, true),
    rest = one(node, 'rest', input, true);
  if (Boolean(p) === Boolean(rest)) input.fail('syntax', 'Expected one rest or pitch.', node.range);
  if (rest) shape(rest, input, [], ['measure']);
  const head = p && notePitch(p, input);
  const hidden = node.attributes['print-object'] === 'no';
  if (hidden && p)
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
  const marks = one(node, 'notations', input, true);
  readMarks(node, marks, event, input);
  if (chord) {
    addChordHead(previous, event, voice, bar, state, actual !== normal, input);
    return { cursor, previous };
  }
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

/** Decode repeat barlines at their declared measure edge. Keep other barline styles visible as losses. */
function barline(node: Element, bars: Measure[], input: Input) {
  shape(node, input, ['bar-style', 'repeat'], ['location']);
  const repeat = one(node, 'repeat', input, true);
  if (!repeat) {
    if (scalar(node, 'bar-style', input, 'regular') !== 'regular') omit(node, input);
    return;
  }
  const location = node.attributes.location ?? 'right';
  const count = integer(repeat.attributes.times ?? '2', repeat.range, input);
  if (count !== 2)
    input.fail('unsupported', 'Repeat counts other than two require an explicit repeat block.', repeat.range);
  for (const bar of bars) {
    if (repeat.attributes.direction === 'forward' && location === 'left') bar.repeatStart = count;
    else if (repeat.attributes.direction === 'backward' && location === 'right') bar.repeatEnd = true;
    else input.fail('unsupported', 'Repeat at unsupported measure edge.', repeat.range);
  }
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
        key: state.key,
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
        attributes(child, state, cursor, input);
        if (before !== state.divisions) lastDivisionChange = cursor;
        synchronize();
      } else if (child.name === 'backup' || child.name === 'forward') {
        shape(child, input, child.name === 'forward' ? ['duration', 'voice', 'staff'] : ['duration']);
        const delta = elapsed(child, state.divisions, input);
        cursor = child.name === 'forward' ? cursor.plus(delta) : cursor.minus(delta);
        if (cursor.compare(lastDivisionChange) < 0 && lastDivisionChange.compare(zero) > 0)
          input.fail('timing', 'Cursor crosses a mid-measure divisions change.', child.range);
        if (cursor.compare(zero) < 0)
          input.fail('timing', 'Backup crosses the beginning of the measure.', child.range);
      } else if (child.name === 'barline') barline(child, bars, input);
      else if (['direction', 'print', 'harmony', 'sound'].includes(child.name)) {
        const sound = child.name === 'sound' ? child : child.children.find((c) => c.name === 'sound');
        if (
          sound &&
          Object.keys(sound.attributes).some((k) =>
            ['dacapo', 'dalsegno', 'tocoda', 'fine', 'forward-repeat'].includes(k),
          )
        )
          input.fail('unsupported', 'Sound navigation changes the performed measure sequence.', sound.range);
        omit(child, input);
      } else input.fail('unsupported', 'Unsupported measure content ' + child.name + '.', child.range);
    }
    if (cursor.compare(extent) > 0) extent = cursor;
  }
  if (!extent.compare(zero)) input.fail('timing', 'Empty measured timeline.', node.range);
  const length = new Time(state.beats, state.beatType);
  if (extent.compare(length) > 0) input.fail('timing', 'Events exceed the active meter.', node.range);
  const boundary = data.children.some(
    (c) =>
      c.name === 'barline' &&
      c.children.some((s) => s.name === 'bar-style' && ['light-light', 'light-heavy'].includes(s.text.trim())),
  );
  for (const bar of bars) {
    if (!bar.voices.size) bar.voices.set('1', []);
    bar.extent = length;
    const complement = boundary && state.pickup && extent.plus(state.pickup).compare(length) === 0;
    if (extent.compare(length) < 0 && (node.attributes.implicit === 'yes' || complement)) {
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

/** Normalize each representation to ordered part-measure records before interpreting music. */
function readScore(root: Element, input: Input): [Measure[], TextRange] {
  if (
    !['score-timewise', 'score-partwise'].includes(root.name) ||
    !['3.1', '4.0'].includes(root.attributes.version)
  )
    input.fail('unsupported', 'Expected partwise or timewise MusicXML 3.1 or 4.0.', root.range);
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
  const data = new Map<string, BarInput[]>(),
    states: PartState[] = [];
  for (const def of list.children) {
    if (def.name === 'part-group') {
      omit(def, input);
      continue;
    }
    const id = def.attributes.id;
    if (def.name !== 'score-part' || !id || data.has(id))
      input.fail('syntax', 'Invalid or duplicate part definition.', def.range);
    const name = one(def, 'part-name', input)!;
    for (const c of def.children) if (c !== name) omit(c, input);
    const piano = def.children.some(
      (c) =>
        c.name === 'score-instrument' &&
        c.children.some(
          (i) => i.name === 'instrument-sound' && /^keyboard\.(?:piano|fortepiano)(?:\.|$)/.test(i.text.trim()),
        ),
    );
    states.push({
      id,
      name: name.text.trim(),
      divisions: 0,
      key: 'C',
      beats: 4,
      beatType: 4,
      clefs: ['treble'],
      piano,
      ownership: new Map(),
      reserved: new Set(),
      lanes: new Map(),
    });
    data.set(id, []);
  }
  if (!states.length) input.fail('syntax', 'Missing part definitions.', list.range);
  for (const block of root.children.filter((c) => c.name === structural)) {
    if (timewise) {
      const seen = new Set<string>();
      for (const part of block.children) {
        const id = part.attributes.id;
        if (part.name !== 'part' || !data.has(id) || seen.has(id))
          input.fail('syntax', 'Unmatched or duplicate timewise part.', part.range);
        seen.add(id);
        data.get(id)!.push({ measure: block, children: part.children });
      }
      if (seen.size !== data.size) input.fail('unsupported', 'Missing part from timewise measure.', block.range);
    } else {
      const records = data.get(block.attributes.id);
      if (!records || records.length) input.fail('syntax', 'Unmatched or duplicate part ID.', block.range);
      shape(block, input, ['measure'], ['id']);
      if (!block.children.length) input.fail('syntax', 'Empty part.', block.range);
      for (const m of block.children) records!.push({ measure: m, children: m.children });
    }
  }
  const bars = [];
  for (const state of states) {
    const records = data.get(state.id)!;
    if (!records.length) input.fail('syntax', 'Missing part ' + state.id + '.', list.range);
    for (const record of records)
      for (const child of record.children)
        if (child.name === 'note') state.reserved.add(scalar(child, 'voice', input, '1'));
    const partBars: Measure[] = [];
    for (let i = 0; i < records.length; i++) partBars.push(...measure(records[i], state, i, input));
    validateTies(partBars, input);
    // An unpaired first backward repeat in MusicXML starts at the beginning of the work.
    for (const staff of new Set(partBars.map((bar) => bar.staff))) {
      const staffBars = partBars.filter((bar) => bar.staff === staff);
      const first = staffBars.find((bar) => bar.repeatStart || bar.repeatEnd);
      if (first?.repeatEnd && !first.repeatStart) staffBars[0].repeatStart = 2;
    }
    bars.push(...partBars);
  }
  return [bars, root.range];
}

/** Convert decoded text, UTF-8 bytes or BOM/signature-detected UTF-16 into editable VexTab. */
export function importMusicXML(source: string | Uint8Array, options: ImportOptions = {}): ImportResult {
  return convert(options, 'score.musicxml', (input) =>
    readScore(readTree(sourceText(source, input), input), input),
  );
}
