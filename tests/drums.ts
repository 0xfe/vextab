// Verify the kit's staff positions, distinct head shapes and unpitched instrument identities.
import { Artist, Div, VexTab, Vex, parseScore, renderScore, renderScorePart } from '../src/browser';
import { readScore } from './read-score';
import { scorePerformance } from '../src/playback/performance';

const legacyGroove = 'stave clef=percussion time=2/4\nnotes :8 (kick.hat) hat (snare.hat) hat |';
const groove = 'meter 2/4 drums { :8 (kick hat) hat (snare hat) hat | }';
const displayKeys = [['f/4', 'g/5/X'], ['g/5/X'], ['c/5', 'g/5/X'], ['g/5/X']];

/** The filled and cross notehead glyphs must survive each engraving pass. */
function glyphs(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.vf-notehead text')].map(el => el.textContent);
}

QUnit.module('Drum kit notation', () => {
  QUnit.test('Simultaneous hits retain their staff positions, rhythm and kit names', assert => {
    const host = document.createElement('div');
    document.querySelector('#qunit-fixture').append(host);
    const artist = new Artist(0, 0, 420);
    new VexTab(artist).parse(legacyGroove);
    artist.draw(new Vex.Flow.Renderer(host, Vex.Flow.Renderer.Backends.SVG));
    const staffNotes = artist.staves[0].note_notes.filter(n => !n.shouldIgnoreTicks());
    assert.deepEqual(staffNotes.map(n => n.getKeys()), displayKeys, 'fixed staff positions and custom heads');
    const ink = ['\ue0a4', '\ue0a9', '\ue0a9', '\ue0a4', '\ue0a9', '\ue0a9'];
    assert.deepEqual(glyphs(host), ink, 'fixed SVG');

    const score = readScore(groove);
    const events = score.measures[0].voices[0].events;
    assert.deepEqual(events.map(e => e.duration), Array(4).fill('1/8'));
    assert.deepEqual(events.map(e => e.heads.map(h => h.written)), displayKeys);
    assert.deepEqual(events[0].heads.map(h => score.source.slice(h.range.start, h.range.end)), ['kick', 'hat']);
    assert.ok(scorePerformance(score, 120).events.every(e => e.notes.length === 0), 'staff positions never sound as pitches');
    const layout = renderScore(host, score, {width: 400});
    assert.ok(layout.navigation.events[0].label.includes('Bass drum, Closed hi-hat'));
    assert.deepEqual(glyphs(host), ink, 'responsive SVG');
    const { publication } = renderScorePart(host, score, 'notation');
    assert.equal(publication.pages.length, 1);
    assert.deepEqual(glyphs(host), ink, 'independent notation part');
  });

  QUnit.test('Dotted hits, rests and two kit voices share a bar', assert => {
    const example = 'meter 4/4 drums { voice hat stem up { :q. hat :8 rest :h hat | } voice feet stem down { :h kick snare | } }';
    const score = readScore(example);
    assert.deepEqual(score.measures[0].voices.map(v => v.events.map(e => e.duration)), [['3/8','1/8','1/2'], ['1/2','1/2']]);
    const host = document.createElement('div');
    host.setAttribute('renderer', 'canvas');
    host.setAttribute('language', '2');
    host.textContent = example;
    document.querySelector('#qunit-fixture').append(host);
    const embed = new Div(host);
    assert.ok(/Closed hi-hat.*voice 2.*Bass drum.*Snare drum/i.test(host.querySelector('canvas').getAttribute('aria-label')));
    embed.dispose();
  });

  QUnit.test('Misplaced and ambiguous kit hits report their original source in both languages', assert => {
    for (const source of ['meter 1/4 staff {\n hat | }', 'meter 1/4 guitar {\n kick | }', 'meter 1/4 drums {\n (snare snare) | }']) {
      assert.throws(() => readScore(source), e => e.line === 2);
    }
    for (const [source, message] of [
      ['stave time=1/4\nnotes hat', /clef=percussion.*line 2/],
      ['tabstave clef=percussion notation=true time=1/4\nnotes kick', /clef=percussion.*line 2/],
      ['stave clef=percussion time=1/4\nnotes (snare.snare)', /only once.*line 2/],
      ['stave clef=percussion time=1/4\nnotes :qS hat', /ordinary duration.*line 2/],
    ] as const) {
      assert.throws(() => parseScore(source), message);
      assert.throws(() => new VexTab(new Artist(0, 0, 400)).parse(source), message);
    }
  });
});
