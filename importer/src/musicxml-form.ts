// Translate MusicXML's printed repeat barlines and volta brackets into a shared written form.
import type { Input, Measure } from './score.js';
import type { TextRange } from './types.js';
import { one, scalar, shape, type Element } from './xml.js';

/** Store just the boundary marks until all written measures of this staff are available. */
interface BoundaryMark {
  attributes: Record<string, string>;
  range: TextRange;
}
interface Edge {
  start?: BoundaryMark;
  stop?: BoundaryMark;
  forward?: BoundaryMark;
  backward?: BoundaryMark;
}
export type Boundaries = Map<number, Edge>;

/** Check placement and preserve source ranges for incomplete or contradictory playback instructions. */
export function barline(node: Element, input: Input, edge: Edge = {}, prefixOnly = false) {
  if (prefixOnly) {
    // Read only open/closed state before a selection, even if its earlier engraved brackets exceed the profile.
    for (const mark of node.children) {
      const field =
        mark.name === 'repeat'
          ? mark.attributes.direction
          : mark.name === 'ending'
            ? mark.attributes.type === 'start'
              ? 'start'
              : 'stop'
            : '';
      if (field === 'start' || field === 'stop' || field === 'forward' || field === 'backward')
        edge[field] = { attributes: mark.attributes, range: mark.range };
    }
    return;
  }
  shape(node, input, ['bar-style', 'repeat', 'ending'], ['location']);
  const repeat = one(node, 'repeat', input, true);
  const ending = one(node, 'ending', input, true);
  const location = node.attributes.location ?? 'right';
  if (!repeat && !ending && scalar(node, 'bar-style', input, 'regular') !== 'regular')
    input.omit('Omitted MusicXML barline.', node.range);
  for (const mark of [ending, repeat]) {
    if (!mark) continue;
    let field: keyof Edge;
    if (mark.name === 'repeat') {
      const { direction, times } = mark.attributes;
      shape(mark, input, [], ['direction', 'times', 'winged', 'after-jump']);
      if (mark.attributes['after-jump'] !== undefined)
        input.fail('unsupported', 'Conditional repeat after a navigation jump.', mark.range);
      if (mark.attributes.winged) input.omit('Omitted repeat wing style.', mark.range);
      if (direction === 'forward' && location === 'left' && !times) field = 'forward';
      else if (direction === 'backward' && location === 'right') field = 'backward';
      else input.fail('unsupported', 'Repeat at unsupported measure edge.', mark.range);
      if (times !== undefined && (!/^[1-9]\d?$/.test(times) || +times < 2 || +times > 32))
        input.fail('unsupported', 'Repeat count must be between two and 32.', mark.range);
    } else {
      const { number, type } = mark.attributes;
      if (!/^[1-9]\d?$/.test(number) || +number > 32)
        input.fail('unsupported', 'Expected one consecutive pass number per MusicXML ending.', mark.range);
      if (type === 'start' && location === 'left') field = 'start';
      else if ((type === 'stop' || type === 'discontinue') && location === 'right') field = 'stop';
      else input.fail('unsupported', 'Ending at unsupported measure edge.', mark.range);
      if (
        Object.keys(mark.attributes).some((k) => !['number', 'type'].includes(k)) ||
        mark.text.trim() ||
        type === 'discontinue'
      )
        input.omit('Omitted custom ending bracket appearance.', mark.range);
    }
    if (edge[field]) input.fail('syntax', 'Duplicate MusicXML repeat or ending boundary.', mark.range);
    // Measure trees may be recycled on return. Keep only immutable scalar metadata and offsets.
    edge[field] = { attributes: mark.attributes, range: mark.range };
  }
}

