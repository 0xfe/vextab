// Compare complete orchestral and piano imports with an independent reader and the actual VexTab player.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { parseScore } from 'vextab/parse';
import { importMXL } from '../../../importer/dist/mxl.js';
import { importMusicXML } from '../../../importer/dist/musicxml.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const cache = join(root, 'build/importer-complex-musicxml');
const records = JSON.parse(readFileSync(join(here, 'sources.json')));
const options = { mode: 'partial', targetProfile: 'expressive', capacity: 'large' };
execFileSync('python3', [join(here, 'reference.py'), ...process.argv.slice(2)], { stdio: 'inherit' });

/** Bundle only the real host projection and playback entry points needed in Node. */
const player = join(cache, 'player.cjs');
buildSync({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    contents: [
      "export {projectScoreV2} from './src/score/grammar2/project.ts';",
      "export {measureVisits} from './src/playback/visits.ts';",
      "export {scorePerformance} from './src/playback/performance.ts';",
    ].join('\n'),
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  loader: { '.jison': 'text' },
  outfile: player,
});
const { projectScoreV2, measureVisits, scorePerformance } = createRequire(import.meta.url)(player);

/** Compare multisets to retain simultaneous unisons without depending on chord-head storage order. */
function equalRows(actual, expected, label) {
  const sorted = (rows) => rows.map((row) => JSON.stringify(row)).sort();
  const a = sorted(actual),
    b = sorted(expected);
  assert.equal(a.length, b.length, label + ' row count');
  const difference = a.findIndex((row, i) => row !== b[i]);
  if (difference !== -1) assert.equal(a[difference], b[difference], label + ' first differing row');
}

/** Use the importer's voice-name mapping only for identity; all musical values come from public parsing. */
function written(model, imported) {
  const rows = [], expression = [];
  let index = 0;
  for (const part of model.parts)
    for (const staff of part.staves) {
      const source = imported.staves[index++];
      for (const voice of staff.voices) {
        const original = source.voices.find((mapping) => mapping.target === voice.name).source;
        for (const event of voice.events) {
          if (event.kind === 'skip') continue;
          // Each qualified score retains voice ownership on one physical staff.
          assert.ok(!event.marks.some((mark) => mark.kind === 'onStaff'));
          const start = [source.part, source.staff, original, event.bar, event.at];
          if (event.kind === 'rest') rows.push([...start, event.duration, 'rest']);
          for (const head of event.heads) {
            const sustain = head.marks.find((m) => m.kind === 'sustain');
            const pitch = head.pitch.replace('n', '');
            rows.push([...start, sustain?.duration ?? event.duration, pitch]);
            expression.push([...start, pitch, event.marks.find(m => m.kind === 'stem')?.value ?? null,
              head.marks.find(m => m.kind === 'velocity')?.value ?? null]);
          }
        }
      }
    }
  return {rows, expression};
}

/** Check literal attacks against XML MIDI pitch, source tempo clock, tie release and authored velocity.
 * For a written trill, check its envelope and alternation before comparing the principal to the source.
 */
function performed(events, score) {
  const trills = new Set(score.measures.flatMap(bar => bar.voices.flatMap(voice =>
    voice.events.filter(note => note.ornament === 'tr').map(note => note.id))));
  const notes = [];
  const micros = seconds => Math.round(seconds * 1e6);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (trills.has(event.source)) {
      const pulses = [event];
      while (events[i+1]?.source === event.source) pulses.push(events[++i]);
      assert.equal(pulses.length, 5);
      const pitches = pulses.map(p => p.notes[0].pitch);
      assert.ok(pitches[1] > pitches[0] && pitches[1] <= pitches[0] + 2);
      assert.deepEqual(pitches, [pitches[0], pitches[1], pitches[0], pitches[1], pitches[0]]);
      const last = pulses.at(-1);
      notes.push([micros(event.time), pitches[0], micros(last.time + last.notes[0].duration),
        event.notes[0].fixedVelocity ? event.notes[0].velocity : null]);
    } else for (const note of event.notes) notes.push([micros(event.time), note.pitch,
      micros(event.time + note.duration), note.fixedVelocity ? note.velocity : null]);
  }
  return notes;
}

for (const record of records) {
  const archive = readFileSync(join(cache, record.file));
  const xml = readFileSync(join(cache, record.file.replace(/\.mxl$/, '.musicxml')));
  const compressed = await importMXL(archive, { ...options, filename: record.file });
  const plain = importMusicXML(xml, options);
  assert.equal(compressed.status, record.status, JSON.stringify(compressed.diagnostics.at(-1)));
  assert.equal(plain.status, record.status);
  const doc = compressed.documents[0];
  assert.equal(doc.text, plain.documents[0].text);
  writeFileSync(join(cache, record.file + '.vextab'), doc.text);
  const model = parseScore(doc.text, { capacity: 'large' });
  assert.equal(model.parts.length, record.parts);
  assert.ok(model.parts.every((p) => p.measureCount === record.bars));
  assert.equal(model.parts.flatMap((p) => p.staves.flatMap((s) => s.voices)).length, record.voices);
  const truth = JSON.parse(readFileSync(join(cache, record.file + '.reference.json')));
  const {rows, expression} = written(model, doc);
  if (truth.expression) {
    equalRows(expression, truth.expression, record.file + ' authored stems and velocities');
    assert.equal(expression.filter(row => row.at(-2) !== null).length, record.authoredStems);
    assert.equal(expression.filter(row => row.at(-1) !== null).length, record.authoredVelocities);
    assert.equal(Object.values(truth.played).reduce((n, part) => n + part.notes.length, 0), record.performedPrincipals);
  }
  equalRows(rows, truth.written, record.file + ' written');
  assert.equal(rows.filter((row) => row.at(-1) === 'rest').length, record.rests);
  assert.equal(rows.length, record.rests + record.pitchedHeads);
  let played = 0;
  const ids = [...new Set(doc.staves.map((staff) => staff.part))];
  for (let i = 0; i < model.parts.length; i++) {
    const score = projectScoreV2(model, i);
    const visits = measureVisits(score, true);
    const events = scorePerformance(score, score.playback?.tempo ?? 120, undefined, visits).events;
    played += events.reduce((sum, event) => sum + event.notes.length, 0);
    if (truth.played[ids[i]]) {
      const expected = truth.played[ids[i]];
      assert.deepEqual(visits, expected.visits);
      equalRows(performed(events, score), expected.notes, record.file + ' performed ' + ids[i]);
    }
  }
  assert.equal(played, record.playerAttacks);
  console.log(
    record.title +
      ' → ' +
      rows.length +
      ' verified written heads/rests, ' +
      played +
      ' performed notes' +
      (record.verifyPerformedTuples || record.verifyOrchestralTiming ? ' with every principal pitch/onset/release independently verified' : '') +
      '.',
  );
}
