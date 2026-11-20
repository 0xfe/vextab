// Compile the proposal's executable examples and exercise musical invariants and expansion limits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compile } from './compiler.mjs';

const events = (score, part = 0, staff = 0, voice = 0) => score.parts[part].staves[staff].voices[voice].events;
const errorCode = (source, code) => assert.throws(() => compile(source), error => error.code === code);

/** Keep the published examples directly executable. Their prose names describe these musical results. */
test('the examples printed in the proposal compile with the expected music', () => {
  const proposal = readFileSync(new URL('../../docs/grammarv2.md', import.meta.url), 'utf8');
  const examples = [...proposal.matchAll(/^```vextab2\n(.*?)^```$/gms)].map(match => compile(match[1]));
  assert.equal(examples.length, 5);
  const [frets, fingering, duet, keyboard, band] = examples;
  assert.deepEqual(events(frets).map(e => e.heads[0].fret), [0, 2, 3, 2]);
  assert.deepEqual(events(fingering).map(e => e.heads[0].marks.find(x => x.kind === 'finger').side), ['left', 'left', 'right']);
  assert.deepEqual(events(fingering)[1].heads[0].hammerFrom, {event:events(fingering)[0].id, head:0});
  assert.equal(events(fingering)[2].marks[0].kind, 'accent');
  assert.deepEqual(events(duet, 0, 0, 1).map(e => [e.at,e.duration]), [['0/1','1/2'], ['1/2','1/2']]);
  assert.deepEqual(events(duet).map(e => e.at), ['0/1', '1/4', '1/2', '3/4']);
  assert.equal(events(keyboard).length, 8);
  assert.deepEqual(events(keyboard, 0, 1).map(e => [e.bar,e.at]), [[1, '0/1'], [2, '0/1']]);
  assert.deepEqual(events(band)[0].heads.map(h => h.drum), ['kick', 'hat']);
  assert.deepEqual(events(band, 1).map(e => e.at), ['0/1', '1/12', '1/6', '1/4']);
  assert.equal(events(band, 1)[0].writtenDuration, '1/8');
});

/** Two occurrences point back to one authored head and two distinguishable expansion paths. */
test('UTF-16 ranges survive CRLF and non-BMP comments, patterns, and repetition', () => {
  const text = '// 🎸\r\npattern riff { (5/2[finger 2] 7/3)[accent] }\r\nguitar { times 4 { use riff } | }';
  const notes = events(compile(text));
  for (const [index,event] of notes.entries()) {
    assert.equal(text.slice(...event.heads[0].range), '5/2');
    assert.equal(text.slice(...event.heads[0].marks[0].range), 'finger 2');
    assert.equal(text.slice(...event.marks[0].range), 'accent');
    assert.equal(text.slice(...event.trace[1].range), 'use riff');
    assert.equal(event.trace[0].iteration, index + 1);
  }
  assert.equal(new Set(notes.map(e => e.id)).size, 4);
});

/** Each phrase invocation starts with quarters; every repetition inherits the same caller rhythm. */
test('duration changes stay within their voice, pattern, tuplet or iteration', () => {
  const score = compile('pattern quarter { C4 } staff { :8 times 2 { D4 :16 E4 F4 } use quarter G4 A4 | }');
  assert.deepEqual(events(score).map(e => e.duration), ['1/8','1/16','1/16','1/8','1/16','1/16','1/4','1/8','1/8']);
  const dots = events(compile('staff { :q.. C4 :16 D4 :h E4 | }'));
  assert.deepEqual(dots.map(e => e.duration), ['7/16','1/16','1/2']);
  const rests = events(compile('staff { :h rest skip | }'));
  assert.deepEqual(rests.map(e => [e.kind, e.at]), [['rest','0/1'],['skip','1/2']]);
});

/** Bar errors keep the written delimiter and the use site. Staff and voice clocks must agree. */
test('locates unfilled, overfilled and misaligned measures', () => {
  const text = 'pattern bad { C4 | }\nstaff { use bad }';
  assert.throws(() => compile(text), error => error.code === 'bar-length' &&
    text.slice(...error.range) === '|' && text.slice(...error.trace[0].range) === 'use bad');
  errorCode('staff { :w C4 D4 | }', 'bar-length');
  errorCode('staff { C4 }', 'bar-length');
  errorCode('piano { upper { :w C4 | D4 | } lower { :w C2 | } }', 'alignment');
});

/** Cycles, unsupported constructs and invalid attachment targets fail at their authored location. */
test('rejects bad syntax and domain values without executing score text', () => {
  for (const source of [
    'pattern recurse { use recurse } guitar { 0/1 | }',
    'pattern a { use b } pattern b { use a } staff { :w A4 | }',
    'staff { times forever { :w A4 | } }',
    'staff { while { A4 } }', 'staff { (C4 E4)[finger 3] }',
    'guitar { (3/1 5/1) }', 'drums { (hat hat) }', 'staff { C4[finger] }',
    'meter', 'guitar {', 'guitar { (', 'guitar { :16 C4[', 'pattern x { times',
    'staff { voice low { :w C4 | } voice low { :w C3 | } }',
  ]) errorCode(source, 'syntax');
  errorCode('staff { :w 5/3 | }', 'instrument');
  errorCode('drums { :w C4 | }', 'instrument');
  errorCode('guitar { :h 4/3 6/2[hammer] | }', 'hammer');
});

/** Structural caps apply across voices and to empty expansions, independent of wall-clock speed. */
test('bounds bytes, tokens, written depth, call depth, work, output and rational size', () => {
  errorCode(' '.repeat(65537), 'source-limit');
  errorCode('// ' + '🎹'.repeat(16384), 'source-limit');
  errorCode('guitar { ' + 'A4 '.repeat(8192) + '}', 'token-limit');
  errorCode('staff { ' + 'times 1 { '.repeat(25) + 'A4' + ' }'.repeat(26), 'depth-limit');
  let chain = 'pattern p0 { :w A4 | } ';
  for (let i = 1; i <= 25; i++) chain += 'pattern p' + i + ' { use p' + (i-1) + ' } ';
  errorCode(chain + 'staff { use p25 }', 'depth-limit');
  errorCode('staff { times 32 { times 32 { times 32 {} } } }', 'work-limit');
  errorCode('staff { times 32 { times 32 { :16 A4 B4 C4 D4 E4 F4 G4 A4 B4 C4 D4 E4 F4 G4 A4 B4 | } } }', 'event-limit');
  errorCode('staff { ' + 'tuplet 16:1 { '.repeat(9) + 'A4' + ' }'.repeat(10), 'fraction-limit');
});
