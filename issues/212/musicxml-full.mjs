// Reparse complete imports and compare every written event and actual performed note against independent editions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { parseScore } from 'vextab/parse';
import { importMusicXML } from '../../importer/dist/musicxml.js';
import { importMXL } from '../../importer/dist/mxl.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../..');
const cache = join(root, 'build/importer-m5/musicxml');
const dir = mkdtempSync(join(tmpdir(), 'vextab-xml-player-'));
const held = process.argv.includes('--held-out');
const options = { mode: 'partial', targetProfile: 'expressive', capacity: 'large' };
const counts = {};
const corpus = JSON.parse(readFileSync(join(here, 'musicxml-corpus.json'), 'utf8'));
for (const [name, record] of Object.entries(corpus['W3C navigation controls'])) {
  if (record.sha256)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(here, 'musicxml', name)))
        .digest('hex'),
      record.sha256,
    );
}

/** Run the same projection, repeat traversal and literal sequencer used by the player. */
function loadPlayer() {
  const path = join(dir, 'player.cjs');
  buildSync({
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
    outfile: path,
  });
  return createRequire(import.meta.url)(path);
}

const ticks = (rational) => {
  const [n, d] = rational.split('/').map(Number);
  assert.equal((n * 1536) % d, 0);
  return (n * 1536) / d;
};

