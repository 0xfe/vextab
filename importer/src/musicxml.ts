// Import the single-measure, concert-pitch MusicXML profile into the shared measured writer.
import { SaxesParser } from 'saxes';
import { convert, Input, keys, Measure, meter, pitch, sourceLimit } from './score.js';
import { Time, zero } from './time.js';
import type { Event } from './score.js';
import type { ImportOptions, ImportResult, TextRange } from './types.js';
export type { ImportedDocument, ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';

/** Keep exact element ranges while interpreting this bounded measure in document order. */
interface Element {
  name: string; attributes: Record<string, string>; children: Element[]; text: string; range: [number, number];
}

/** Decode the supported byte representation without substituting replacement characters. */
function sourceText(data: string | Uint8Array, input: Input) {
  if ((typeof data === 'string' ? data.length : data.byteLength) > sourceLimit)
    input.fail('limit', 'MusicXML exceeds the single-measure input budget.', [0, 0]);
  if (typeof data === 'string') return data;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(data); }
  catch { return input.fail('encoding', 'Expected UTF-8 MusicXML bytes.', [0, 0]); }
}

/** Let saxes handle XML syntax, entities and offsets. No external document is loaded. */
function readTree(source: string, bytes: boolean, input: Input): Element {
  const parser = new SaxesParser();
  const stack: Element[] = [];
  let root: Element | undefined, start = 0, count = 0;
  const here = (): TextRange => [Math.max(0, Math.min(parser.position - 1, source.length)), Math.min(parser.position, source.length)];
  parser.on('error', e => input.fail('syntax', e.message, here()));
  parser.on('xmldecl', d => {
    if (bytes && d.encoding && !/^utf-8$/i.test(d.encoding)) input.fail('encoding', 'Only UTF-8 bytes are supported.', [0, parser.position]);
  });
  parser.on('doctype', d => {
    if (d.includes('[')) input.fail('unsupported', 'Internal DTD subsets are outside this profile.', [0, parser.position]);
  });
  parser.on('processinginstruction', () => input.fail('unsupported', 'Unsupported processing instruction.', here()));
  parser.on('opentagstart', () => { start = source.lastIndexOf('<', parser.position - 1); });
  parser.on('opentag', tag => {
    if (stack.length >= 32 || ++count > 16384) input.fail('limit', 'XML element budget exceeded.', [start, parser.position]);
    const node: Element = { name: tag.name, attributes: tag.attributes, children: [], text: '', range: [start, parser.position] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root = node;
    stack.push(node);
  });
  function text(value: string) { if (stack.length) stack[stack.length - 1].text += value; }
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => { stack.pop()!.range[1] = parser.position; });
  parser.write(source).close();
  if (!root) return input.fail('syntax', 'Missing MusicXML root.', [0, source.length]);
  return root;
}

/** Reject unrecognized children and attributes before any construct can be silently discarded. */
function shape(node: Element, input: Input, children: string[], attributes: string[] = []) {
  for (const name of Object.keys(node.attributes)) {
    if (!attributes.includes(name)) input.fail('unsupported', 'Unsupported ' + node.name + ' attribute ' + name + '.', node.range);
  }
  for (const child of node.children) {
    if (!children.includes(child.name)) input.fail('unsupported', 'Unsupported ' + child.name + ' in ' + node.name + '.', child.range);
  }
  if (children.length && node.text.trim()) input.fail('syntax', 'Unexpected text in ' + node.name + '.', node.range);
}

/** Require exactly one selected child, or permit its absence when an explicit default exists. */
function one(node: Element, name: string, input: Input, optional = false) {
  const matches = node.children.filter(child => child.name === name);
  if (matches.length > 1) input.fail('unsupported', 'Only one ' + name + ' is supported here.', matches[1].range);
  if (!optional && !matches.length) input.fail('syntax', 'Missing ' + name + '.', node.range);
  return matches[0] as Element | undefined;
}

/** Scalar values cannot contain markup. */
function scalar(node: Element, name: string, input: Input, fallback?: string): string {
  const child = one(node, name, input, fallback !== undefined);
  if (!child) return fallback!;
  shape(child, input, []);
  return child.text.trim();
}

/** Integer divisions keep conversion to the shared binary grid exact. */
function positive(value: string, range: TextRange, input: Input) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 0x7fffffff)
    input.fail('unsupported', 'Expected a positive integer within the timing budget.', range);
  return Number(value);
}

/** Opening attributes describe the complete bar. Mid-measure changes require a later target profile. */
function readAttributes(node: Element, bar: Measure, input: Input) {
  shape(node, input, ['divisions', 'key', 'time', 'clef']);
  const key = one(node, 'key', input, true);
  if (key) {
    shape(key, input, ['fifths', 'mode']);
    const fifths = scalar(key, 'fifths', input);
    if (!/^-?[0-7]$/.test(fifths) || scalar(key, 'mode', input, 'major') !== 'major')
      input.fail('unsupported', 'Expected a traditional major key.', key.range);
    bar.key = keys[7 + Number(fifths)];
  }
  const time = one(node, 'time', input, true);
  if (time) {
    shape(time, input, ['beats', 'beat-type']);
    meter(scalar(time, 'beats', input), scalar(time, 'beat-type', input), bar, input, time.range);
  }
  const clef = one(node, 'clef', input, true);
  if (clef) {
    shape(clef, input, ['sign', 'line']);
    if (scalar(clef, 'sign', input) !== 'G' || scalar(clef, 'line', input) !== '2')
      input.fail('unsupported', 'Expected a treble clef.', clef.range);
  }
  return positive(scalar(node, 'divisions', input), node.range, input);
}

