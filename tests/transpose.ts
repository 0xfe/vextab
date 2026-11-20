// Check source-preserving transposition through both compilers, playback and publication.
import { Artist, parseScore, renderScorePart, Vex, VexTab } from '../src/browser';
import { artistPerformance, scorePerformance } from '../src/playback/performance';

/** Render the fixed Artist before requesting its voices for playback. */
function fixed(source: string) {
  const artist = new Artist(10, 10, 600);
  const host = document.createElement('div');
  document.getElementById('qunit-fixture').append(host);
  new VexTab(artist).parse(source);
  artist.draw(new Vex.Flow.Renderer(host, Vex.Flow.Renderer.Backends.SVG));
  return artist;
}

QUnit.module('Transposition', () => {
  QUnit.test('Named notes, accidentals, and octave crossings sound the same in both renderers', assert => {
    const source = 'options transpose=+2\nstave key=C time=4/4\nnotes :q B/3 E-En-E/4';
    const parsed = parseScore(source);
    assert.equal(parsed.source, source);
    assert.equal(parsed.measures[0].state.key, 'D');
    const heads = parsed.measures[0].voices[0].events.map(e => e.heads[0]);
    assert.deepEqual(heads.map(h => h.written), ['c#/4', 'f#/4', 'f#/4', 'f#/4']);
    assert.equal(source.slice(heads[0].range.start, heads[0].range.end), 'B/3');
    const sharpened = source.replace('E-En-E', 'E-E@-E');
    const pitches = performance => performance.events.flatMap(e => e.notes.map(n => n.pitch));
    assert.deepEqual(pitches(scorePerformance(parseScore(sharpened), 120)), [61, 66, 65, 65]);
    const artist = fixed(sharpened);
    assert.equal(artist.staves[0].key, 'D');
    assert.deepEqual(pitches(artistPerformance(artist, 120, () => {})), [61, 66, 65, 65]);
  });

  QUnit.test('Physical strings and capo survive a downward minor-key shift, including mute and pre-bend', assert => {
    const source = 'options transpose=-4\ntabstave key=Am notation=true capo=2 time=3/4\nnotes :q 5z7z5/3 X/3 7/3';
    const parsed = parseScore(source);
    const events = parsed.measures[0].voices[0].events;
    assert.equal(parsed.measures[0].state.key, 'Fm');
    assert.equal(parsed.measures[0].state.capo, 2);
    assert.deepEqual(events.map(e => e.heads[0].position), [{ str: 3, fret: 1 }, { str: 3, fret: 'X' }, { str: 3, fret: 3 }]);
    assert.deepEqual(events.map(e => e.heads[0].sounding), ['c/4', null, 'c/4']);
    assert.equal(events[0].heads[0].prebend.semitones, 2);
    const artist = fixed(source);
    assert.deepEqual(artistPerformance(artist, 120, () => {}).events.flatMap(e => e.notes.map(n => n.pitch)), [60, 60]);
    const host = document.createElement('div');
    document.getElementById('qunit-fixture').append(host);
    assert.ok(renderScorePart(host, parsed, 'tab').publication.pages[0].svg.querySelector('metadata'));
  });

  QUnit.test('Key changes propagate to other voices, and structured chord names and frames follow the frets', assert => {
    const source = 'options transpose=+2\nstave key=C time=1/4 voice=top\nnotes :q C/4 | !key Gb! G/4 | A/4\nvoice voice=bottom\nnotes :q C/3 | G/3 | A/3';
    const score = parseScore(source);
    assert.deepEqual(score.measures.map(m => m.state.key), ['D','Ab','Ab']);
    assert.deepEqual(score.measures.map(m => m.voices[1].events[0].heads[0].sounding), ['d/3','ab/3','bb/3']);
    const harmony = parseScore('options transpose=+2\ntabstave time=1/4\nnotes :q (0/1.1/2) !chord "Cmaj7/E"! !frame x,x,x,x,1,0!');
    const attack = harmony.measures[0].voices[0].events[0];
    assert.equal(attack.chord.text, 'Dmaj7/F#');
    assert.deepEqual(attack.frame.spec.frets, ['x','x','x','x',3,2]);
    const open = parseScore('options transpose=-1\ntabstave time=1/4\nnotes :q (1/1.1/2) !chord "F"! !frame x,x,x,x,1,1 barre=1:2-1!');
    assert.deepEqual(open.measures[0].voices[0].events[0].frame.spec.frets, ['x','x','x','x',0,0]);
    assert.notOk(open.measures[0].voices[0].events[0].frame.spec.barre);
  });

  QUnit.test('Invalid shifts report the authored option or attack', assert => {
    const over = 'options transpose=-4\ntabstave time=1/4\nnotes 2/1';
    try { parseScore(over); assert.true(false, 'Expected an unplayable fret'); }
    catch (error) { assert.equal(over.slice(error.range.start, error.range.end), '2/1'); }
    assert.throws(() => fixed(over), /outside the original string/);
    assert.throws(() => parseScore('options transpose=1.5\nstave\nnotes C/4'), /integer/);
    assert.throws(() => parseScore('stave time=1/4\nnotes C/4\noptions transpose=3'), /before the first stave/);
    const playable = 'options transpose=1\nstave key=Gb time=1/4\nnotes G/9';
    assert.equal(scorePerformance(parseScore(playable), 120).events[0].notes[0].pitch, 127);
    assert.equal(artistPerformance(fixed(playable), 120, () => {}).events[0].notes[0].pitch, 127);
    const tooHigh = 'options transpose=2\nstave key=G time=1/4\nnotes F/9';
    assert.throws(() => parseScore(tooHigh), /MIDI range/);
    assert.throws(() => fixed(tooHigh), /MIDI range/);
    assert.throws(() => parseScore('options transpose=120\nstave time=1/4\nnotes C/4'), /MIDI range/);
    assert.throws(() => parseScore('options transpose=120\ntabstave time=1/4\nnotes 2/1'), /MIDI range/);
  });
});
