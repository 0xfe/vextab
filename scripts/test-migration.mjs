// Verify conversion through the public readers, including the written source of ambiguous input.
import assert from 'node:assert/strict';
import { migrateScore } from './migrate-score.mjs';
import { parseScore } from '../dist/score.cjs';

const source = 'tabstave notation=true time=2/4\nnotes :8 3h5/1 3-2/1 |';
assert.throws(() => migrateScore(source), /technique.*line 2 column/);
assert.throws(() => migrateScore('tabstave strings=4'), /open strings.*line 1, column 10/);
assert.equal(migrateScore('tabstave'), 'guitar { view tab fragment {} }\n');
const before = 'options tab-stems=true\ntabstave time=2/4\nnotes :8 1-2-3/1 ^3^ :q 4/1 |';
const converted = migrateScore(before);
const voice = parseScore(converted, { language: 2 }).parts[0].staves[0].voices[0];
assert.deepEqual(voice.events.map(e => [e.heads[0].fret, e.at, e.duration]),
  [[1,'0/1','1/12'],[2,'1/12','1/12'],[3,'1/6','1/12'],[4,'1/4','1/4']]);

const silent = 'options player=false tempo=84\nstave time=1/4\nnotes :q C/4 |';
assert.deepEqual(parseScore(migrateScore(silent), { language: 2 }).playback, { enabled: false, tempo: 84 });
