// Check the four worked editing tasks directly from the musician review sheet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compile } from '../../experiments/grammarv2/compiler.mjs';

const sheet = readFileSync(new URL('./editing-tasks.md', import.meta.url), 'utf8');
const answers = [...sheet.matchAll(/^```vextab2\n([\s\S]*?)^```$/gm)].map(match => match[1]);
assert.equal(answers.length, 4, 'each task needs one executable answer');

/** Find the edited voice by name so reordering voices cannot change the expectations. */
function voice(score, staff, name = 'main') {
  return score.parts[0].staves.find(s => s.name === staff).voices.find(v => v.name === name).events;
}

test('move the third attack while preserving the four pitches and onsets', () => {
  const events = voice(compile(answers[0]), 'main');
  const openStrings = [64, 59, 55, 50, 45, 40];
  assert.deepEqual(events.map(e => e.heads[0].string), [1, 1, 2, 1]);
  assert.deepEqual(events.map(e => openStrings[e.heads[0].string - 1] + e.heads[0].fret), [64, 66, 67, 66]);
  assert.deepEqual(events.map(e => e.at), ['0/1', '1/4', '1/2', '3/4']);
  assert.ok(events.every(e => e.duration === '1/4'));
});

test('the fingering follows string two when the chord heads change order', () => {
  const events = voice(compile(answers[1]), 'main');
  assert.deepEqual(events.map(e => e.heads.map(h => h.string)), [[2, 3, 4, 5], [5, 4, 3, 2]]);
  for (const event of events) {
    assert.equal(event.duration, '1/4');
    const fingers = event.heads.flatMap(head => head.marks.map(mark =>
      [head.string, head.fret, mark.kind, mark.value, mark.side]));
    assert.deepEqual(fingers, [[2, 2, 'finger', 2, 'right']]);
  }
});

test('splitting the alto half note leaves the soprano and bass unchanged', () => {
  const source = answers[2];
  const before = compile(source.replace('E4 F4', ':h E4'));
  const after = compile(source);
  const notes = events => events.map(e => [e.heads[0].pitch, e.at, e.duration]);
  assert.deepEqual(notes(voice(after, 'upper', 'soprano')), notes(voice(before, 'upper', 'soprano')));
  assert.deepEqual(notes(voice(after, 'lower')), [['C3', '0/1', '1/2']]);
  assert.deepEqual(notes(voice(after, 'lower')), notes(voice(before, 'lower')));
  assert.deepEqual(notes(voice(before, 'upper', 'alto')), [['E4', '0/1', '1/2']]);
  assert.deepEqual(notes(voice(after, 'upper', 'alto')), [['E4', '0/1', '1/4'], ['F4', '1/4', '1/4']]);
});

test('editing one pattern head updates both written copies with a shared source selection', () => {
  const source = answers[3];
  const score = compile(source);
  const upper = voice(score, 'upper');
  const thirds = upper.filter(e => e.at === '1/4');
  assert.deepEqual(thirds.map(e => [e.bar, e.heads[0].pitch]), [[1, 'F5'], [2, 'F5']]);
  assert.notEqual(thirds[0].id, thirds[1].id);
  for (const event of thirds) assert.equal(source.slice(...event.heads[0].range), 'F5');
  assert.deepEqual(thirds[0].heads[0].range, thirds[1].heads[0].range);
  assert.deepEqual(voice(score, 'lower').map(e => e.heads[0].pitch), ['C3', 'G2']);
});
