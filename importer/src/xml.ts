// Bounded, non-resolving XML decoder and located element helpers used by MusicXML and its container.
import { SaxesParser } from 'saxes';
import { Input, sourceLimit } from './score.js';
import type { TextRange } from './types.js';

/** Keep exact element ranges while interpreting this bounded measure in document order. */
export interface Element {
  name: string;
  attributes: Record<string, string>;
  children: Element[];
  text: string;
  range: [number, number];
}

/** Decode the supported byte representation without substituting replacement characters. */
export function sourceText(data: string | Uint8Array, input: Input) {
  if ((typeof data === 'string' ? data.length : data.byteLength) > sourceLimit)
    input.fail('limit', 'MusicXML exceeds the input budget.', [0, 0]);
  if (typeof data === 'string') return data;
  const utf16 =
    (data[0] === 255 && data[1] === 254) || (data[0] === 60 && data[1] === 0)
      ? 'utf-16le'
      : (data[0] === 254 && data[1] === 255) || (data[0] === 0 && data[1] === 60)
        ? 'utf-16be'
        : undefined;
  try {
    const text = new TextDecoder(utf16 ?? 'utf-8', { fatal: true }).decode(data);
    const declared = /^<\?xml\s+[^?]*encoding=["']([^"']+)/i.exec(text)?.[1].toLowerCase();
    if (declared && declared !== (utf16 ?? 'utf-8') && !(utf16 && declared === 'utf-16'))
      input.fail('encoding', 'XML declaration conflicts with byte encoding.', [0, text.indexOf('?>') + 2]);
    return text;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return input.fail('encoding', 'Invalid XML byte encoding.', [0, 0]);
  }
}

/** Let saxes handle XML syntax, entities and offsets. No external document is loaded. */
export function readTree(source: string, input: Input): Element {
  const parser = new SaxesParser();
  const stack: Element[] = [];
  let root: Element | undefined,
    start = 0,
    count = 0;
  const here = (): TextRange => [
    Math.max(0, Math.min(parser.position - 1, source.length)),
    Math.min(parser.position, source.length),
  ];
  parser.on('error', (e) => input.fail('syntax', e.message, here()));
  parser.on('doctype', (d) => {
    if (d.includes('['))
      input.fail('unsupported', 'Internal DTD subsets are outside this profile.', [0, parser.position]);
  });
  parser.on('processinginstruction', () =>
    input.fail('unsupported', 'Unsupported processing instruction.', here()),
  );
  parser.on('opentagstart', () => {
    start = source.lastIndexOf('<', parser.position - 1);
  });
  parser.on('opentag', (tag) => {
    if (stack.length >= 32 || ++count > 65536)
      input.fail('limit', 'XML element budget exceeded.', [start, parser.position]);
    const node: Element = {
      name: tag.name,
      attributes: tag.attributes,
      children: [],
      text: '',
      range: [start, parser.position],
    };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root = node;
    stack.push(node);
  });
  function text(value: string) {
    if (stack.length) stack[stack.length - 1].text += value;
  }
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    stack.pop()!.range[1] = parser.position;
  });
  parser.write(source).close();
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
