// Compare expressive takes on the same written notes, including the public player path.
import { createPerformer, parseScore, performerProfiles, renderScore, Player, type Performance, type PlaybackNote } from '../src/browser';
import { PlaybackTransport } from '../src/playback/transport';
import pocketChange from '../guide/scores/pocket-change.vextab';
import { projectScoreV2 } from '../src/score/grammar2/project';
import { ensembleBars, scorePerformance } from '../src/playback/performance';
import type { PerformanceBar } from '../src/playback/performer';

/** A line of equal notes with a two-head chord at each onset. */
function line(count: number, step: number): Performance {
  return { duration: count * step, events: Array.from({ length: count }, (_, i) => ({
    time: i * step, duration: step, source: 'n' + i,
    notes: [60, 64].map(pitch => ({ pitch, duration: step, velocity: 80, program: 1 })),
  })) };
}

QUnit.module('Performers', () => {
  QUnit.test('literal playback, repeatable chord voicing and bent sustains', assert => {
    const part = line(16, .25);
    const held: PlaybackNote = part.events[0].notes[0];
    held.duration = 2;
    held.bend = [{ time: 1, semitones: 2 }, { time: 2, semitones: 0 }];
    const input = [part, part], snapshot = JSON.stringify(input);
    assert.strictEqual(createPerformer('robot').perform(input), input);
    const play = (seed: number) => createPerformer('human', seed).perform(input);
    const take = play(12), next = play(13);
    assert.deepEqual(play(12), take);
    assert.notDeepEqual(next, take);
    assert.notEqual(next[0].events[2].time, take[0].events[2].time);
    assert.notDeepEqual(next[0].events.map(e => e.notes[0].velocity), take[0].events.map(e => e.notes[0].velocity));
    assert.equal(JSON.stringify(input), snapshot);
    assert.deepEqual(take[0].events.map(e => e.time), take[1].events.map(e => e.time));
    const bent = take[0].events[0].notes[0];
    const delay = bent.onsetOffset ?? 0;
    assert.ok(Math.abs(delay + bent.bend[0].time - take[0].events[4].time) < 1e-9);
    assert.strictEqual(bent.bend[1].time, bent.duration);
    assert.ok(Math.abs(delay + bent.duration - take[0].events[8].time) < 1e-9);
    assert.ok(take[0].events.some(e => e.notes[0].velocity !== e.notes[1].velocity));
    assert.ok(take[0].events.every(e => e.notes.filter(note => note.onsetOffset).length === 1));
    assert.ok(take[0].events.some(e => e.notes[0].onsetOffset) && take[0].events.some(e => e.notes[1].onsetOffset));
    assert.ok(next[0].events.some((e, i) => e.notes[0].onsetOffset !== take[0].events[i].notes[0].onsetOffset));
    assert.ok(take[0].events.every((e, i, arr) => e.duration > 0 && (!i || e.time > arr[i-1].time)));
  });

  QUnit.test('student pulse, straight ragtime and shuffled blues have distinct subdivisions', assert => {
    const eighths = line(16, .25);
    eighths.events.forEach(e => e.notes.pop());
    for (const style of ['human', 'ragtime', 'blues'] as const) {
      const [take] = createPerformer(style, 15).perform([eighths]);
      const [on, off, next] = take.events;
      const share = (off.time - on.time) / next.time;
      if (style === 'blues') assert.ok(share > .6);
      else assert.ok(Math.abs(share - .5) < 1e-8);
      if (style === 'human') {
        assert.ok(take.events.every(e => Math.abs(e.duration / .25 - 1) < .011));
        assert.ok(take.events.every(e => Math.abs(e.notes[0].velocity - 80) <= 3));
      }
    }
  });

  QUnit.test('written swing overrides the preset, including literal playback', assert => {
    const eighths = line(8, .5);
    const bars = [{ duration: 4, quarter: 1, fermatas: [2] }];
    const [shuffled] = createPerformer('robot', 1, 'eighths').perform([eighths], bars);
    assert.ok(shuffled.events[1].time > .65);
    assert.equal(shuffled.events[2].time, 1);
    assert.equal(shuffled.duration, 4);
    assert.ok(shuffled.events.every(e => e.notes[0].velocity === 80));
    const [even] = createPerformer('parker', 1, 'off').perform([eighths], bars);
    assert.equal(even.events[1].time, even.events[2].time / 2);
    assert.throws(() => parseScore('play { swing maybe } staff { :w C4 | }'), /swing eighths or swing off/);
  });

  QUnit.test('the bebop head and the comp have independent touch on one piano', assert => {
    const model = parseScore(pocketChange);
    assert.equal(model.measureCount, 16);
    assert.equal(model.parts.length, 1);
    assert.equal(model.playback.swing, 'eighths');
    const score = projectScoreV2(model, 0), take = createPerformer('parker', 7);
    const written = scorePerformance(score, 176, undefined, undefined, take);
    const ids = score.measures[0].voices.map(v => v.events.filter(e => e.heads.length).map(e => e.id));
    for (const [hand, level] of [[0, 82], [1, 66]]) {
      assert.ok(written.events.filter(e => ids[hand].includes(String(e.source))).every(e => e.notes[0].velocity === level));
    }
    const [played] = take.perform([written], [], 176);
    const chords = played.events.filter(e => e.notes.length >= 3);
    assert.equal(chords.length, 30);
    for (const chord of chords) {
      const delays = chord.notes.map(note => note.onsetOffset ?? 0);
      assert.ok(Math.min(...delays) === 0 && Math.max(...delays) <= performerProfiles.parker.chordSpread);
      assert.equal(new Set(delays).size, chord.notes.length);
      assert.ok(new Set(chord.notes.map(n => n.velocity)).size > 1, 'the grip has an audible balance');
      assert.ok(new Set(chord.notes.map(n => (n.onsetOffset ?? 0) + n.duration)).size > 1, 'fingers lift independently');
    }
    const host = document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
    renderScore(host, model, { renderer: 'canvas', width: 720 });
    assert.ok(host.querySelector('canvas').height > 100);
  });

  QUnit.test('chord fingers reach the instrument at their own onsets and keep one visual attack', async assert => {
    const transport = new PlaybackTransport();
    const received: { pitch: number; at: number; duration: number }[] = [];
    const marks: string[] = [];
    const held = { pitch: 60, duration: .2, velocity: 70 };
    const music: Performance = { duration: .2, events: [
      { time: 0, duration: .2, source: 'chord', mark: () => marks.push('chord'),
        notes: [held, { ...held, pitch: 64, duration: .16, onsetOffset: .012 }] },
      { time: .006, duration: .1, source: 'lead', mark: () => marks.push('lead'),
        notes: [{ ...held, pitch: 75, duration: .1 }] },
    ] };
    let clock = 0;
    const finished = transport.play({ open: () => ({
      get currentTime() { return clock; }, stop() {},
      playNote(note) {
        assert.strictEqual(note.onsetOffset, undefined, 'the instrument plays immediately');
        received.push({ pitch: note.pitch, at: clock, duration: note.duration });
      },
    }) }, 0, music, () => {});
    try {
      clock = .006;
      transport.setRate(2);
      clock = .0091; // The second finger is now due at twice the original tempo.
      transport.setRate(2);
      assert.deepEqual(received, [
        { pitch: 60, at: 0, duration: .2 }, { pitch: 75, at: .006, duration: .05 },
        { pitch: 64, at: .0091, duration: .08 },
      ]);
      assert.deepEqual(marks, ['chord', 'lead']);
    } finally { transport.stop(); await finished; }
  });

  QUnit.test('a damped chord rings to the pedal lift, including delayed fingers', assert => {
    const score = projectScoreV2(parseScore('meter 2/4 piano { upper { (C4 E4 G4) (D4 F4 A4) | } lower { C3[pedal down] D3[pedal up] | } }'), 0);
    const take = createPerformer('chopin', 17);
    const written = scorePerformance(score, 120, undefined, undefined, take);
    const [played] = take.perform([written]);
    const chords = played.events.filter(event => event.notes.length === 3);
    assert.equal(chords.length, 2);
    for (const event of chords) for (const note of event.notes) {
      const release = event.time + (note.onsetOffset ?? 0) + note.duration;
      assert.ok(Math.abs(release - played.duration) < 1e-9, 'the written damper releases every ringing key');
    }
  });

  QUnit.test('jazz swing is local to binary beats, straightens at speed and aligns offbeats', assert => {
    const jazz = createPerformer({ ...performerProfiles.parker, rubato: 0, drift: 0 }, 21);
    const part = line(8, .5);
    const [lead, band] = jazz.perform([part, part], [], 60);
    assert.ok(lead.events[2].time > band.events[2].time);
    assert.strictEqual(lead.events[3].time, band.events[3].time);
    const fast = jazz.perform([line(8, .125)], [], 240)[0];
    assert.ok(band.events[1].time > .65);
    assert.ok(fast.events[1].time / .25 < .55);
    const triplets = line(12, 1/3);
    const [even] = jazz.perform([triplets], [], 60);
    assert.ok(even.events.every((event, i) => Math.abs(event.time - i/3) < 1e-8));
    const compound = jazz.perform([part, part], [{ quarter: 1, duration: 4, swingable: false }])[1];
    assert.strictEqual(compound.events[1].time, .5);
    const ahead = createPerformer({ ...performerProfiles.parker, pocket: -.04 }, 21).perform([part, part], [], 60);
    assert.ok(ahead[0].events[2].time < ahead[1].events[2].time);
  });

  QUnit.test('score marks, local tempi and graces inform the performance', assert => {
    const source = 'play { performer chopin tempo 60 tempo 120 at 2 } meter 2/4 staff { C4[accent, staccato] D4[fermata] | E4 F4 | }';
    const model = parseScore(source), score = projectScoreV2(model, 0);
    assert.equal(score.playback.performer, 'chopin');
    assert.throws(() => parseScore(source.replace('chopin', 'unknown')), /Unknown performer/);
    const take = createPerformer('chopin', 17), bars: PerformanceBar[] = [];
    const written = scorePerformance(score, 60, undefined, undefined, take, bars);
    assert.deepEqual(bars.map(b => b.quarter), [1, .5]);
    assert.deepEqual(bars[0].fermatas, [2]);
    assert.ok(written.events[0].notes[0].duration < written.events[0].duration);
    assert.ok(written.events[0].notes[0].velocity > written.events[1].notes[0].velocity);
    const [played] = take.perform([written], bars);
    assert.ok(played.events[1].duration > played.events[0].duration * 1.2);
    const grace = projectScoreV2(parseScore('meter 1/4 staff { C4[grace before (A3 B3)] | }'), 0);
    const figure = (seed: number) => scorePerformance(grace, 60, undefined, undefined, createPerformer('chopin', seed));
    assert.notEqual(figure(17).events[2].time, figure(99).events[2].time);
    assert.equal(figure(17).events[2].time + figure(17).events[2].duration, 1);
  });

  QUnit.test('a compound-meter accompaniment can hold the ensemble across independent barlines', assert => {
    const grid = ensembleBars([
      [{ quarter: 1, duration: 2 }, { quarter: 1, duration: 2 }],
      [{ quarter: 1, duration: 3, swingable: false, fermatas: [3] }, { quarter: 1, duration: 1, swingable: true }],
    ]);
    assert.deepEqual(grid.map(bar => bar.swingable), [false, false]);
    assert.deepEqual(grid[1].fermatas, [1]);
    const band = createPerformer({ ...performerProfiles.parker, rubato: 0, drift: 0 }, 10);
    const [lead, bass] = band.perform([line(8, .5), line(4, 1)], grid);
    assert.equal(lead.events[1].time, .5);
    assert.equal(lead.events[6].time, bass.events[3].time);
    assert.ok(bass.events[2].duration > 1.3);
  });

  QUnit.test('the public player defaults to human and a host can override the score', async assert => {
    async function sound(field = '', performer?: 'robot', seed = 12) {
      const model = parseScore('play { tempo 600 ' + field + ' } meter 1/4 staff { C4 | }');
      const notes: PlaybackNote[] = [];
      const player = new Player(model, { performer, seed, playback: { open: () => ({ playNote: n => notes.push(n), stop() {} }) } });
      try { await player.play(); } finally { player.dispose(); }
      return notes[0];
    }
    const human = await sound();
    assert.deepEqual(human, await sound('performer human'));
    assert.notEqual(human.duration, .1);
    assert.equal((await sound('performer chopin', 'robot')).duration, .1);
    assert.equal((await sound('performer robot')).velocity, 100);
  });
});