/** A cursor move uses elapsed divisions. Reject time that would require rounding. */
function elapsed(node: Element, divisions: number, input: Input) {
  return new Time(positive(scalar(node, 'duration', input), node.range, input), 4 * divisions);
}

/** Read the only timing-neutral loss authorized in partial mode. */
function notations(node: Element, input: Input) {
  shape(node, input, ['articulations']);
  for (const articulations of node.children) {
    shape(articulations, input, ['staccato']);
    for (const mark of articulations.children) {
      shape(mark, input, []);
      if (mark.text.trim()) input.fail('syntax', 'Expected an empty staccato mark.', mark.range);
      input.omitMark(mark.range);
    }
  }
}

/** Preserve pitch alteration independently from the active key and displayed accidentals. */
function readNote(node: Element, divisions: number, at: Time, bar: Measure, input: Input) {
  const voice = scalar(node, 'voice', input, '1');
  input.context.voice = voice;
  shape(node, input, ['pitch', 'rest', 'duration', 'voice', 'type', 'staff', 'notations']);
  if (!voice || scalar(node, 'staff', input, '1') !== '1') input.fail('unsupported', 'Expected one named voice on staff 1.', node.range);
  const duration = elapsed(node, divisions, input);
  const denominator = Number(duration.denominator);
  const names = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th', '128th', '256th'];
  const written = scalar(node, 'type', input, '');
  if (duration.numerator !== 1n || !Number.isInteger(Math.log2(denominator)) || denominator > 256 ||
      (written && names[Math.log2(denominator)] !== written)) input.fail('unsupported', 'Expected a matching undotted written value.', node.range);
  const p = one(node, 'pitch', input, true), rest = one(node, 'rest', input, true);
  if (Boolean(rest) === Boolean(p)) input.fail('syntax', 'Expected exactly one pitch or rest.', node.range);
  const event: Event = { kind: p ? 'attack' : 'rest', staff: 1, at, elapsed: duration, denominator, range: node.range };
  if (p) {
    shape(p, input, ['step', 'alter', 'octave']);
    const step = scalar(p, 'step', input), alter = scalar(p, 'alter', input, '0'), octave = scalar(p, 'octave', input);
    if (!/^[A-G]$/.test(step) || !/^-?[012]$/.test(alter) || !/^\d$/.test(octave))
      input.fail('unsupported', 'Unsupported pitch spelling or octave.', p.range);
    event.pitch = pitch(step, Number(alter), Number(octave));
  } else if (rest) {
    shape(rest, input, []);
    if (rest.text.trim()) input.fail('syntax', 'Expected an empty rest.', rest.range);
  }
  const marks = one(node, 'notations', input, true);
  if (marks) notations(marks, input);
  bar.add(voice, event, input);
  delete input.context.voice;
  return duration;
}

/** A backup changes the document cursor without changing the maximum extent of the measure. */
function readPart(root: Element, input: Input): [Measure, TextRange] {
  if (root.name !== 'score-partwise') input.fail('unsupported', 'Expected score-partwise MusicXML.', root.range);
  shape(root, input, ['part-list', 'part'], ['version']);
  if (!['3.1', '4.0'].includes(root.attributes.version)) input.fail('unsupported', 'Expected MusicXML 3.1 or 4.0.', root.range);
  const list = one(root, 'part-list', input)!;
  shape(list, input, ['score-part']);
  const definition = one(list, 'score-part', input)!;
  shape(definition, input, ['part-name'], ['id']);
  const part = one(root, 'part', input)!;
  shape(part, input, ['measure'], ['id']);
  if (!part.attributes.id || part.attributes.id !== definition.attributes.id) input.fail('syntax', 'Unmatched part ID.', part.range);
  const bar = new Measure();
  bar.part = part.attributes.id;
  bar.name = scalar(definition, 'part-name', input);
  const measure = one(part, 'measure', input)!;
  bar.label = measure.attributes.number ?? '1';
  input.context = { part: bar.part, measure: bar.label };
  shape(measure, input, ['attributes', 'note', 'backup'], ['number']);
  const opening = one(measure, 'attributes', input)!;
  if (measure.children[0] !== opening) input.fail('unsupported', 'Expected opening attributes.', opening.range);
  const divisions = readAttributes(opening, bar, input);
  let cursor = zero;
  for (const node of measure.children.slice(1)) {
    if (node.name === 'note') cursor = cursor.plus(readNote(node, divisions, cursor, bar, input));
    else {
      shape(node, input, ['duration']);
      cursor = cursor.minus(elapsed(node, divisions, input));
      if (cursor.compare(zero) < 0) input.fail('timing', 'Backup crosses the beginning of the measure.', node.range);
    }
  }
  return [bar, measure.range];
}

/** Convert plain UTF-8 bytes or decoded MusicXML text into editable VexTab. */
export function importMusicXML(source: string | Uint8Array, options: ImportOptions = {}): ImportResult {
  return convert(options, 'score.musicxml', input => readPart(readTree(sourceText(source, input), typeof source !== 'string', input), input));
}
