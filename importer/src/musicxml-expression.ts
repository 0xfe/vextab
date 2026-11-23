// Read expressive note marks and resolve numbered MusicXML endpoints on their owning voice.
import { Input, type Event, type Measure, type Pitch } from './score.js';
import type { Expression, HeadDetail, SpanPoint, Syllable } from './expression.js';
import { Time, zero } from './time.js';
import type { TextRange } from './types.js';
import { one, scalar, type Element } from './xml.js';

/** Report loss on the element which actually carries the unsupported information. */
export function omitElement(node: Element, input: Input) {
  input.omit('Omitted MusicXML ' + node.name + '.', node.range);
}
export function attributesExcept(node: Element, allowed: string[], input: Input) {
  for (const key of Object.keys(node.attributes))
    if (!allowed.includes(key)) input.omit('Omitted ' + node.name + ' attribute ' + key + '.', node.range);
}
function childrenExcept(node: Element, allowed: string[], input: Input) {
  for (const child of node.children) if (!allowed.includes(child.name)) omitElement(child, input);
}
export function numberIn(raw: string, min: number, max: number, node: Element, input: Input) {
  if (!/^-?\d+$/.test(raw) || +raw < min || +raw > max)
    input.fail('unsupported', 'Unsupported ' + node.name + ' value ' + raw + '.', node.range);
  return +raw;
}
/** Nondefault positioning, styles, and variants are independent of the underlying mark. */
function side(node: Element, input: Input) {
  const value = node.attributes.placement;
  if (value && value !== 'above' && value !== 'below') input.fail('unsupported', 'Invalid placement.', node.range);
  return value as 'above' | 'below' | undefined;
}
type Gesture = NonNullable<HeadDetail['gesture']>;
interface GestureEdge {
  kind: Gesture;
  type: string;
  number: string;
  range: TextRange;
}
interface HeadInfo {
  start: boolean;
  stop: boolean;
  gestures: GestureEdge[];
}
interface Extension {
  verse: string;
  type: string;
  syllable?: Syllable;
  range: TextRange;
}
interface GraceGroup {
  pitches: Pitch[][];
  side: 'before' | 'after';
  slashed: boolean;
  steal?: Time;
  range: TextRange;
}
export interface NotationState {
  heads: WeakMap<HeadDetail, HeadInfo>;
  extensions: WeakMap<Event, Extension[]>;
  grace: Map<string, GraceGroup>;
  last: Map<string, Event>;
}
export function notationState(): NotationState {
  return { heads: new WeakMap(), extensions: new WeakMap(), grace: new Map(), last: new Map() };
}
export function expression(e: Event) {
  return (e.expression ??= {});
}
function headDetail(e: Event) {
  return (e.headDetails ??= [{}])[0];
}
export type SourceSpan = SpanPoint & { range?: TextRange };
export function span(e: Event, point: SourceSpan) {
  (expression(e).spans ??= []).push(point);
}
const art = {
  accent: 'accent',
  staccato: 'staccato',
  tenuto: 'tenuto',
  'strong-accent': 'marcato',
  fermata: 'fermata',
} as const;
const ornaments = {
  'trill-mark': 'tr',
  turn: 'turn',
  'inverted-turn': 'turn_inverted',
  // MusicXML calls the sign with a vertical stroke a mordent. VexFlow uses the opposite name.
  mordent: 'mordent_inverted',
  'inverted-mordent': 'mordent',
} as const;

