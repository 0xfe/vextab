// Exercise the public plugin contract, score semantics, cancellation and injected synth ownership.
import { createWebAudioPlayback, createSpessaSynthPlayback, Div, parseScore, Player, type PlaybackNote, type PlaybackPlugin, type PlaybackSession } from '../src/browser';

QUnit.module('Playback plugins', () => {
  QUnit.test('A custom instrument receives sounding pitches, ties and per-string bends', async assert => {
    const notes: PlaybackNote[] = [];
    let stops = 0;
    const plugin: PlaybackPlugin = {
      open(program) {
        assert.equal(program, 24);
        return { playNote: note => notes.push(note), stop: () => { stops++; } };
      },
    };
    const score = parseScore('options tempo=600 instrument=acoustic_guitar_nylon\ntabstave time=2/4\nnotes :q (5/2.7z8z7/3) T5/2');
    const player = new Player(score, { playback: plugin });
    await player.play();
    assert.equal(notes.length, 2, 'the tied E4 has one attack');
    assert.deepEqual(notes.map(n => [n.pitch, n.duration]), [[64, 0.2], [63, 0.1]]);
    assert.deepEqual(notes.map(n => n.bend), [undefined, [{ time: 0.1, semitones: -1 }]]);
    assert.equal(stops, 1, 'the session ended after the last release');
    player.dispose();
  });

  QUnit.test('Tempo changes carry the current beat through loading and into the next attack', async assert => {
    const notes: PlaybackNote[] = [];
    let clock = 0;
    let ready: (session: PlaybackSession) => void;
    const score = parseScore('options tempo=60\ntabstave time=2/4\nnotes :q 0/1 7z8z7/3 |');
    const player = new Player(score, { playback: { open: () => new Promise(resolve => { ready = resolve; }) } });
    try {
      const finished = player.play();
      player.setTempo(120);
      ready({ get currentTime() { return clock; }, playNote: note => notes.push(note), stop() {} });
      await Promise.resolve();
      assert.equal(notes[0].duration, 0.5, 'a change during loading reaches the first note');
      clock = 0.25; // Half a beat has elapsed at 120 BPM.
      player.setTempo(60);
      clock = 0.74;
      player.setTempo(60);
      assert.equal(notes.length, 1, 'the new rate preserves the fraction of the beat already played');
      clock = 0.75;
      player.setTempo(240);
      assert.equal(notes.length, 2);
      assert.equal(notes[1].duration, 0.25);
      assert.deepEqual(notes[1].bend, [{ time: 0.25, semitones: -1 }]);
      player.stop();
      await finished;
    } finally { player.dispose(); }
  });

  QUnit.test('Both fixed and flow embeds open the injected plugin only on Play', async assert => {
    for (const layout of ['fixed', 'flow']) {
      const host = document.createElement('div');
      host.dataset.layout = layout;
      host.textContent = 'options player=true tempo=120\nstave time=1/4\nnotes C/4';
      document.querySelector('#qunit-fixture').append(host);
      let opens = 0, stops = 0;
      let ready;
      let signal: AbortSignal;
      const embed = new Div(host, { playback: { open(_program, cancellation) {
        opens++;
        signal = cancellation;
        return new Promise(resolve => { ready = resolve; });
      } } });
      assert.equal(opens, 0);
      const button = (name: string) => host.querySelector<HTMLButtonElement>('button[aria-label="' + name + '"]');
      button('Play').click();
      assert.ok(button('Stop'), 'the same control can cancel a pending load');
      assert.equal(opens, 1);
      button('Stop').click();
      assert.true(signal.aborted);
      ready({ playNote: () => assert.true(false, 'cancelled request played'), stop: () => { stops++; } });
      await Promise.resolve();
      assert.equal(stops, 1);
      embed.redraw();
      assert.equal(host.querySelectorAll('button[aria-label="Play"]').length, 1);
      embed.dispose();
      assert.equal(host.querySelector('button'), null);
    }
  });

  QUnit.test('The audio clock carries the playhead through chords, rests and a system break', async assert => {
    assert.timeout(5000);
    const host = document.createElement('div');
    host.dataset.layout = 'flow';
    host.dataset.width = '210';
    host.textContent = 'options player=true tempo=120\ntabstave notation=true time=4/4\nnotes :q (0/1.2/3) 2/1 ## 3/1 | :w 5/1 |';
    document.querySelector('#qunit-fixture').append(host);
    let clock = 0;
    const embed = new Div(host, { playback: { open: () => ({
      get currentTime() { return clock; }, playNote() {}, stop() {},
    }) } });
    try {
      await document.fonts.ready;
      host.querySelector<HTMLButtonElement>('.vextab-play').click();
      const bar = host.querySelector<SVGLineElement>('.vextab-playback-ink line');
      const beat = async (time: number) => {
        clock = 0.075 + time;
        await new Promise(requestAnimationFrame);
        return {
          x: bar.transform.baseVal.consolidate().matrix.e, y: bar.y1.baseVal.value,
          heads: Array.from(host.querySelectorAll('.vextab-playback-ink ellipse'),
            dot => Number(dot.getAttribute('opacity'))).filter(alpha => alpha > 0),
        };
      };
      const approaching = await beat(-0.04);
      assert.equal(approaching.heads.length, 4, 'both chord members glow on the staff and tab');
      assert.ok(approaching.heads.every(alpha => alpha < 1), 'the chord fades in before the audio attack');
      const attack = await beat(0);
      assert.deepEqual(attack.heads, [1, 1, 1, 1]);
      assert.ok(bar.y2.baseVal.value - attack.y > 100, 'the bar spans both staves');
      const between = await beat(0.25);
      const release = await beat(0.46);
      assert.equal(release.heads.length, 6, 'the release overlaps the next note’s anticipation');
      assert.ok(release.heads.every(alpha => alpha < 1));
      const second = await beat(0.501);
      assert.ok(attack.x < between.x && between.x < second.x, 'the bar travels continuously between attacks');
      assert.deepEqual(second.heads, [1, 1]);
      const rest = await beat(1.1);
      assert.equal(rest.heads.length, 0);
      assert.ok((await beat(1.3)).x > rest.x, 'the bar crosses the rest in musical time');
      const endOfRow = await beat(1.99);
      const nextRow = await beat(2.01);
      assert.ok(nextRow.y > endOfRow.y && nextRow.x < endOfRow.x, 'the bar wraps to the next system');
      host.querySelector<HTMLButtonElement>('.vextab-stop').click();
      assert.equal(host.querySelector('.vextab-playback-ink'), null);
    } finally { embed.dispose(); }
  });

  QUnit.test('Native Web Audio renders a pitched note and releases it on time', async assert => {
    const audio = new OfflineAudioContext(1, 24000, 24000);
    const output = await createWebAudioPlayback(audio).open(0, new AbortController().signal);
    output.playNote({ pitch: 69, velocity: 100, duration: 0.5, bend: [{ time: 0.25, semitones: -12 }] });
    const samples = (await audio.startRendering()).getChannelData(0);
    const frequency = (start: number, end: number) => {
      let periods = 0;
      for (let i = start + 1; i < end; i++) if (samples[i] > 0 && samples[i - 1] <= 0) periods++;
      return periods * audio.sampleRate / (end - start);
    };
    assert.ok(frequency(0, 1200) > 370, 'attack starts near A4');
    assert.ok(Math.abs(frequency(6300, 11100) - 220) < 6, 'the held release reaches A3');
    assert.ok(samples.subarray(13000).every(value => value === 0), 'the note ends on its audio-clock deadline');
    output.stop();
  });

  QUnit.test('SpessaSynth isolates bent strings, and releases only its reserved channels', async assert => {
    let time = 10;
    const calls = [];
    const synth = {
      context: { get currentTime() { return time; } } as BaseAudioContext,
      isReady: Promise.resolve(),
      programChange: (ch, program) => calls.push(['program', ch, program]),
      noteOn: (ch, pitch) => calls.push(['on', ch, pitch]),
      noteOff: (ch, pitch) => calls.push(['off', ch, pitch]),
      pitchWheel: (ch, value) => calls.push(['bend', ch, value]),
      pitchWheelRange: (ch, range) => calls.push(['range', ch, range]),
    };
    const output = await createSpessaSynthPlayback(synth, [2, 3]).open(24, new AbortController().signal);
    output.playNote({ pitch: 40, duration: 2, velocity: 80 });
    output.playNote({ pitch: 63, duration: 1, velocity: 90, bend: [{ time: 1, semitones: -1 }] });
    time += 0.5;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(calls.filter(c => c[0] === 'on'), [['on', 2, 40], ['on', 3, 63]]);
    assert.ok(calls.some(c => c[0] === 'bend' && c[2] === 4096));
    assert.ok(calls.filter(c => c[0] === 'bend').every(c => c[1] === 3));
    output.stop();
    assert.deepEqual(calls.filter(c => c[0] === 'off'), [['off', 2, 40], ['off', 3, 63]]);
    assert.deepEqual(calls[calls.length - 1], ['bend', 3, 8192]);
  });
});
