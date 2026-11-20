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

      await new Promise(requestAnimationFrame);
      const overlay = host.querySelector<SVGSVGElement>('.my-player .vextab-canvas-ink');
      assert.equal(overlay.viewBox.baseVal.width, score.width);
      assert.equal(overlay.viewBox.baseVal.height, score.height);
      const matrix = overlay.querySelector('g').transform.baseVal.consolidate().matrix;
      assert.equal(matrix.a, score.getContext('2d').getTransform().a, 'ink uses the backing pixel scale');
      const notes = artist.getPlayerData().voices[0][0].getTickables();
      const head = notes[1].getHeadInk()[0];
      const dots = Array.from(overlay.querySelectorAll('ellipse')).filter(dot => +dot.getAttribute('opacity') > 0);
      assert.ok(dots.some(dot => Math.abs(dot.cx.baseVal.value - (head.x + head.w / 2)) < 0.01 &&
        dot.cy.baseVal.value === notes[1].getYs()[0]), 'the second attack lights the corresponding head');
      const bar = overlay.querySelector('line');
      assert.ok(bar.y1.baseVal.value < notes[1].getStave().getYForLine(0));
      assert.ok(bar.y2.baseVal.value > notes[1].getStave().getYForLine(4));
      button('Stop').click();
      assert.strictEqual(overlay.querySelector('.vextab-playback-ink'), null, 'Stop clears all moving ink');

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