function articulation(node: Element, e: Event, input: Input) {
  const kind = Object.hasOwn(art, node.name) ? art[node.name as keyof typeof art] : undefined;
  if (!kind) return omitElement(node, input);
  const inverted = node.name === 'fermata' && node.attributes.type === 'inverted';
  if (node.text.trim() && node.text.trim() !== 'normal')
    input.omit('Omitted nonstandard articulation shape.', node.range);
  attributesExcept(node, ['placement', ...(node.name === 'fermata' ? ['type'] : [])], input);
  (expression(e).articulations ??= []).push({ kind, side: inverted ? 'below' : side(node, input) });
}
/** Numeric verse numbers become stable target identifiers. Missing numbers occupy the unnamed lane. */
function lyric(node: Element, e: Event, state: NotationState, input: Input) {
  attributesExcept(node, ['number'], input);
  childrenExcept(node, ['syllabic', 'elision', 'text', 'extend'], input);
  const verse = node.attributes.number;
  const words = node.children.filter((c) => c.name === 'text');
  const sy = node.children
    .filter((c) => c.name === 'syllabic')
    .at(-1)
    ?.text.trim();
  if (sy && !['begin', 'middle', 'single', 'end'].includes(sy))
    input.fail('unsupported', 'Unknown syllabic value.', node.range);
  let syllable: Syllable | undefined;
  if (words.length) {
    if (!e.pitch || words.some((w) => !w.text.trim()))
      return input.omit('Empty lyric or lyric without a sounding attack.', node.range);
    const elisions = node.children.filter((c) => c.name === 'elision');
    for (const child of [...words, ...elisions]) attributesExcept(child, [], input);
    if (words.length > 2 || (words.length === 2 && elisions.length !== 1))
      input.omit('Only two elided syllables fit one target lyric; joined excess syllables as text.', node.range);
    if (elisions.some((c) => c.text && c.text !== '‿'))
      input.omit('Omitted the custom lyric elision glyph.', node.range);
    syllable = { text: words[0].text, verse, hyphen: sy === 'begin' || sy === 'middle' };
    if (words.length > 1)
      syllable.elideWith = words
        .slice(1)
        .map((w) => w.text)
        .join(' ');
    const lyrics = (expression(e).lyrics ??= []);
    if (lyrics.some((l) => l.verse === verse))
      input.fail('unsupported', 'Multiple lyrics in one verse at the same attack.', node.range);
    lyrics.push(syllable);
  }
  const extend = one(node, 'extend', input, true);
  if (extend) {
    const list = state.extensions.get(e) ?? [];
    list.push({ verse: verse ?? '', type: extend.attributes.type ?? 'implicit', syllable, range: extend.range });
    state.extensions.set(e, list);
  } else if (!syllable) omitElement(node, input);
}
function technical(node: Element, detail: HeadDetail, info: HeadInfo, input: Input) {
  const name = node.name;
  if (name === 'string' || name === 'fret') {
    if (detail[name] !== undefined)
      input.fail('unsupported', 'Ambiguous repeated ' + name + ' on one head.', node.range);
    attributesExcept(node, name === 'string' ? ['placement'] : [], input);
    detail[name] = numberIn(node.text.trim(), name === 'string' ? 1 : 0, name === 'string' ? 8 : 99, node, input);
    if (name === 'string') detail.stringSide = side(node, input);
  } else if (name === 'fingering') {
    const value = node.text.trim();
    if (!/^[0-5Tpimac]$/.test(value) || detail.finger) return omitElement(node, input);
    attributesExcept(node, ['placement'], input);
    detail.finger = { value, side: side(node, input) ?? 'left' };
  } else if (name === 'bend') {
    if (node.children.some((c) => c.name !== 'bend-alter') || Object.keys(node.attributes).length)
      return input.omit('Unsupported pre-bend, release or timed bend envelope.', node.range);
    const n = Number(scalar(node, 'bend-alter', input));
    if (!(n > 0 && n <= 99 && Number.isInteger(n * 2))) return omitElement(node, input);
    detail.bend = n;
  } else if (name === 'hammer-on' || name === 'pull-off' || name === 'slide') {
    const kind = name === 'hammer-on' ? 'hammer' : name === 'pull-off' ? 'pull' : 'slide';
    attributesExcept(node, ['type', 'number'], input);
    info.gestures.push({
      kind,
      type: node.attributes.type,
      number: node.attributes.number ?? '1',
      range: node.range,
    });
  } else omitElement(node, input);
}
/** Store numbered boundaries on source heads until the chord and the voice timeline are complete. */
export function noteMarks(node: Element, e: Event, state: NotationState, input: Input, isDrum: boolean) {
  const detail = e.pitch ? headDetail(e) : {};
  const info: HeadInfo = { start: false, stop: false, gestures: [] };
  state.heads.set(detail, info);
  const marks = one(node, 'notations', input, true);
  for (const mark of [...node.children.filter((c) => c.name === 'tie'), ...(marks?.children ?? [])]) {
    if (mark.name === 'tie' || mark.name === 'tied') {
      attributesExcept(mark, ['type', 'number'], input);
      if (mark.attributes.type === 'start') info.start = true;
      else if (mark.attributes.type === 'stop') info.stop = true;
      else input.fail('unsupported', 'Unsupported tie boundary.', mark.range);
    } else if (mark.name === 'slur') {
      attributesExcept(mark, ['type', 'number', 'placement'], input);
      const edge = mark.attributes.type;
      if (edge !== 'start' && edge !== 'stop') {
        omitElement(mark, input);
        continue;
      }
      span(e, {
        kind: 'slur',
        id: mark.attributes.number ?? '1',
        edge,
        side: side(mark, input),
        range: mark.range,
      });
    } else if (mark.name === 'technical') {
      for (const child of mark.children) technical(child, detail, info, input);
    } else if (mark.name === 'slide') technical(mark, detail, info, input);
    else if (mark.name === 'articulations') {
      for (const child of mark.children) articulation(child, e, input);
    } else if (mark.name === 'fermata') articulation(mark, e, input);
    else if (mark.name === 'ornaments') {
      for (const child of mark.children) {
        const kind = Object.hasOwn(ornaments, child.name)
          ? ornaments[child.name as keyof typeof ornaments]
          : undefined;
        if (!kind || expression(e).ornament) {
          omitElement(child, input);
          continue;
        }
        attributesExcept(child, [], input);
        expression(e).ornament = kind;
      }
    } else if (mark.name !== 'tuplet') omitElement(mark, input);
  }
  for (const child of node.children) {
    if (child.name === 'lyric') lyric(child, e, state, input);
    if (child.name === 'beam') {
      attributesExcept(child, ['number'], input);
      const value = child.text.trim(),
        number = child.attributes.number ?? '1';
      if (number !== '1' || !['begin', 'end', 'continue'].includes(value)) {
        omitElement(child, input);
        continue;
      }
      if (value !== 'continue')
        span(e, { kind: 'beam', id: '1', edge: value === 'begin' ? 'start' : 'stop', range: child.range });
    }
    if (child.name === 'accidental') {
      const sign = ['flat-flat', 'flat', 'natural', 'sharp', 'double-sharp'][(e.pitch?.alter ?? 0) + 2];
      if (child.text.trim() === sign) detail.forcedAccidental = true;
      else input.omit('Accidental glyph differs from written pitch.', child.range);
      attributesExcept(child, [], input);
    }
    if (!isDrum && ['stem', 'notehead', 'instrument'].includes(child.name)) omitElement(child, input);
  }
}
/** An after-grace steals from the preceding principal. A before-grace waits for its following principal. */
export function graceNote(
  node: Element,
  grace: Element,
  voice: string,
  p: Pitch,
  state: NotationState,
  input: Input,
) {
  attributesExcept(grace, ['slash', 'steal-time-previous', 'steal-time-following'], input);
  const prev = grace.attributes['steal-time-previous'],
    next = grace.attributes['steal-time-following'];
  if (prev !== undefined && next !== undefined)
    input.fail('unsupported', 'Grace steals from both adjacent attacks.', grace.range);
  const raw = prev ?? next;
  let steal: Time | undefined;
  if (raw !== undefined) {
    if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw) || Number(raw) <= 0 || Number(raw) >= 100)
      input.fail('unsupported', 'Grace steal must be a positive fraction below 100 percent.', grace.range);
    const decimals = raw.split('.')[1]?.length ?? 0;
    steal = new Time(Number(raw.replace('.', '')), 100 * 10 ** decimals);
  }
  const side = prev !== undefined ? 'after' : 'before',
    slashed = grace.attributes.slash === 'yes';
  const chord = !!one(node, 'chord', input, true);
  const principal = state.last.get(voice);
  if (side === 'after' && !principal)
    input.fail('unsupported', 'After-grace has no preceding principal in this selection.', grace.range);
  let group = state.grace.get(voice);
  if (!group) {
    group = { pitches: [], side, steal, slashed, range: grace.range };
    state.grace.set(voice, group);
  }
  // Independent stealing percentages on successive grace attacks describe different playback lengths.
  if (
    group.side !== side ||
    group.slashed !== slashed ||
    (group.pitches.length && !chord && (group.steal || steal))
  )
    input.fail('unsupported', 'Mixed styling or individually timed attacks in a grace group.', grace.range);
  if (chord) {
    if (!group.pitches.length) input.fail('syntax', 'Grace chord member without a first head.', node.range);
    if (group.pitches.at(-1)!.length >= 16) input.fail('limit', 'Grace chord exceeds 16 heads.', node.range);
    group.pitches.at(-1)!.push(p);
  } else {
    if (group.pitches.length >= 16) input.fail('limit', 'Grace group exceeds 16 attacks.', node.range);
    group.pitches.push([p]);
  }
  for (const c of node.children)
    if (!['grace', 'chord', 'pitch', 'voice', 'staff'].includes(c.name))
      input.omit('Omitted grace-note ' + c.name + '.', c.range);
}
function attachGrace(e: Event | undefined, g: GraceGroup, input: Input) {
  if (!e?.pitch || e.grace)
    return input.fail('unsupported', 'Grace group needs a single pitched principal.', g.range);
  if (e.headDetails?.some((h) => h.drum))
    input.fail('unsupported', 'A percussion hit cannot anchor pitched grace notes.', g.range);
  e.grace = g.pitches;
  Object.assign(expression(e), { graceSide: g.side, graceSlashed: g.slashed, graceSteal: g.steal });
}
export function principal(e: Event, voice: string, state: NotationState, input: Input) {
  const grace = state.grace.get(voice);
  if (grace) {
    attachGrace(grace.side === 'after' ? state.last.get(voice) : e, grace, input);
    state.grace.delete(voice);
  }
  state.last.set(voice, e);
}
export function finishGrace(state: NotationState, input: Input) {
  for (const [voice, g] of state.grace)
    attachGrace(g.side === 'after' ? state.last.get(voice) : undefined, g, input);
}
/** Transfer head data and event-level marks when a MusicXML chord adds another head. */
export function appendHead(first: Event, head: Event, state: NotationState, input: Input) {
  const detail = head.headDetails![0];
  first.headDetails!.push(detail);
  if (head.elapsed.compare(first.elapsed) < 0) detail.releaseAfter = head.elapsed;
  if (head.expression) {
    for (const s of head.expression.spans ?? []) span(first, s);
    if (head.expression.lyrics) (expression(first).lyrics ??= []).push(...head.expression.lyrics);
    if (head.expression.articulations)
      (expression(first).articulations ??= []).push(...head.expression.articulations);
    if (head.expression.ornament) expression(first).ornament = head.expression.ornament;
    if (state.extensions.has(head))
      state.extensions.set(first, [...(state.extensions.get(first) ?? []), ...state.extensions.get(head)!]);
    if (head.expression.spans?.some((p) => p.kind === 'slur'))
      input.omit('Attached a chord-member slur to the chord attack.', head.range);
  }
}
interface VoiceEvent {
  event: Event;
  at: Time;
  bar: Measure;
}
function context(input: Input, bar: Measure, voice: string) {
  input.context = { part: bar.part, measure: bar.label, voice };
}
/** Match ties by written pitch and string across changes of chord order. Resolve technical spans on that string. */
function resolveHeads(events: VoiceEvent[], voice: string, state: NotationState, input: Input) {
  const ties = new Map<string, { id: string; until: Time; range: TextRange }>();
  const gestures = new Map<string, { index: number; detail: HeadDetail; range: TextRange }>();
  for (const [index, { event, at, bar }] of events.entries()) {
    context(input, bar, voice);
    for (const [i, detail] of (event.headDetails ?? []).entries()) {
      const p = (event.pitches ?? [event.pitch])[i],
        info = state.heads.get(detail)!;
      if (!p) continue;
      const share = event.expression?.graceSteal;
      if (detail.releaseAfter && share && event.expression?.graceSide === 'before') {
        const borrowed = new Time(
          event.elapsed.numerator * share.numerator,
          event.elapsed.denominator * share.denominator,
        );
        if (detail.releaseAfter.compare(borrowed) <= 0)
          input.fail(
            'timing',
            'Grace share exhausts the shorter chord head.',
            event.headRanges?.[i] ?? event.range,
          );
      }
      const key = JSON.stringify([p.step, p.alter, p.octave, detail.string, detail.drum]);
      const range = event.headRanges?.[i] ?? event.range;
      if (info.stop) {
        const prior = ties.get(key);
        if (!prior || prior.until.compare(at))
          input.fail('unsupported', 'Tie stop lacks an adjacent matching head.', range);
        detail.tieEndId = prior!.id;
        ties.delete(key);
      }
      if (info.start) {
        if (ties.has(key)) input.fail('unsupported', 'Ambiguous simultaneous tied heads.', range);
        detail.tieStartId = 't' + range[0];
        ties.set(key, { id: detail.tieStartId, until: at.plus(detail.releaseAfter ?? event.elapsed), range });
      }
      for (const mark of info.gestures) {
        const key = mark.kind + '/' + mark.number;
        if (mark.type === 'start' && !gestures.has(key)) gestures.set(key, { index, detail, range: mark.range });
        else if (mark.type === 'stop') {
          const prior = gestures.get(key);
          gestures.delete(key);
          const a = prior?.detail.fret,
            b = detail.fret;
          if (
            !prior ||
            prior.index !== index - 1 ||
            events[prior.index].at.plus(events[prior.index].event.elapsed).compare(at) !== 0 ||
            prior.detail.string !== detail.string ||
            typeof a !== 'number' ||
            typeof b !== 'number' ||
            (mark.kind === 'hammer' ? a >= b : mark.kind === 'pull' ? a <= b : a === b)
          )
            input.omit('Fretted gesture needs adjacent compatible frets on one string.', mark.range);
          else detail.gesture = mark.kind;
        } else input.omit('Unmatched or unsupported guitar gesture boundary.', mark.range);
      }
    }
  }
  for (const tie of ties.values())
    input.fail('unsupported', 'Head tie extends beyond the selected voice.', tie.range);
  for (const item of gestures.values()) input.omit('Fretted gesture lacks a following destination.', item.range);
}
/** Extenders count events in their own lyric lane, including intervening untexted notes. */
function resolveLyrics(events: VoiceEvent[], voice: string, state: NotationState, input: Input) {
  const extensions = new Map<string, { syllable: Syllable; index: number; range: TextRange; implicit: boolean }>();
  const hyphens = new Map<string, { syllable: Syllable; range: TextRange }>();
  for (const [index, { event, bar }] of events.entries()) {
    context(input, bar, voice);
    for (const syllable of event.expression?.lyrics ?? []) {
      const lane = syllable.verse ?? '';
      const prior = extensions.get(lane);
      if (prior?.implicit) {
        prior.syllable.extend = index - prior.index - 1 || undefined;
        extensions.delete(lane);
      }
      hyphens.delete(lane);
      if (syllable.hyphen) hyphens.set(lane, { syllable, range: event.range });
    }
    for (const ext of state.extensions.get(event) ?? []) {
      if (ext.type === 'start' || ext.type === 'implicit') {
        if (!ext.syllable || extensions.has(ext.verse))
          input.fail('unsupported', 'Lyric extender lacks a unique starting syllable.', ext.range);
        extensions.set(ext.verse, {
          index,
          syllable: ext.syllable!,
          range: ext.range,
          implicit: ext.type === 'implicit',
        });
      } else {
        const prior = extensions.get(ext.verse);
        if (!prior || !['stop', 'continue'].includes(ext.type))
          input.fail('unsupported', 'Unmatched lyric extender.', ext.range);
        if (ext.type === 'stop') {
          prior!.syllable.extend = index - prior!.index;
          extensions.delete(ext.verse);
        }
      }
    }
  }
  for (const { syllable, range } of hyphens.values()) {
    input.omit('Lyric hyphen lacks a following syllable in this selection.', range);
    delete syllable.hyphen;
  }
  for (const item of extensions.values()) {
    if (item.implicit) item.syllable.extend = events.length - 1 - item.index || undefined;
    else input.fail('unsupported', 'Lyric extender lacks a stop.', item.range);
  }
  for (const { event } of events)
    for (const l of event.expression?.lyrics ?? [])
      if (l.extend && (l.extend > 99 || l.hyphen))
        input.fail('unsupported', 'Unrepresentable lyric extender length or simultaneous hyphen.', event.range);
}
/** Drop both endpoints in partial mode if the target cannot express the complete span. */
function dropSpan(point: SourceSpan, event: Event, reason: string, input: Input) {
  input.omit(reason, point.range ?? event.range);
  const list = event.expression!.spans!;
  const i = list.indexOf(point);
  if (i >= 0) list.splice(i, 1);
}
/** Source numbers distinguish overlapping spans. A beam joins adjacent short notes in one written bar. */
function resolveSpans(events: VoiceEvent[], voice: string, input: Input) {
  const spans = new Map<string, { point: SourceSpan; index: number }>();
  let pedalDown: TextRange | undefined;
  for (const [index, { event, bar }] of events.entries()) {
    context(input, bar, voice);
    for (const action of event.expression?.pedal ?? []) {
      if (action === 'down') {
        if (pedalDown) input.fail('unsupported', 'Sustain pedal pressed twice in one voice.', event.range);
        pedalDown = event.range;
      } else {
        if (!pedalDown)
          input.fail('unsupported', 'Pedal up lacks an earlier pedal down in this voice.', event.range);
        pedalDown = undefined;
      }
    }

    for (const [ordinal, point] of [...(event.expression?.spans ?? [])].entries()) {
      const key = (point.kind === 'diminuendo' ? 'crescendo' : point.kind) + '/' + point.id;
      const open = spans.get(key);
      if (point.edge === 'start') {
        if (open)
          dropSpan(
            open.point,
            events[open.index].event,
            'Omitted ' + point.kind + ' start without a matching stop.',
            input,
          );
        point.id = 's' + event.range[0] + 'x' + ordinal;
        spans.set(key, { point, index });
      } else {
        if (!open) {
          dropSpan(point, event, 'Omitted unmatched ' + point.kind + ' endpoint in selected voice.', input);
          continue;
        }
        spans.delete(key);
        const invalid =
          open.index === index ||
          (point.kind === 'beam' &&
            (events[open.index].bar !== bar ||
              events.slice(open.index, index + 1).some(({ event }) => event.denominator < 8)));
        if (invalid) {
          dropSpan(
            open.point,
            events[open.index].event,
            'Span needs distinct anchors; a beam needs short notes within one bar.',
            input,
          );
          dropSpan(point, event, 'Omitted corresponding ' + point.kind + ' endpoint.', input);
          continue;
        }
        point.id = open.point.id;
        point.kind = open.point.kind;
        if (point.niente) open.point.niente = true;
      }
    }
  }
  if (pedalDown) input.fail('unsupported', 'Open sustain pedal at the end of the selected voice.', pedalDown);
  for (const { point, index } of spans.values()) {
    context(input, events[index].bar, voice);
    dropSpan(point, events[index].event, 'Omitted unclosed ' + point.kind + ' in selected voice.', input);
  }
}
export function finishNotation(bars: Measure[], state: NotationState, input: Input) {
  finishGrace(state, input);
  const staffs = new Map<number, Time>();
  const lanes = new Map<string, { voice: string; events: { event: Event; at: Time; bar: Measure }[] }>();
  for (const bar of bars) {
    const start = staffs.get(bar.staff) ?? zero;
    for (const [voice, events] of bar.voices) {
      const key = JSON.stringify([bar.staff, voice]);
      const lane = lanes.get(key) ?? { voice, events: [] };
      lanes.set(key, lane);
      for (const event of [...events].sort((a, b) => a.at.compare(b.at)))
        lane.events.push({ event, at: start.plus(event.at), bar });
    }
    staffs.set(bar.staff, start.plus(bar.extent));
  }
  for (const { voice, events } of lanes.values()) {
    resolveHeads(events, voice, state, input);
    resolveLyrics(events, voice, state, input);
    resolveSpans(events, voice, input);
  }
}