try {
  const { projectScoreV2, measureVisits, scorePerformance } = loadPlayer();
  const reference = JSON.parse(
    execFileSync('python3', [join(here, 'musicxml-reference.py'), ...(held ? ['--held-out'] : [])]),
  );
  for (const [name, truth] of Object.entries(reference)) {
    const bach = name === 'bwv269';
    const path = join(bach ? cache : join(here, 'musicxml'), name + '.mxl');
    const archive = readFileSync(path);
    const xml = execFileSync('python3', [
      '-c',
      'from zipfile import ZipFile; import sys; sys.stdout.buffer.write(ZipFile(sys.argv[1]).read(sys.argv[2]))',
      path,
      bach ? 'bwv269.xml' : 'Echigo-Jishi.musicxml',
    ]);
    const mxl = await importMXL(archive, options);
    const plain = importMusicXML(xml, options);
    assert.equal(mxl.status, 'partial', JSON.stringify(mxl.diagnostics.at(-1)));
    assert.equal(plain.status, mxl.status);
    assert.equal(mxl.documents[0].text, plain.documents[0].text);
    const model = parseScore(mxl.documents[0].text, { capacity: 'large' });
    assert.equal(model.parts.length, truth.written.length);
    let events = 0,
      sounds = 0;
    for (const [i, part] of model.parts.entries()) {
      const v = part.staves[0].voices[0];
      const written = v.events
        .filter((e) => e.kind !== 'skip')
        .map((e) => [
          e.bar,
          ticks(e.at),
          ticks(e.duration),
          e.heads[0]?.pitch.replace('n', '') ?? null,
          e.marks.filter((m) => m.kind === 'lyric').map((m) => m.text),
        ]);
      assert.deepEqual(written, truth.written[i].rows, name + ' written staff ' + (i + 1));
      const score = projectScoreV2(model, i);
      assert.deepEqual(
        score.measures.map((m) => ticks(m.span)),
        truth.written[i].bars,
        name + ' bar lengths',
      );
      const visits = measureVisits(score, true);
      const order = truth.written[i].bars.map((_, i) => i + 1);
      assert.deepEqual(visits, bach ? [...order.slice(0, 8), ...order] : order);
      const bpm = bach ? 60 : 92;
      const pulse = (seconds) => Math.round(((seconds * bpm) / 60) * 384);
      const rows = scorePerformance(score, bach ? 60 : 120, undefined, visits).events.flatMap((e) =>
        e.notes.map((n) => [pulse(e.time), n.pitch, pulse(e.time + n.duration)]),
      );
      assert.deepEqual(rows, truth.performance[i], name + ' performed staff ' + (i + 1));
      if (bach) {
        // The independent edition ties two alto attacks that the XML edition rearticulates.
        const only = (a, b) => {
          const other = new Set(b.map(String));
          return a.filter((row) => !other.has(String(row)));
        };
        const other = truth.crossEdition[i];
        assert.deepEqual(
          only(rows, other),
          i === 1
            ? [
                [16128, 67, 16512],
                [16512, 67, 16704],
                [26496, 66, 26880],
                [26880, 66, 27072],
              ]
            : [],
        );
        assert.deepEqual(
          only(other, rows),
          i === 1
            ? [
                [16128, 67, 16704],
                [26496, 66, 27072],
              ]
            : [],
        );
      }
      events += written.length;
      sounds += rows.length;
    }
    counts[name] = {
      parts: model.parts.length,
      measures: model.measureCount,
      written: events,
      attacks: sounds,
    };
    assert.deepEqual(counts[name], {
      parts: corpus[name].parts,
      measures: corpus[name].barsPerPart,
      written: corpus[name].writtenEvents,
      attacks: corpus[name].performedAttacks,
    });
  }
  // W3C annotations specify the form independently of the importer and of the player.
  for (const [file, visits, minimum] of [
    ['45a-SimpleRepeat.musicxml', [1, 1, 1, 1, 1, 2], '6.5.0'],
    ['45b-RepeatWithAlternatives.musicxml', [1, 2, 1, 3, 4], '6.4.0'],
  ]) {
    const source = readFileSync(join(here, 'musicxml', file));
    const r = importMusicXML(source, options);
    assert.equal(r.status, 'partial');
    assert.equal(r.target.minimumVersion, minimum);
    const projected = projectScoreV2(parseScore(r.documents[0].text));
    assert.deepEqual(measureVisits(projected, true), visits);
    assert.equal(projected.measures.length, Math.max(...visits));
    if (file.startsWith('45a')) {
      assert.equal(projected.measures[0].voices[0].events[0].labels[0].text, '×5');
      assert.equal(scorePerformance(projected, 60, undefined, visits).duration, 24);
      assert.equal(importMusicXML(source, { ...options, targetProfile: 'extended' }).status, 'failed');
    }
  }
  const multiple = readFileSync(join(here, 'musicxml/45d-Repeats-MultipleEndings.musicxml'), 'utf8');
  const rejected = importMusicXML(multiple, options);
  assert.equal(rejected.status, 'failed');
  assert.match(multiple.slice(...rejected.diagnostics.at(-1).range), /number="3, 5, 7"/);
  const quartet = readFileSync(join(here, '../210/fixtures/haydn.mxl'));
  const haydn = await importMXL(quartet, { ...options, selection: { firstMeasure: 1, lastMeasure: 128 } });
  assert.equal(haydn.status, 'partial', JSON.stringify(haydn.diagnostics.at(-1)));
  const opening = parseScore(haydn.documents[0].text, { capacity: 'large' });
  const series = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => i + start);
  const itinerary = [
    ...series(1, 47),
    ...series(1, 44),
    48,
    ...series(49, 126),
    ...series(49, 123),
    127,
    128,
  ];
  for (let i = 0; i < 4; i++) {
    const projected = projectScoreV2(opening, i);
    assert.deepEqual(measureVisits(projected, true), itinerary);
    assert.deepEqual(
      projected.repeats.map((r) => [r.first, r.bodyEnd, r.endings]),
      [
        [
          1,
          44,
          [
            { first: 45, last: 47 },
            { first: 48, last: 48 },
          ],
        ],
        [
          49,
          123,
          [
            { first: 124, last: 126 },
            { first: 127, last: 128 },
          ],
        ],
      ],
    );
  }
  const cello = await importMXL(quartet, {
    ...options,
    selection: { parts: ['P4'], firstMeasure: 1, lastMeasure: 128 },
  });
  assert.deepEqual(
    measureVisits(projectScoreV2(parseScore(cello.documents[0].text, { capacity: 'large' })), true),
    itinerary,
  );
  const whole = await importMXL(quartet, options);
  assert.equal(whole.status, 'failed');
  assert.match(whole.diagnostics.at(-1).message, /Sound navigation/);
  assert.equal(whole.diagnostics.at(-1).measure, '56');
  if (held) {
    const r = await importMXL(readFileSync(join(cache, 'Dichterliebe01.mxl')), options);
    assert.equal(r.status, 'failed');
    assert.equal(r.diagnostics.at(-1).measure, '26');
    assert.match(r.diagnostics.at(-1).message, /Written value disagrees/);
  }
  console.log(JSON.stringify(counts));
  console.log(
    'Haydn I, all four parts: ' +
      itinerary.length +
      ' performed measure visits. Whole Haydn stops at its Fine jump.',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
