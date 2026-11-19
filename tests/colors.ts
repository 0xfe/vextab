// Check authored colours on the public fixed, responsive, and independent print paths.
import { Artist, Vex, VexTab, parseScore, renderScore, renderScorePart } from '../src/browser';

/** One coloured row and label; the first note overrides its row, the next row starts fresh. */
const fixed = 'tabstave notation=true time=2/4 color=SeaGreen\n' +
  'notes 0/1 !color #1565c0! $.Times-14-bold-crimson.Am$ 2/1 |\n' +
  'tabstave notation=true time=2/4\nnotes 3/1 0/1 |';
const flow = fixed.replace('$.Times-14-bold-crimson.Am$', '!chord "Am" color=crimson!');
const green = 'rgb(46, 139, 87)', blue = 'rgb(21, 101, 192)', black = 'rgb(0, 0, 0)';

/** Keep QUnit's SVG and Canvas fixtures attached for native font metrics. */
function host() {
  const div = document.createElement('div');
  document.querySelector('#qunit-fixture').append(div);
  return div;
}

QUnit.module('Score colours', () => {
  QUnit.test('Row, note and label scopes survive reflow and publication', assert => {
    const target = host();
    const artist = new Artist(10, 0, 460);
    new VexTab(artist).parse(fixed);
    artist.draw(new Vex.Flow.Renderer(target, Vex.Flow.Renderer.Backends.SVG));

    function check(layout: string) {
      const frets = [...target.querySelectorAll('.vf-tabnote > text')];
      assert.deepEqual(frets.map(el => getComputedStyle(el).fill), [blue, green, black, black], layout + ' fret colours');
      assert.ok(frets.every(el => getComputedStyle(el.previousElementSibling).fill === 'rgb(255, 255, 255)'), layout + ' fret paper');
      assert.equal(getComputedStyle(target.querySelector('.vf-annotation text')).fill, 'rgb(220, 20, 60)', layout + ' label');
      assert.equal(getComputedStyle(target.querySelector('.vf-stave path')).stroke, green, layout + ' staff lines');
    }
    check('fixed SVG');
    const parsed = parseScore(flow);
    for (const width of [190, 580]) {
      renderScore(target, parsed, { width });
      check('flow ' + width);
    }
    for (const paper of ['A4', 'Letter'] as const) {
      const { publication } = renderScorePart(target, parsed, 'tab', { paper });
      check(paper);
      assert.ok(publication.toSVG(1).includes('#1565c0'), paper + ' standalone SVG carries explicit ink');
    }
  });

  QUnit.test('Canvas draws each requested ink and rejects invalid values consistently', assert => {
    const canvas = document.createElement('canvas');
    host().append(canvas);
    const artist = new Artist(10, 0, 460);
    const parser = new VexTab(artist);
    parser.parse(fixed + '\ntext .font=Times-12-italic-darkorange, dolce');
    artist.draw(new Vex.Flow.Renderer(canvas, Vex.Flow.Renderer.Backends.CANVAS));
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255) colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    }
    for (const color of [0x1565c0, 0x2e8b57, 0xdc143c, 0xff8c00]) {
      assert.ok(colors.has(color), 'Canvas ink #' + color.toString(16));
    }
    for (const bad of ['reed', '#12', 'url(x)', 'var(--ink)']) {
      const stave = 'stave time=1/4 color=' + bad + '\nnotes C/4';
      const note = 'stave time=1/4\nnotes C/4 !color ' + bad + '!';
      for (const sample of [stave, note]) {
        assert.throws(() => parser.parse(sample), /color/);
        assert.throws(() => parseScore(sample), /color/);
      }
      assert.throws(() => parser.parse('stave\nnotes C/4 $.Times-12-bold-' + bad + '.A$'), /color/);
      assert.throws(() => parseScore('stave time=1/4\nnotes C/4 !chord "A" color=' + bad + '!'), /color/);
    }
  });
});
