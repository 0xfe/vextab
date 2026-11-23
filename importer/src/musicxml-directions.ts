// Place staff/voice directions and harmony on exact rational positions after MusicXML backups have been resolved.
import type { Expression } from './expression.js';
import type { Event, Input, Measure } from './score.js';
import { Time } from './time.js';
import { one, scalar, type Element } from './xml.js';
import { attributesExcept, expression, numberIn, omitElement, span } from './musicxml-expression.js';

interface Anchor {
  node: Element;
  at: Time;
  staff: number;
  voice?: string;
  apply: (event: Event, atEnd: boolean) => void;
  allowEnd?: boolean;
}
export type Directions = Anchor[];
const qualities: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'augmented-seventh': 'aug7',
  'half-diminished': 'm7b5',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'major-11th': 'maj11',
  'minor-11th': 'm11',
  'dominant-13th': '13',
  'major-13th': 'maj13',
  'minor-13th': 'm13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
};

function chordPitch(node: Element, input: Input) {
  const step = scalar(node, node.name + '-step', input),
    alter = numberIn(scalar(node, node.name + '-alter', input, '0'), -1, 1, node, input);
  if (!/^[A-G]$/.test(step)) input.fail('unsupported', 'Unsupported harmony root or bass.', node.range);
  return step + (alter < 0 ? 'b' : alter > 0 ? '#' : '');
}
function frame(node: Element, e: Event, input: Input) {
  const count = Number(scalar(node, 'frame-strings', input));
  if (!Number.isInteger(count) || count < 4 || count > 8)
    return input.omit('Diagram requires four to eight strings.', node.range);
  attributesExcept(node, [], input);
  const frets: (number | 'x')[] = Array(count).fill('x');
  const ends: { fret: number; string: number; type: string }[] = [];
  for (const c of node.children) {
    if (c.name !== 'frame-note') {
      if (!['frame-strings', 'frame-frets', 'first-fret'].includes(c.name)) omitElement(c, input);
      continue;
    }
    const string = numberIn(scalar(c, 'string', input), 1, count, c, input),
      fret = numberIn(scalar(c, 'fret', input), 0, 99, c, input);
    frets[count - string] = fret;
    for (const mark of c.children) {
      if (mark.name === 'barre') ends.push({ fret, string, type: mark.attributes.type });
      else if (!['string', 'fret'].includes(mark.name)) omitElement(mark, input);
    }
  }
  const stopped = frets.filter((f): f is number => typeof f === 'number' && f > 0);
  const first = Math.max(...stopped) > 4 ? Math.min(...stopped) : 1;
  if (
    Math.max(...stopped) - first >= 4 ||
    Number(scalar(node, 'first-fret', input, String(first))) !== first ||
    Number(scalar(node, 'frame-frets', input, '4')) !== 4
  )
    return input.omit('Frame extent differs from the target four-fret diagram.', node.range);
  if (frets.every((f) => f === 'x')) return input.omit('Empty chord diagram.', node.range);
  const independent =
    !e.headDetails?.length ||
    !e.headDetails.every((h) => h.string !== undefined && h.fret === frets[count - h.string]) ||
    frets.some((f, i) => f !== 'x' && !e.headDetails?.some((h) => h.string === count - i && h.fret === f));
  let barre: [number, number, number] | undefined;
  if (ends.length) {
    const [lo, hi] = [...ends].sort((a, b) => b.string - a.string);
    if (
      ends.length !== 2 ||
      lo.type === hi.type ||
      lo.fret !== hi.fret ||
      frets.slice(count - lo.string, count - hi.string + 1).some((f) => typeof f !== 'number' || f < lo.fret)
    )
      return input.omit('Unsupported chord-frame barre endpoints.', node.range);
    barre = [lo.fret, lo.string, hi.string];
  }
  expression(e).frame = { frets, barre, independent };
}
/** Read mark positions in divisions at the moment the source direction was encountered. */
export function addDirection(node: Element, at: Time, divisions: number, pending: Directions, input: Input) {
  const offset = one(node, 'offset', input, true);
  if (offset) {
    const raw = offset.text.trim();
    if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(+raw) || !divisions)
      input.fail('unsupported', 'Invalid direction offset.', offset.range);
    at = at.plus(new Time(+raw, 4 * divisions));
  }
  const staff = numberIn(scalar(node, 'staff', input, '1'), 1, 8, node, input),
    voice = one(node, 'voice', input, true)?.text.trim();
  const queue = (source: Element, apply: Anchor['apply'], allowEnd = false) =>
    pending.push({ at, staff, voice, node: source, apply, allowEnd });
  if (node.name === 'harmony') {
    attributesExcept(node, [], input);
    const root = one(node, 'root', input, true),
      kind = one(node, 'kind', input, true),
      bass = one(node, 'bass', input, true);
    if (!root || !kind) return input.omit('Harmony needs a single explicit root and chord kind.', node.range);
    const label = kind.attributes.text;
    let quality = label ?? (Object.hasOwn(qualities, kind.text.trim()) ? qualities[kind.text.trim()] : undefined);
    attributesExcept(kind, ['text'], input);
    for (const degree of node.children.filter((c) => c.name === 'degree')) {
      const value = scalar(degree, 'degree-value', input),
        alter = scalar(degree, 'degree-alter', input),
        type = scalar(degree, 'degree-type', input);
      if (
        quality === undefined ||
        !/^([1-9]|1[0-3])$/.test(value) ||
        !['-1', '0', '1'].includes(alter) ||
        !['add', 'alter', 'subtract'].includes(type)
      ) {
        omitElement(degree, input);
        continue;
      }
      const sign = +alter < 0 ? 'b' : +alter > 0 ? '#' : '',
        action = type === 'subtract' ? 'no' : type === 'add' ? 'add' : '';
      quality += '(' + action + sign + value + ')';
    }
    if (quality === undefined) return input.omit('Unsupported harmony kind ' + kind.text.trim() + '.', kind.range);
    const harmony = { root: chordPitch(root, input), quality, bass: bass && chordPitch(bass, input) };
    const diagram = one(node, 'frame', input, true);
    for (const c of node.children)
      if (!['root', 'kind', 'bass', 'frame', 'offset', 'staff', 'degree'].includes(c.name)) omitElement(c, input);
    queue(node, (e) => {
      if (expression(e).harmony) return input.omit('Multiple harmony labels at one attack.', node.range);
      expression(e).harmony = harmony;
      if (diagram) frame(diagram, e, input);
    });
    return;
  }
  attributesExcept(node, [], input);
  for (const type of node.children) {
    if (type.name !== 'direction-type') {
      if (!['sound', 'staff', 'voice', 'offset'].includes(type.name)) omitElement(type, input);
      continue;
    }
    for (const mark of type.children) {
      if (mark.name === 'words') {
        attributesExcept(mark, [], input);
        if (!mark.text.trim() || mark.children.length) {
          omitElement(mark, input);
          continue;
        }
        queue(mark, (e) => {
          if (expression(e).label !== undefined)
            return input.omit('Multiple direction texts at one attack.', mark.range);
          expression(e).label = mark.text;
        });
      } else if (mark.name === 'dynamics') {
        attributesExcept(mark, [], input);
        for (const dynamic of mark.children) {
          if (!['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'].includes(dynamic.name)) {
            omitElement(dynamic, input);
            continue;
          }
          queue(dynamic, (e) => {
            if (expression(e).dynamic) input.omit('Multiple dynamics at one attack.', dynamic.range);
            expression(e).dynamic = dynamic.name as Expression['dynamic'];
          });
        }
      } else if (mark.name === 'wedge') {
        attributesExcept(mark, ['type', 'number', 'niente'], input);
        const type = mark.attributes.type;
        if (!['crescendo', 'diminuendo', 'stop'].includes(type)) {
          omitElement(mark, input);
          continue;
        }
        queue(mark, (e) =>
          span(e, {
            range: mark.range,
            kind: type === 'diminuendo' ? 'diminuendo' : 'crescendo',
            id: mark.attributes.number ?? '1',
            edge: type === 'stop' ? 'stop' : 'start',
            niente: mark.attributes.niente === 'yes',
          }),
        );
      } else if (mark.name === 'pedal') {
        attributesExcept(mark, ['type', 'number'], input);
        if (mark.attributes.number && mark.attributes.number !== '1') {
          omitElement(mark, input);
          continue;
        }
        const action = ({ start: 'down', stop: 'up' } as const)[mark.attributes.type as 'start' | 'stop'];
        if (!action) {
          omitElement(mark, input);
          continue;
        }
        queue(
          mark,
          (e, atEnd) => {
            (expression(e).pedal ??= []).push(action);
            if (action === 'up') expression(e).pedalUpAtOnset = !atEnd;
          },
          action === 'up',
        );
      } else omitElement(mark, input);
    }
  }
}
/** A staff direction without a voice attaches once to the first matching voice in document order. */
export function attachDirections(pending: Directions, bars: Measure[], input: Input) {
  if (!pending.length) return;
  const starts = new Map<string, Event>(),
    ends = new Map<string, Event>();
  const key = (staff: number, voice: string | undefined, at: Time) =>
    JSON.stringify([staff, voice, String(at.numerator), String(at.denominator)]);
  for (const bar of bars)
    for (const [voice, events] of bar.voices)
      for (const event of events) {
        if (event.kind === 'skip') continue;
        for (const lane of [undefined, voice]) {
          const start = key(event.staff, lane, event.at),
            end = key(event.staff, lane, event.at.plus(event.elapsed));
          if (!starts.has(start)) starts.set(start, event);
          if (!ends.has(end)) ends.set(end, event);
        }
      }
  for (const mark of pending) {
    if (mark.node.name === 'pedal' && !bars[mark.staff - 1]?.piano) {
      input.omit('Sustain pedal requires a two-staff keyboard instrument.', mark.node.range);
      continue;
    }
    const position = key(mark.staff, mark.voice, mark.at);
    const start = starts.get(position),
      end = mark.allowEnd ? ends.get(position) : undefined;
    const endpoint = start ?? end;
    if (endpoint) mark.apply(endpoint, !start);
    else input.omit('No exact voice/staff event anchor for MusicXML ' + mark.node.name + '.', mark.node.range);
  }
}
