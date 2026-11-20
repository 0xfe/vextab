// Check source-preserving transposition through both compilers, playback and publication.
import { Artist, renderScorePart, Vex, VexTab } from '../src/browser';
import { readScore } from './read-score';
import { artistPerformance, scorePerformance } from '../src/playback/performance';

/** Render the fixed Artist before requesting its voices for playback. */
function fixed(source: string) {
  const artist = new Artist(10, 10, 600);
  const host = document.createElement('div');
  document.getElementById('qunit-fixture').append(host);
  new VexTab(artist, { language: 1 }).parse(source);
  artist.draw(new Vex.Flow.Renderer(host, Vex.Flow.Renderer.Backends.SVG));
  return artist;
}

QUnit.module('Transposition', () => {
  QUnit.test('Named notes, accidentals, and octave crossings sound the same in both renderers', assert => {
    const source = 'transpose +2 meter 4/4 staff { key C B3 E4 En4 E4 | }';
    const parsed = readScore(source);
    assert.equal(parsed.source, source);
    assert.equal(parsed.measures[0].state.key, 'D');
    const heads = parsed.measures[0].voices[0].events.map(e => e.heads[0]);
    assert.deepEqual(heads.map(h => h.written), ['c#/4', 'f#/4', 'f#/4', 'f#/4']);
    assert.equal(source.slice(heads[0].range.start, heads[0].range.end), 'B3');
    const sharpened = source.replace('E4 En4 E4', 'E4 Eb4 Eb4');
    const pitches = performance => performance.events.flatMap(e => e.notes.map(n => n.pitch));
    assert.deepEqual(pitches(scorePerformance(readScore(sharpened), 120)), [61, 66, 65, 65]);
    const artist = fixed('options transpose=+2\nstave key=C time=4/4\nnotes :q B/3 E-E@-E/4');
    assert.equal(artist.staves[0].key, 'D');
    assert.deepEqual(pitches(artistPerformance(artist, 120)), [61, 66, 65, 65]);
  });

  QUnit.test('Physical strings and capo survive a downward minor-key shift, including mute and pre-bend', assert => {
    const source = 'transpose -4 meter 3/4 guitar { key Am capo 2 5/3[prebend +2 release] x/3 7/3 | }';
    const parsed = readScore(source);
    const events = parsed.measures[0].voices[0].events;
    assert.equal(parsed.measures[0].state.key, 'Fm');
    assert.equal(parsed.measures[0].state.capo, 2);
    assert.deepEqual(events.map(e => e.heads[0].position), [{ str: 3, fret: 1 }, { str: 3, fret: 'X' }, { str: 3, fret: 3 }]);
    assert.deepEqual(events.map(e => e.heads[0].sounding), ['c/4', null, 'c/4']);
    assert.equal(events[0].heads[0].prebend.semitones, 2);
    const artist = fixed('options transpose=-4\ntabstave key=Am notation=true capo=2 time=3/4\nnotes :q 5z7z5/3 X/3 7/3');
    assert.deepEqual(artistPerformance(artist, 120).events.flatMap(e => e.notes.map(n => n.pitch)), [60, 60]);
    const host = document.createElement('div');
    document.getElementById('qunit-fixture').append(host);
    assert.ok(renderScorePart(host, parsed, 'tab').publication.pages[0].svg.querySelector('metadata'));
  });

  QUnit.test('Key changes propagate to other voices, and structured chord names and frames follow the frets', assert => {
    const source = 'transpose +2 meter 1/4 staff { key C key Gb at 2 voice high stem up { C4 | G4 | A4 | } voice low stem down { C3 | G3 | A3 | } }';
    const score = readScore(source);
    assert.deepEqual(score.measures.map(m => m.state.key), ['D','Ab','Ab']);
    assert.deepEqual(score.measures.map(m => m.voices[1].events[0].heads[0].sounding), ['d/3','ab/3','bb/3']);
    const harmony = readScore('transpose +2 meter 1/4 guitar { (0/1 1/2)[symbol "Cmaj7/E", frame (x x x x 1 0)] | }');
    const attack = harmony.measures[0].voices[0].events[0];
    assert.equal(attack.chord.text, 'Dmaj7/F#');
    assert.deepEqual(attack.frame.spec.frets, ['x','x','x','x',3,2]);
    const open = readScore('transpose -1 meter 1/4 guitar { (1/1 1/2)[symbol "F", frame (x x x x 1 1) barre=1/2..1] | }');
    assert.deepEqual(open.measures[0].voices[0].events[0].frame.spec.frets, ['x','x','x','x',0,0]);
    assert.notOk(open.measures[0].voices[0].events[0].frame.spec.barre);
  });

  QUnit.test('Invalid shifts report the authored option or attack', assert => {
    const over = 'transpose -4 meter 1/4 guitar { 2/1 | }';
    try { readScore(over); assert.true(false, 'Expected an unplayable fret'); }
    catch (error) { assert.equal(over.slice(error.range.start, error.range.end), '2/1'); }
    assert.throws(() => fixed('options transpose=-4\ntabstave time=1/4\nnotes 2/1'), /outside the original string/);
    assert.throws(() => readScore('transpose 1.5 meter 1/4 staff { C4 | }'), /integer/);
    assert.throws(() => readScore('meter 1/4 staff { C4 | } transpose 3'), /before the first part/);
    const playable = 'transpose +1 meter 1/4 staff { key Gb G9 | }';
    assert.equal(scorePerformance(readScore(playable), 120).events[0].notes[0].pitch, 127);
    assert.equal(artistPerformance(fixed('options transpose=1\nstave key=Gb time=1/4\nnotes G/9'), 120).events[0].notes[0].pitch, 127);
    const tooHigh = 'transpose +2 meter 1/4 staff { key G F9 | }';
    assert.throws(() => readScore(tooHigh), /MIDI range/);
    assert.throws(() => fixed('options transpose=2\nstave key=G time=1/4\nnotes F/9'), /MIDI range/);
    assert.throws(() => readScore('transpose 120 meter 1/4 staff { C4 | }'), /MIDI range/);
    assert.throws(() => readScore('transpose 120 meter 1/4 guitar { 2/1 | }'), /MIDI range/);
  });
});
