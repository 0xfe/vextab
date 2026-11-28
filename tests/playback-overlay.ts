// Verify external-clock playback ink against the engraved score on real SVG and Canvas surfaces.
import { parseScore, renderConductor, renderScore, type PlaybackOverlay } from '../src/browser';

/** Read only the visible head glows, including their logical engraving coordinates. */
function litHeads(host: HTMLElement): number[][] {
  return Array.from(host.querySelectorAll<SVGEllipseElement>('.vextab-playback-ink ellipse'))
    .filter(dot => Number(dot.getAttribute('opacity')) > 0)
    .map(dot => [dot.cx.baseVal.value, dot.cy.baseVal.value]);
}

QUnit.module('External playback overlay', () => {
  QUnit.test('a seek restores every sounding head and the full system bar without scheduling frames or audio', assert => {
    const model = parseScore('meter 4/4 piano keys { upper { :h (E4 G4) rest | :w rest | } '
      + 'lower { :w C3 | rest | } } staff lead { voice a { :q D5 rest :h E5 | :w rest | } voice b { :w G4 | rest | } }');
    const host = document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
    // Put the score on screen so elementFromPoint can check pointer pass-through.
    host.style.cssText = 'position:fixed;top:0;left:0;background:white;z-index:100;';
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderConductor(host, model, { renderer, width: 580 });
      const location = { partIndex: 1, measure: 1, offset: '1/8' };
      const cursor = view.layoutMap.positionAt(location);
      const sounding = view.parts.flatMap(part => part.measures[0].voices.map(voice => voice.events[0]));
      const heads = sounding.flatMap(event => view.navigation.heads.get(event.id))
        .filter(h => !h.reference && h.role !== 'mark' && typeof h.sourceHead === 'number');
      const expected = heads.map(h => [h.bounds.x + h.bounds.w / 2, h.bounds.y + h.bounds.h / 2]);
      const surface = host.querySelector<SVGSVGElement | HTMLCanvasElement>('canvas, svg');
      // An ancestor and the surface can scale independently.
      host.style.transformOrigin = surface.style.transformOrigin = 'top left';
      host.style.transform = 'scale(0.9)';
      surface.style.transform = 'scale(0.8, 0.7)';
      const box = surface.getBoundingClientRect();
      const screenX = box.left + cursor.x * box.width / parseFloat(surface.style.width);
      const screenY = box.top + cursor.staffCenterY * box.height / parseFloat(surface.style.height);
      const pointerTarget = document.elementFromPoint(screenX, screenY);
      assert.ok(pointerTarget);
      const originalFrame = window.requestAnimationFrame, originalAudio = window.AudioContext;
      const originalTimeout = window.setTimeout, originalInterval = window.setInterval;
      const unexpected = () => { throw new Error('The external clock owns scheduling and audio'); };
      let overlay: PlaybackOverlay;
      try {
        window.requestAnimationFrame = unexpected;
        window.AudioContext = unexpected as unknown as typeof AudioContext;
        window.setTimeout = window.setInterval = unexpected;
        overlay = view.createPlaybackOverlay();
        overlay.setPosition({ partIndex: 0, measure: 2, offset: '3/4' });
        assert.deepEqual(litHeads(host), [], 'whole rests stay unlit');
        overlay.setPosition(location);
        assert.equal(expected.length, 5, 'a chord, the lower piano staff, and both lead voices');
        const visible = litHeads(host);
        assert.equal(visible.length, expected.length);
        for (const [x, y] of expected) assert.ok(visible.some(([cx,cy]) => Math.hypot(x-cx, y-cy) < 0.001));
        const bar = host.querySelector<SVGLineElement>('.vextab-playback-ink line');
        assert.ok(bar);
        assert.closeTo(bar.y1.baseVal.value, cursor.systemBounds.top, 0.001);
        assert.closeTo(bar.y2.baseVal.value, cursor.systemBounds.bottom, 0.001);
        const physical = new DOMPoint(0, cursor.staffCenterY).matrixTransform(bar.getScreenCTM());
        assert.closeTo(physical.x, screenX, 0.1);
        assert.closeTo(physical.y, screenY, 0.1);
        assert.strictEqual(document.elementFromPoint(screenX, screenY), pointerTarget);
        assert.deepEqual(view.layoutMap.hitTest({x: cursor.x, y: cursor.staffCenterY}).offset, 1/8);
        const release = { ...location, offset: 0.49 };
        overlay.setPosition(release, 60);
        const opacity = () => Number(host.querySelector('.vextab-playback-ink ellipse').getAttribute('opacity'));
        const slower = opacity();
        overlay.setPosition(release, 180);
        assert.ok(opacity() < slower, 'live tempo changes affect the fade at the same written position');
        overlay.clear();
        assert.strictEqual(host.querySelector('.vextab-playback-ink'), null);
        overlay.setPosition(location);
        assert.equal(litHeads(host).length, 5);
        overlay.setPosition({ ...location, measure: 3 });
        assert.strictEqual(host.querySelector('.vextab-playback-ink'), null, 'an invalid address clears stale ink');
      } finally {
        window.requestAnimationFrame = originalFrame;
        window.AudioContext = originalAudio;
        window.setTimeout = originalTimeout;
        window.setInterval = originalInterval;
        overlay?.dispose();
      }
      overlay.setPosition(location);
      assert.strictEqual(host.querySelector('.vextab-playback-ink'), null);
      assert.equal(host.querySelectorAll('svg').length, renderer === 'svg' ? 1 : 0, 'the backing paper is released');
    }
  });

  QUnit.test('a saved guitar address follows automatic reflow and re-illuminates the notation and TAB heads', assert => {
    const model = parseScore('guitar { view both times 4 { :8 0/1 1/1 2/1 3/1 0/2 1/2 2/2 3/2 | } }');
    const host = document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
    const location = { partIndex: 0, measure: 4, offset: '3/16' };
    const systems = [];
    for (const width of [900, 360]) {
      const view = renderScore(host, model, { width });
      const overlay = view.createPlaybackOverlay();
      overlay.setPosition(location);
      const at = view.layoutMap.positionAt(location);
      systems.push(at.system);
      assert.equal(litHeads(host).length, 2);
      const bar = host.querySelector<SVGLineElement>('.vextab-playback-ink line');
      assert.closeTo(bar.transform.baseVal[0].matrix.e, at.x, 0.01);
      assert.closeTo(bar.y1.baseVal.value, at.systemBounds.top, 0.01);
      overlay.dispose();
    }
    assert.ok(systems[1] > systems[0], 'restoring the same address uses its newly wrapped system');
  });
});
