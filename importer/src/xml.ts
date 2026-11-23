// Bounded, non-resolving XML decoder and located element helpers used by MusicXML and its container.
import { SaxesParser } from 'saxes';
import { includesExtended, Input, sourceLimit } from './score.js';
import type { MusicXMLOptions, TextRange } from './types.js';

/** Keep exact element ranges while interpreting this bounded measure in document order. */
export interface Element {
  name: string;
  attributes: Record<string, string>;
  children: Element[];
  text: string;
  range: [number, number];
}

const largeXMLLimit = 8 * 1024 * 1024;
/** A caller can select a small target from a larger source, independently of the host capacity. */
export function xmlLimit(options: MusicXMLOptions) {
  return options.selection || includesExtended(options) ? largeXMLLimit : sourceLimit;
}

/** Recognize the UTF encodings supported by the XML byte stream. */
function encoding(data: Uint8Array) {
  if ((data[0] === 255 && data[1] === 254) || (data[0] === 60 && data[1] === 0)) return 'utf-16le';
  if ((data[0] === 254 && data[1] === 255) || (data[0] === 0 && data[1] === 60)) return 'utf-16be';
  return 'utf-8';
}

/** Let saxes handle XML syntax, entities and offsets. No external document is loaded. */
export function readTree(
  source: string | Uint8Array,
  input: Input,
  selection?: MusicXMLOptions['selection'],
  onRootChild?: (node: Element, root: Element) => void,
): Element {
  const size = source.length,
    limit = xmlLimit(input.options);
  if (size > limit)
    input.fail(
      'limit',
      'MusicXML input has ' +
        size +
        ' ' +
        (typeof source === 'string' ? 'UTF-16 units' : 'bytes') +
        '; limit is ' +
        limit +
        '. Select a part or measure range, or opt into the extended profile for larger XML.',
      [0, 0],
    );
  const decoder = typeof source === 'string' ? undefined : new TextDecoder(encoding(source), { fatal: true });
  let block = '',
    offset = 0,
    priorOpening = 0;
  const parser = new SaxesParser();
  const stack: (Element | undefined)[] = [];
  const selected = selection?.parts && new Set(selection.parts);
  let part = '',
    ordinal = 0;
  const first = selection?.firstMeasure ?? 1,
    last = selection?.lastMeasure ?? Infinity;
  const nodeLimit = xmlLimit(input.options) > sourceLimit ? 400000 : 65536;
  let root: Element | undefined,
    start = 0,
    count = 0;
  const here = (): TextRange => [
    Math.max(0, Math.min(parser.position - 1, source.length)),
    Math.min(parser.position, source.length),
  ];
  parser.on('error', (e) => input.fail('syntax', e.message, here()));
  parser.on('xmldecl', (decl) => {
    const declared = decl.encoding?.toLowerCase(),
      used = decoder?.encoding;
    if (used && declared && declared !== used && !(used.startsWith('utf-16') && declared === 'utf-16'))
      input.fail('encoding', 'XML declaration conflicts with byte encoding.', [0, parser.position]);
  });
  parser.on('doctype', (d) => {
    if (d.includes('['))
      input.fail('unsupported', 'Internal DTD subsets are outside this profile.', [0, parser.position]);
  });
  parser.on('processinginstruction', () =>
    input.fail('unsupported', 'Unsupported processing instruction.', here()),
  );
  parser.on('opentagstart', () => {
    const found = block.lastIndexOf('<', parser.position - offset - 1);
    start = found >= 0 ? offset + found : priorOpening;
  });
  parser.on('opentag', (tag) => {
    if (stack.length >= 32 || ++count > nodeLimit)
      input.fail('limit', 'XML element budget exceeded.', [start, parser.position]);
    const parent = stack[stack.length - 1];
    if (stack.length && !parent) {
      stack.push(undefined);
      return;
    }
    if (tag.name === 'part' && (parent?.name === 'score-partwise' || parent?.name === 'measure')) {
      part = tag.attributes.id;
      if (parent.name === 'score-partwise') ordinal = 0;
    }
    if (tag.name === 'measure' && (parent?.name === 'part' || parent?.name === 'score-timewise')) ordinal++;
    const content =
      parent && (root?.name === 'score-partwise' ? parent.name === 'measure' : parent.name === 'part');
    // For unselected music keep the clock needed by global playback directions, plus inherited state.
    const excluded = selected && !selected.has(part);
    const prefix = ordinal < first;
    const keepClock = includesExtended(input.options) && (excluded || prefix);
    if (selection && (excluded || prefix || ordinal > last)) {
      let drop = false;
      if (content) {
        const carry = !excluded && prefix && ['attributes', 'barline'].includes(tag.name);
        const clock =
          (keepClock || (!excluded && prefix)) &&
          ['attributes', 'note', 'forward', 'backup', 'direction', 'sound'].includes(tag.name);
        drop = ordinal > last || (!carry && !clock);
      } else if (parent?.name === 'note') drop = !['duration', 'chord', 'grace'].includes(tag.name);
      else if (parent?.name === 'direction') drop = !['sound', 'offset'].includes(tag.name);
      else if (parent?.name === 'attributes' && excluded) drop = tag.name !== 'divisions';
      if (drop) {
        stack.push(undefined);
        return;
      }
    }
    const node: Element = {
      name: tag.name,
      attributes: tag.attributes,
      children: [],
      text: '',
      range: [start, parser.position],
    };
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  function text(value: string) {
    const current = stack[stack.length - 1];
    if (current && (current.text || value.trim())) current.text += value;
  }
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    const current = stack.pop();
    if (current) {
      const barEnd =
        root?.name === 'score-partwise'
          ? current.name === 'measure'
          : current.name === 'part' && stack.at(-1)?.name === 'measure';
      if (
        selection &&
        barEnd &&
        (ordinal < first || (selected && !selected.has(part))) &&
        !current.children.some(
          (c) =>
            (c.name === 'attributes' && c.children.some((a) => a.name !== 'divisions')) ||
            (c.name === 'sound' && c.attributes.tempo) ||
            (c.name === 'direction' && c.children.some((s) => s.name === 'sound' && s.attributes.tempo)),
        )
      ) {
        current.children = current.children.filter((c) => c.name === 'attributes' || c.name === 'barline');
      }
      current.range[1] = parser.position;
      if (root && stack.length === 1) onRootChild?.(current, root);
    }
  });
  function write(next: string) {
    if (!next.length) return;
    const prior = block.lastIndexOf('<');
    if (prior >= 0) priorOpening = offset + prior;
    offset += block.length;
    block = next;
    parser.write(block);
  }
  for (let i = 0; i < size; i += 16384) {
    if (typeof source === 'string') write(source.slice(i, i + 16384));
    else {
      let decoded: string;
      try {
        decoded = decoder!.decode(source.subarray(i, i + 16384), { stream: i + 16384 < size });
      } catch {
        return input.fail('encoding', 'Invalid XML byte encoding.', [offset, offset]);
      }
      write(decoded);
    }
  }
  parser.close();
  if (!root) return input.fail('syntax', 'Missing MusicXML root.', [0, source.length]);
  return root;
}

