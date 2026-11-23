// Check that only an explicit host option raises compiler limits, including through the editor parser.
import assert from 'node:assert/strict';
import { parseScore } from 'vextab/parse';

const small = 'staff { :w C4 | }';
const many = 'staff { times 32 { times 32 { :q C4 D4 E4 F4 | } } :w G4 | }';
const overTokens = 'staff { ' + ':q C4 D4 E4 F4 | '.repeat(1400) + '}';
const exactBytes = 1024 * 1024;
const padded = small + ' //' + ' '.repeat(exactBytes - small.length - 3);

/** A failure identifies both the budget dimension and an offset in the submitted document. */
function expectLimit(source, options, code) {
  assert.throws(() => parseScore(source, options), e => e.code === code && e.range[0] <= source.length);
}

assert.deepEqual(parseScore(small), parseScore(small, { capacity: 'large' }));
expectLimit(many, {}, 'event-limit');
assert.equal(parseScore(many, { capacity: 'large' }).parts[0].staves[0].voices[0].events.length, 4097);
expectLimit(overTokens, {}, 'token-limit');
assert.equal(parseScore(overTokens, { capacity: 'large' }).parts[0].measureCount, 1400);
expectLimit(padded, {}, 'source-limit');
assert.equal(parseScore(padded, { capacity: 'large' }).parts[0].measureCount, 1);
expectLimit(padded + ' ', { capacity: 'large' }, 'source-limit');
expectLimit('staff { times 9 { times 32 { times 32 { C4 D4 E4 F4 | } } } }', { capacity: 'large' }, 'event-limit');
assert.throws(() => parseScore(small, {capacity: 'unlimited'}), RangeError);
console.log('Host defaults, independent revisions, large parser budgets and fixed upper bounds passed.');
