// Exercise the public Player with a real Canvas score and a recording MIDI.js host.
import Artist from '../src/artist';
import Player from '../src/player';
import Vex from '../src/vexflow';
import VexTab from '../src/vextab';

QUnit.module('Canvas player', () => {
  QUnit.test('native transport loads, plays, stops, redraws and detaches', async assert => {
    assert.timeout(5000);
    const host = document.createElement('div');
    host.style.position = 'relative';
    const score = document.createElement('canvas');
    host.append(score);
    document.querySelector('#qunit-fixture').append(host);

    const renderer = new Vex.Flow.Renderer(score, Vex.Flow.Renderer.Backends.CANVAS);
    const artist = new Artist(10, 10, 400);
    new VexTab(artist).parse('options player=true tempo=240 scale=1.25\nstave\nnotes G/4 A/4 B/4');
    const player = new Player(artist, { soundfont_url: '/music/', overlay_class: 'my-player' });
    const originalMIDI = window['MIDI'];
    const originalCache = Player.INSTRUMENTS_LOADED;
    Player.INSTRUMENTS_LOADED = {};
    const loads = [];
    const programs = [];
    const attacks = [];
    const releases = [];
    let secondAttack: () => void;
    const played = new Promise<void>(resolve => { secondAttack = resolve; });
    window['MIDI'] = {
      loadPlugin: request => loads.push(request),
      programChange: (...args) => programs.push(args),
      noteOn: (_channel, pitch) => {
        attacks.push(pitch);
        if (attacks.length === 2) secondAttack();
      },
      noteOff: (...args) => releases.push(args),
    };

    try {
      artist.draw(renderer);
      artist.draw(renderer);
      assert.strictEqual(host.querySelectorAll('.my-player').length, 1, 'one transport after a redraw');
      const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      const status = host.querySelector('[role="status"]');
      button('Play').click();
      button('Play').click();
      assert.strictEqual(loads.length, 1, 'a second click shares the pending request');
      assert.deepEqual(loads[0].instruments, ['acoustic_grand_piano']);
      assert.strictEqual(loads[0].soundfontUrl, '/music/');
      assert.strictEqual(status.textContent, 'Loading instruments...');
      button('Stop').click();
      loads[0].callback();
      assert.strictEqual(status.textContent, '');
      assert.strictEqual(programs.length, 0, 'stopping during a load cancels autoplay');

      button('Play').click();
      await played;
      assert.strictEqual(loads.length, 1, 'the host can reuse the loaded instrument');
      assert.deepEqual(programs, [[0, 0]]);
      assert.ok(attacks.every(Number.isInteger), 'the host gets integer MIDI pitches');
      assert.strictEqual(attacks[1] - attacks[0], 2, 'G to A spans two semitones');
      assert.deepEqual(releases, attacks.map(pitch => [0, pitch, 0.25]));

      const overlay = host.querySelector<HTMLCanvasElement>('.my-player canvas');
      const context = overlay.getContext('2d');
      const notes = artist.getPlayerData().voices[0][0].getTickables();
      // Sample the cursor at each attack in backing pixels, including score scale and DPR.
      const alpha = note => {
        const point = new DOMPoint(note.getAbsoluteX() + 4, note.getStave().getYForLine(2));
        const pixel = point.matrixTransform(score.getContext('2d').getTransform());
        return context.getImageData(pixel.x, pixel.y, 1, 1).data[3];
      };
      assert.strictEqual(overlay.width, score.width);
      assert.strictEqual(alpha(notes[0]), 0, 'the previous note is clear');
      assert.ok(alpha(notes[1]) > 0, 'the cursor covers the current note');
      button('Stop').click();
      assert.strictEqual(alpha(notes[1]), 0, 'stopping clears the cursor');

      player.setInstrument('flute');
      button('Play').click();
      player.dispose();
      loads[1].callback();
      assert.deepEqual(programs, [[0, 0]], 'a late load cannot restart a disposed player');
      artist.draw(renderer);
      assert.strictEqual(artist.player, null);
      assert.strictEqual(host.querySelector('.my-player'), null);

      const external = new Player(artist, { show_controls: false });
      try {
        artist.draw(renderer);
        assert.strictEqual(host.querySelector('button'), null, 'the host can supply its own controls');
        external.play();
        assert.deepEqual(programs, [[0, 0], [0, 0]], 'programmatic play still starts MIDI');
        artist.setOptions({ player: 'false' });
        artist.draw(renderer);
        assert.strictEqual(host.querySelector('.vextab-player'), null, 'disabling playback removes the overlay');
      } finally {
        external.dispose();
      }
    } finally {
      player.dispose();
      if (originalMIDI === undefined) delete window['MIDI'];
      else window['MIDI'] = originalMIDI;
      Player.INSTRUMENTS_LOADED = originalCache;
    }
  });
});
