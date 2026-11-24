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
  alias: { vexflow: 'vexflow/core' },
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
  const rows = [];
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
            rows.push([...start, sustain?.duration ?? event.duration, head.pitch.replace('n', '')]);
          }
        }
      }
    }
  return rows;
}

for (const record of records) {
  const archive = readFileSync(join(cache, record.file));
  const xml = readFileSync(join(cache, record.file.replace(/\.mxl$/, '.musicxml')));
  const compressed = await importMXL(archive, { ...options, filename: record.file });
  const plain = importMusicXML(xml, options);
  assert.equal(compressed.status, record.status, JSON.stringify(compressed.diagnostics.at(-1)));
  assert.equal(plain.status, record.status);
  if (record.status === 'failed') {
    for (const result of [compressed, plain]) {
      const error = result.diagnostics.at(-1);
      assert.deepEqual({ part: error.part, measure: error.measure, message: error.message }, record.failure);
      assert.match(xml.toString('utf8').slice(...error.range), /^<note\b[^>]*\bdynamics="/);
      assert.deepEqual(result.documents, []);
    }
    console.log(
      record.title +
        ' → ' +
        record.failure.message +
        ' (' +
        record.failure.part +
        ', measure ' +
        record.failure.measure +
        ')',
    );
    continue;
  }
  const doc = compressed.documents[0];
  assert.equal(doc.text, plain.documents[0].text);
  writeFileSync(join(cache, record.file + '.vextab'), doc.text);
  const model = parseScore(doc.text, { capacity: 'large' });
  assert.equal(model.parts.length, record.parts);
  assert.ok(model.parts.every((p) => p.measureCount === record.bars));
  assert.equal(model.parts.flatMap((p) => p.staves.flatMap((s) => s.voices)).length, record.voices);
  const truth = JSON.parse(readFileSync(join(cache, record.file + '.reference.json')));
  const rows = written(model, doc);
  equalRows(rows, truth.written, record.file + ' written');
  assert.equal(rows.filter((row) => row.at(-1) === 'rest').length, record.rests);
  assert.equal(rows.length, record.rests + record.pitchedHeads);
  let played = 0;
  const ids = [...new Set(doc.staves.map((staff) => staff.part))];
  for (let i = 0; i < model.parts.length; i++) {
    const score = projectScoreV2(model, i);
    const visits = measureVisits(score, true);
    const events = scorePerformance(score, 120, undefined, visits).events;
    played += events.reduce((sum, event) => sum + event.notes.length, 0);
    if (record.verifyPerformedTuples) {
      const expected = truth.played[ids[i]];
      assert.deepEqual(visits, expected.visits);
      const ticks = (sec) => Math.round(((sec * truth.quarterBPM) / 60) * 384);
      const notes = events.flatMap((event) =>
        event.notes.map((n) => [ticks(event.time), n.pitch, ticks(event.time + n.duration)]),
      );
      equalRows(notes, expected.notes, record.file + ' performed ' + ids[i]);
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
      (record.verifyPerformedTuples ? ' with every pitch/onset/release independently verified' : '') +
      '.',
  );
}