/** A volta often appears on just the top part. Share playback marks at their score measure ordinal. */
export function collectForm(
  children: Element[],
  ordinal: number,
  form: Boundaries,
  first: number,
  input: Input,
) {
  let local: Edge | undefined;
  for (const child of children) {
    if (ordinal >= first && (child.name === 'sound' || child.name === 'direction')) {
      const sound = child.name === 'sound' ? child : child.children.find((s) => s.name === 'sound');
      if (
        sound &&
        ['dacapo', 'dalsegno', 'tocoda', 'fine', 'forward-repeat'].some((k) => k in sound.attributes)
      )
        input.fail('unsupported', 'Sound navigation changes the performed measure sequence.', sound.range);
    }
    if (child.name === 'barline' && child.children.some((c) => c.name === 'ending' || c.name === 'repeat'))
      barline(child, input, (local ??= {}), ordinal < first);
  }
  if (!local) return;
  const shared = form.get(ordinal);
  if (!shared) {
    form.set(ordinal, local);
    return;
  }
  for (const field of Object.keys(local) as (keyof Edge)[]) {
    const mark = local[field]!,
      prior = shared[field];
    if (
      prior &&
      (prior.attributes.number !== mark.attributes.number ||
        Number(prior.attributes.times ?? 2) !== Number(mark.attributes.times ?? 2))
    )
      input.fail('unsupported', 'Parts disagree about repeat navigation.', mark.range);
    shared[field] ??= mark;
  }
}

/** A backwards barline closes the first ending in XML. VexTab closes the shared body before that ending. */
export function normalizeForm(
  bars: Measure[],
  edges: Boundaries,
  firstOrdinal: number,
  range: TextRange,
  input: Input,
) {
  let start = -1,
    activeEnding = 0,
    expectedEnding = 1,
    used = false;
  // Repeat controls may be printed exclusively on an excluded part. Check the shared prefix as well.
  if (firstOrdinal > 1) {
    let open = false,
      ending = false;
    for (const [i, edge] of [...edges].sort(([a], [b]) => a - b)) {
      if (i >= firstOrdinal) break;
      if (edge.forward) open = true;
      if (edge.start) ending = true;
      if (edge.stop) ending = false;
      if (edge.backward) open = false;
    }
    if (open || ending)
      input.fail('unsupported', 'The selection begins inside a repeat or ending.', bars[0].range ?? range);
  }
  for (const [i, bar] of bars.entries()) {
    const edge = edges.get(firstOrdinal + i) ?? {};
    input.context = { part: bar.part, measure: bar.label };
    const fail = (message: string, mark?: BoundaryMark): never =>
      input.fail('unsupported', message, mark?.range ?? bar.range ?? range);

    // An opening backward repeat with no forward mark returns to the start of the complete piece.
    function requireStart(mark: BoundaryMark) {
      if (start >= 0) return;
      if (used || firstOrdinal > 1)
        fail('Backward repeat reaches before the selected or unambiguous repeat region.', mark);
      start = 0;
    }
    if (expectedEnding > 1 && !activeEnding && !edge.start) fail('Missing consecutive MusicXML ending.');
    if (edge.forward) {
      if (start >= 0 || activeEnding) fail('Overlapping MusicXML repeats.', edge.forward);
      start = i;
    }
    if (edge.start) {
      if (activeEnding || +edge.start.attributes.number !== expectedEnding)
        fail('Ending numbers must be consecutive.', edge.start);
      if (expectedEnding === 1) {
        requireStart(edge.start);
        if (i <= start) fail('A repeat needs a shared body before its first ending.', edge.start);
        bars[i - 1].repeatEnd = true;
      }
      activeEnding = bar.ending = expectedEnding;
    }
    if (edge.stop) {
      if (+edge.stop.attributes.number !== activeEnding) fail('Unmatched MusicXML ending stop.', edge.stop);
      bar.endingEnd = true;
      if (edge.backward) {
        if (edge.backward.attributes.times !== undefined)
          fail('A counted backward repeat cannot also close an ending.', edge.backward);
        expectedEnding = activeEnding + 1;
      } else {
        if (activeEnding === 1) fail('First ending must end with a backward repeat.', edge.stop);
        bars[start].repeatStart = activeEnding;
        start = -1;
        used = true;
        expectedEnding = 1;
      }
      activeEnding = 0;
    } else if (edge.backward) {
      if (activeEnding) fail('Place the backward repeat at the end of a returning ending.', edge.backward);
      requireStart(edge.backward);
      const count = Number(edge.backward.attributes.times ?? 2);
      if (count !== 2 && input.options.targetProfile !== 'expressive')
        fail('Counted repeat without endings requires the expressive target.', edge.backward);
      bars[start].repeatStart = count;
      bar.repeatEnd = true;
      start = -1;
      used = true;
    }
  }
  if (start >= 0 || activeEnding || expectedEnding > 1)
    input.fail('unsupported', 'Unclosed repeat or ending in selected measures.', bars.at(-1)?.range ?? range);
}
