// Compare public VexTab parse results to written pitch, time and staff observations from LilyPond 2.26.0.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importLilyPond } from '../../importer/dist/lilypond.js';
import { parseScore } from 'vextab/parse';

const dir = fileURLToPath(new URL('.', import.meta.url));
const names = ['relative', 'parallel', 'endings', 'context', 'maple-excerpt', 'maple-midi'];
const native = process.argv.includes('--native'), save = process.argv.includes('--write-reference');
const golden = join(dir, 'native-events.tsv');
if (save && !native) throw Error('--write-reference requires --native.');
const rows = [];
const observed = [];
const round = number => Number(number).toFixed(8);
const row = (score, staff, at, duration, midi) => [score, staff, round(at), round(duration), midi].join('\t');

/** The installed event listener records instrumentName. Set it to the source staff ID for this run. */
function nativeEvents(name, source) {
  const cwd = mkdtempSync(join(tmpdir(), 'vextab-lilypond-native-'));
  if (name.startsWith('maple-')) {
    const [music, print, midi] = source.split('% score-block');
    const block = name === 'maple-midi' ? midi.split('\\midi')[0].replaceAll('\\applyMusic #unfold-repeats', '\\unfoldRepeats') + '\\layout {} }' : print;
    source = (music + block).replace('"2.14.2"', '"2.26.0"');
  }
  source = source.replace(/(\\(?:new|context) Staff = "([^"]+)")/g, '$1 \\with { instrumentName = "$2" }');
  writeFileSync(join(cwd, name + '.ly'), '\\include "event-listener.ly"\n' + source);
  execFileSync('lilypond', ['-dno-print-pages', name + '.ly'], { cwd, stdio: 'pipe', env: { ...process.env, XDG_CACHE_HOME: cwd } });
  const out = [];
  for (const file of readdirSync(cwd).filter(f => f.endsWith('.notes'))) {
    const staff = file.slice(name.length + 1, -'.notes'.length);
    for (const line of readFileSync(join(cwd, file), 'utf8').trimEnd().split('\n')) {
      const [at, kind, pitch, duration, scaled] = line.split('\t');
      if (kind === 'rest') out.push(row(name, staff, at, duration, 'rest'));
      if (kind === 'note') out.push(row(name, staff, at, scaled, pitch));
    }
  }
  return out;
}

function fraction(value) {
  const [n, d] = value.split('/').map(Number);
  return n / d;
}

/** Imported notes carry explicit chromatic signs. Map their spelled pitches to native MIDI numbers. */
function midi(head) {
  const [, step, accidental, octave] = /^([A-G])(##|bb|#|b|n)?(\d+)$/.exec(head.pitch);
  const alter = { '': 0, n: 0, '#': 1, '##': 2, b: -1, bb: -2 }[accidental ?? ''];
  return (Number(octave) + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(step)] + alter;
}

/** Add each bar's exact written span before comparing the event listener’s rounded absolute times. */
function importedEvents(name, text) {
  const result = [];
  for (const part of parseScore(text).parts) for (const stave of part.staves) for (const voice of stave.voices) {
    const starts = [0];
    for (const bar of voice.measures) starts.push(starts.at(-1) + fraction(bar.span));
    for (const event of voice.events) {
      const hand = event.marks.find(m => m.kind === 'onStaff')?.hand ?? stave.name;
      const staff = hand === 'upper' ? 'up' : hand === 'lower' ? 'down' : 'solo';
      const at = starts[event.bar - 1] + fraction(event.at), duration = fraction(event.duration);
      if (event.kind === 'rest') result.push(row(name, staff, at, duration, 'rest'));
      for (const head of event.heads) result.push(row(name, staff, at, duration, midi(head)));
    }
  }
  return result;
}

if (native) assert.match(execFileSync('lilypond', ['--version'], {encoding: 'utf8'}), /^GNU LilyPond 2\.26\.0\b/);
for (const name of names) {
  const file = name === 'maple-midi' ? 'maple-excerpt' : name;
  const source = readFileSync(join(dir, file + '.ly'), 'utf8');
  if (native) observed.push(...nativeEvents(name, source));
  const r = importLilyPond(source, { mode: 'partial', score: name === 'maple-midi' ? 'midi' : 'print' });
  assert.equal(r.status, name.startsWith('maple-') ? 'partial' : 'exact', JSON.stringify(r.diagnostics));
  if (name === 'maple-excerpt') {
    assert.deepEqual(r.diagnostics.map(d => source.slice(...d.range)), ['\\f']);
  }
  if (name === 'maple-midi') {
    assert.deepEqual(r.diagnostics.map(d => d.message), ['MIDI output settings are outside the written-score profile.', 'Dynamic '+String.fromCharCode(92)+'f omitted.']);
    assert.equal(r.documents[0].staves[0].measures.length, 5);
  }
  rows.push(...importedEvents(name, r.documents[0].text));
}
if (save) writeFileSync(golden, observed.sort().join('\n') + '\n');
const reference = readFileSync(golden, 'utf8').trimEnd().split('\n');
if (native) assert.deepEqual(observed.sort(), reference);
assert.deepEqual(rows.sort(), reference);
console.log('Matched ' + rows.length + ' native staff, onset, duration and pitch/rest observations across ' + names.length + ' fixtures.');
