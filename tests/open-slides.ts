// Exercise each open slide through the public fixed, responsive, and printed renderers.
import { Renderer } from 'vexflow';
import Artist from '../src/artist';
import VexTab from '../src/vextab';
import { readScore } from './read-score';
import { renderScore, renderScorePart } from '../src/score/layout';
import { scorePerformance } from '../src/playback/performance';

/** Four gestures on the third string. The upper string stays still on the final chord. */
const legacy = 'tabstave notation=true time=2/4\nnotes :q <9/3 >9/3 | 9</3 (9>/3.7/2) |';

const source = 'meter 2/4 guitar { 9/3[slideIn below] 9/3[slideIn above] | 9/3[slideOut below] (9/3[slideOut above] 7/2) | }';

/** Read the actual straight segments, measured from the fret to the open end. */
function directions(root: Element) {
  return [...root.querySelectorAll('.vf-open-slide path, path.vf-open-slide')].map(path => {
    const [x, y, endX, endY] = path.getAttribute('d').match(/-?[\d.]+/g).map(Number);
    return [Math.sign(endX - x), Math.sign(endY - y)];
  });
}

QUnit.module('Open-ended guitar slides', () => {
  QUnit.test('A free end adds one diagonal per marked head on screen and paper', assert => {
    const host = document.createElement('div');
    document.querySelector('#qunit-fixture').append(host);
    const artist = new Artist(10, 10, 600);
    new VexTab(artist).parse(legacy);
    artist.render(new Renderer(host, Renderer.Backends.SVG));
    const slopes = [[-1, 1], [-1, -1], [1, 1], [1, -1]];
    assert.deepEqual(directions(host), slopes, 'fixed');
    const score = readScore(source);
    for (const width of [320, 720]) {
      const view = renderScore(host, score, { width });
      assert.deepEqual(directions(host), slopes, 'responsive width ' + width);
      assert.ok(view.navigation.events.find(e => e.staff === 'tab').label.includes('Slide in from below on string 3'));
    }
    const { publication } = renderScorePart(host, score, 'tab');
    assert.deepEqual(directions(publication.pages[0].svg), slopes, 'printed tab');
    assert.ok(renderScorePart(host, score, 'notation').publication.pages[0].svg.textContent.includes('Slide out toward a higher fret on string 3'));
  });

  QUnit.test('The played fret supplies the attack, pitch, duration and source selection', assert => {
    const score = readScore(source);
    const plain = readScore(source.replace(/\[slide(?:In|Out) (?:above|below)\]/g, ''));
    const notes = (s: typeof score) => scorePerformance(s, 120).events.map(e => [e.time, e.notes]);
    assert.deepEqual(notes(score), notes(plain));
    const chord = score.measures[1].voices[0].events[1];
    assert.deepEqual(chord.heads[0].openSlide, { edge: 'out', side: 'above' });
    assert.equal(source.slice(chord.heads[0].range.start, chord.heads[0].range.end), '9/3');
    assert.strictEqual(chord.heads[1].openSlide, undefined);
    const artist = new Artist(0, 0, 600);
    const parser = new VexTab(artist);
    parser.parse('tabstave notation=true\nnotes :8S 5s7/3 D4_7/3');
    assert.equal(artist.staves[0].tab_notes.length, 3, 'closed slide, slash rhythm and named D');
  });
});
