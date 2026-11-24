// Prepare identical inputs and observations for cold Node processes and browser workers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const output = 'build/importer-m0';

/** Two independent encodings of a 32-bar melody make the emit measurement directly comparable. */
export function controls() {
  const encode = text => new TextEncoder().encode(text);
  const part = '<score-part id="p"><part-name>Control</part-name></score-part>';
  const xml = Array.from({ length: 32 }, (_, bar) => {
    const attributes = bar ? '' : '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
    const notes = [...'CDEF'].map(step => '<note><pitch><step>' + step + '</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>').join('');
    return '<measure number="' + (bar + 1) + '">' + attributes + notes + '</measure>';
  }).join('');
  const twoVoices = xml.replaceAll('</measure>', '<backup><duration>4</duration></backup>'
    + '<note><rest/><duration>4</duration><voice>2</voice><type>whole</type></note></measure>');
  const duet = encode('<score-partwise version="4.0"><part-list>' + part + '</part-list><part id="p">' + twoVoices + '</part></score-partwise>');
  const repeated = encode('theme = { ' + "c'4 d'4 e'4 f'4 | " + '} { ' + String.raw`\theme `.repeat(4096) + '}');
  const melody = encode('<score-partwise version="4.0"><part-list>' + part + '</part-list><part id="p">' + xml + '</part></score-partwise>');
  const lily = encode("{ " + "c'4 d'4 e'4 f'4 | ".repeat(32) + '}');
  return [
    { name: 'xml32', entry: 'musicxml', bytes: melody, emit: true },
    { name: 'ly32', entry: 'lilypond', bytes: lily, emit: true },
    { name: 'duet32', entry: 'musicxml', bytes: duet },
    { name: 'repeated', entry: 'lilypond', bytes: repeated },
  ];
}

/** Include the digest-pinned repertoire for the full M0 benchmark. */
export function workloads() {
  const load = name => new Uint8Array(readFileSync(join(output, name)));
  return [
    ...controls(),
    { name: 'excerpt', entry: 'musicxml', bytes: load('excerpt.musicxml') },
    { name: 'quartet', entry: 'musicxml', bytes: load('full.musicxml') },
    { name: 'archive', entry: 'mxl', bytes: load('haydn.mxl') },
    { name: 'rag', entry: 'lilypond', bytes: load('maple.ly') },
  ];
}

/** Nearest-rank p95, with millisecond reporting precise enough for the small-score controls. */
export function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = q => Number(sorted[Math.ceil(sorted.length * q) - 1].toFixed(3));
  return { median: at(0.5), p95: at(0.95) };
}
