// Qualify edition ownership, native pagination, silent cues and source-located diagnostics.
import { parseScore, renderEdition, renderScorePart } from '../src/browser';
import { scorePerformance } from '../src/playback/performance';

const source = `meter 4/4
edition { title "Quartet" paper A4 margins 12 13 14 15 pageNumbers on }
edition conductor { page at 5 }
edition part bass { paper Letter page at 3 prefer after 2 forbid after 4
  compressRests on cue lead at 4 "Lead" }
staff lead { name "Lead" times 8 { :w C5 | } }
staff bass { name "Bass" clef bass times 8 { :w rest | } }`;

/** Every publication starts with a connected host so native SVG font metrics are available. */
function host() {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}

QUnit.module('Edition authoring', () => {
  QUnit.test('page starts, independent paper, cues, rest compression and explicit overrides', assert => {
    const score = parseScore(source);
    const full = () => renderEdition(host(), score).publication.pages.map(p => p.systems[0].measures[0]);
    assert.deepEqual(full(), [1, 5]);
    const part = renderScorePart(host(), score, 'notation', { partId: 'bass' });
    assert.deepEqual(part.diagnostics, []);
    assert.equal(part.publication.paper.width, 215.9);
    assert.deepEqual(part.publication.pages.map(p => p.systems[0].measures[0]), [1, 3]);
    const pages = part.publication.pages.map(p => JSON.parse(p.svg.querySelector('metadata').textContent));
    const events = pages.flatMap(p => p.events), [cue] = pages.flatMap(p => p.regions);
    assert.equal(events.length, 8);
    assert.ok(events.every(e => e.rest));
    assert.equal(cue.measure, 4);
    assert.equal(cue.events.length, 1);
    const ref = cue.events[0].id, range = part.rangeFor(ref, source);
    assert.equal(source.slice(range.start, range.end), 'C5');
    assert.equal(part.sourceFor(ref), score.parts[0].staves[0].voices[0].events[3].id);
    assert.equal(scorePerformance(part.score, 80).events.flatMap(e => e.notes).length, 0);
    const count = part.publication.pages.reduce((n, p) => n + p.svg.querySelectorAll('.vf-stavenote').length, 0);
    assert.ok(count < 9, 'native numbered rest replaces individual rest glyphs and the cue remains');
    assert.deepEqual(full(), [1, 5]);
    const altered = renderEdition(host(), score, { partId: 'bass' }, { pageBreaks: [7], paper: 'A4', margins: { left: 20 }, title: 'Custom' });
    assert.deepEqual(altered.publication.pages.map(p => p.systems[0].measures[0]), [1, 7]);
    assert.equal(altered.publication.paper.width, 210);
    assert.ok(altered.publication.pages[0].svg.textContent.includes('Custom'));
    assert.ok(altered.publication.pages[0].systems[0].x >= 20);
  });

  QUnit.test('a one-bar cue engraves its complete written slur', assert => {
    const notes = ':h C5 D5';
    const excerpt = source.replace('times 8 { :w C5 | }', 'times 8 { ' + notes + ' | }');
    function paths(text: string) {
      const view = renderEdition(host(), parseScore(text), { partId: 'bass' });
      const cue = view.publication.pages[1].svg.querySelector('[data-region="cue"]');
      return cue.querySelectorAll('path').length;
    }
    assert.ok(paths(excerpt.replace(notes, 'slur { ' + notes + ' }')) > paths(excerpt));
  });

  QUnit.test('impossible turn, overflow and missing references locate their original source', assert => {
    const text = source.replace('forbid after 4', 'forbid after 2');
    const part = renderEdition(host(), parseScore(text), { partId: 'bass' });
    const turn = part.diagnostics.find(d => d.code === 'ForbiddenTurn');
    assert.equal(text.slice(turn.range.start, turn.range.end), 'forbid after 2');
    const crowded = renderEdition(host(), parseScore(source), 'conductor', { title: 'Wide '.repeat(80) });
    assert.ok(crowded.diagnostics.some(d => d.code === 'TextOverflow' && d.range));
    for (const [from, to] of [['cue lead at 4', 'cue missing at 4'], ['page at 3', 'page at 9']]) {
      const invalid = source.replace(from, to);
      assert.throws(() => parseScore(invalid), e => invalid.slice(...e.range).startsWith(to));
    }
  });
});
