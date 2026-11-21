// Assert the release's musical behavior, its known defects and the isolated dependency result.
import assert from 'node:assert/strict';

const oneRow = [[1, 2, 3, 4]];
const fourRows = [[1], [2], [3], [4]];
const melody = ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4'];
const eighths = ['0/1', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'];

/** Check source ownership and musical time against the written passage at every width. */
function checkMusic({ music, embed }) {
  assert.equal(music.length, 2);
  for (let part = 0; part < music.length; part++) {
    const { events, ...owner } = music[part];
    assert.deepEqual(owner, { part, staff: 'main', voice: 'main' });
    const count = part === 0 ? 8 : 1;
    assert.equal(events.length, 4 * count);
    for (const [i, event] of events.entries()) {
      assert.deepEqual(event, {
        id: (part + 1) + '.main.main.' + (i + 1), bar: 1 + Math.floor(i / count),
        at: eighths[i % count], duration: part === 0 ? '1/8' : '1/1', pitch: part === 0 ? melody[i % count] : 'C3',
      });
    }
  }
  const events = music.flatMap(part => part.events);
  assert.deepEqual(embed.map(frame => frame.width), [800, 360, 800]);
  for (const frame of embed) {
    assert.equal(frame.reading.length, events.length);
    assert.deepEqual(frame.parts.map(notes => notes.length), [32, 4]);
    for (const [i, reading] of frame.reading.entries()) {
      const { id, bar, at, duration, pitch } = events[i];
      assert.deepEqual([reading.source, reading.measure, reading.onset, reading.duration], [id, bar, at, duration]);
      assert.ok(reading.label.includes(pitch[0] + ' ' + pitch[1]), reading.label);
    }
    // Repeated bars start on the same written pitch, so a Y change detects a real system break.
    const barStarts = frame.parts[0].filter((_, i) => i % 8 === 0);
    assert.equal(new Set(barStarts).size, frame.width === 360 ? 4 : 1);
    assert.equal(new Set(frame.parts[1]).size, 1);
  }
  assert.deepEqual(embed[0].parts, embed[2].parts);
}

/** Independent parts may break differently. A native ensemble shares every corresponding beat and barline. */
function checkLayout(views) {
  assert.deepEqual(views.map(frame => frame.width), [800, 360, 800]);
  for (const { width, separate, native } of views) {
    const narrow = width === 360;
    assert.deepEqual(separate.map(part => part.rows), [narrow ? fourRows : oneRow, oneRow]);
    assert.deepEqual(native.rows, narrow ? fourRows : [[1, 2], [3, 4]]);
    const writtenBar = [
      melody.map(pitch => ({ keys: [pitch[0] + '/' + pitch[1]], duration: '8' })),
      [{ keys: ['C/3'], duration: 'w' }],
    ];
    assert.deepEqual(native.voices, Array(4).fill(writtenBar));
    assert.equal(native.measures.length, 4);
    for (const staves of native.measures) {
      assert.equal(staves.length, 2);
      const [upper, lower] = staves;
      assert.ok(upper.barline > upper.downbeat);
      assert.ok(Math.abs(upper.downbeat - lower.downbeat) <= 0.01, 'simultaneous attacks diverged');
      assert.ok(Math.abs(upper.barline - lower.barline) <= 0.01, 'barlines diverged');
    }
    if (narrow) {
      assert.ok(separate[0].measures[0][0].barline - separate[1].measures[0][0].barline > 100);
    }
  }
  assert.deepEqual(views[0], views[2]);
}

/** Verify the printer identifies the exact offending source construct. */
function checkRefusal(study, construct, reason) {
  const { error, range } = study.frames[0].print;
  assert.ok(error.includes(reason), error);
  assert.equal(study.source.slice(range.start, range.end), construct);
  assert.ok(error.endsWith('line ' + range.line + ' column ' + range.column + '.'), error);
}

/** Keep reproducible failures next to positive print and wrapping controls. */
function checkStudies(studies) {
  for (const study of Object.values(studies)) {
    for (const frame of study.frames) assert.deepEqual(frame.diagnostics, [], study.id);
  }
  const lyric = studies['two-lyrics'].frames[0];
  assert.deepEqual(lyric.marks, ['one', 'two']);
  assert.deepEqual(lyric.lyrics.map(word => word.text), ['two']);
  assert.deepEqual(lyric.print, { pages: 1, notes: 1, diagnostics: [], lyrics: ['two'] });

  const river = studies['slow-river'];
  const { rows, lyrics } = river.frames[0];
  assert.deepEqual(rows[1], [2, 3, 4]);
  assert.deepEqual(lyrics.map(word => word.text), ['roll', 'to', 'sea']);
  assert.ok(lyrics[0].y - lyrics[2].y > 30, 'released verse baseline jump');
  checkRefusal(river, 'frame (x 0 2 2 1 0) barre=2/4..3', 'a chord frame');
  const beam = studies.beam.frames[0];
  assert.deepEqual(beam.surface, { drawn: [true, true, true, true], beam: [0, 1, 2, 3] });
  assert.deepEqual(beam.rhythm, eighths.slice(0, 4).map(at => ['attack', at, '1/8']));
  checkRefusal(studies.beam, 'beam { :8 C4 D4 E4 F4 }', 'explicit beam groups');
  const skip = studies.skip.frames[0];
  assert.deepEqual(skip.surface.drawn, [true, false]);
  assert.deepEqual(skip.rhythm, [['attack', '0/1', '1/4'], ['skip', '1/4', '1/4']]);
  checkRefusal(studies.skip, 'skip', 'a silent position');

  const bossa = studies.bossa.frames;
  assert.deepEqual(bossa.map(frame => frame.rows), [[[1, 2]], [[1], [2]], [[1, 2]]]);
  for (const frame of bossa) assert.deepEqual(frame.print, { pages: 1, diagnostics: [], notes: 13 });
  assert.deepEqual(studies['guitar-duet'].frames[0].print, { pages: 1, diagnostics: [], notes: 16 });
}

/** Compare only marks on the same system. Restoring the wide score must restore the same ink bounds. */
function checkChords({ lane, chords }) {
  for (const frames of Object.values(chords)) {
    assert.deepEqual(frames.map(frame => frame.width), [800, 190, 800]);
    assert.deepEqual(frames.map(frame => frame.rows), [[[1, 2]], [[1], [2]], [[1, 2]]]);
    assert.equal(frames[1].gap, null);
    assert.deepEqual(frames[0], frames[2]);
  }
  assert.ok(chords.literal[0].gap > 0, 'literal chord labels overlap');
  const gap = chords.native[0].gap;
  assert.ok(lane === 'trial' ? gap > 0 : gap < 0, 'native ChordSymbol gap ' + gap);
}

/** Attribute a change to the engine only after reproducing the shipped control on this browser. */
export function check({ release, control, trial }) {
  for (const run of [release, control, trial]) {
    checkMusic(run);
    checkLayout(run.views);
    checkStudies(run.studies);
    checkChords(run);
    for (const key of ['music', 'embed', 'views', 'studies']) assert.deepEqual(run[key], release[key], run.lane + ' ' + key);
  }
  assert.deepEqual(control.chords, release.chords, 'rebuilt release harmony');
  assert.deepEqual(trial.chords.literal, control.chords.literal, 'actual VexTab literal label path');
}