/** Reject unrecognized children and attributes before any construct can be silently discarded. */
export function shape(node: Element, input: Input, children: string[], attributes: string[] = []) {
  for (const name of Object.keys(node.attributes)) {
    if (!attributes.includes(name))
      input.fail('unsupported', 'Unsupported ' + node.name + ' attribute ' + name + '.', node.range);
  }
  for (const child of node.children) {
    if (!children.includes(child.name))
      input.fail('unsupported', 'Unsupported ' + child.name + ' in ' + node.name + '.', child.range);
  }
  if (children.length && node.text.trim())
    input.fail('syntax', 'Unexpected text in ' + node.name + '.', node.range);
}

/** Require exactly one selected child, or permit its absence when an explicit default exists. */
export function one(node: Element, name: string, input: Input, optional = false) {
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length > 1) input.fail('unsupported', 'Only one ' + name + ' is supported here.', matches[1].range);
  if (!optional && !matches.length) input.fail('syntax', 'Missing ' + name + '.', node.range);
  return matches[0] as Element | undefined;
}

/** Scalar values cannot contain markup. */
export function scalar(node: Element, name: string, input: Input, fallback?: string): string {
  const child = one(node, name, input, fallback !== undefined);
  if (!child) return fallback!;
  shape(child, input, []);
  return child.text.trim();
}
