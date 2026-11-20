// Exercise aligned piano timing, clefs and connectors, independent hand parts, and located diagnostics.
import { Div, parseScore, renderScore, renderScorePart } from '../src/browser';
import { scoreSurfaces } from '../src/playback/geometry';
import { scorePerformance } from '../src/playback/performance';

const duet = 'piano time=4/4\nnotes :q C-D-E-F/4 | G-A-B/4 C/5 |\n' +
  'voice hand=left\nnotes :h C/3 G/2 | TG/2 C/3 |';

/** Attach scores so Chrome measures the same glyph and page geometry as an embed. */
function host(): HTMLElement {
  const el = document.createElement('div');
  document.querySelector('#qunit-fixture').append(el);
  return el;
}

/** A piano brace is one closed shape made from four cubic curves. */
function bracePaths(element: Element): number {
  return [...element.querySelectorAll('path')].filter(path =>
    (path.getAttribute('d')?.match(/C/g) ?? []).length === 4).length;
}

QUnit.module('Piano grand staff', () => {
  QUnit.test('Aligned beats, shared barlines, and braces survive reflow', assert => {
    const score = parseScore(duet);
    for (const [width, rows] of [[650, 1], [225, 2]]) {
      const root = host();
      const {composition, navigation, rangeFor} = renderScore(root, score, {width});
      assert.equal(composition.sheet.getRows().length, rows);
      assert.ok(bracePaths(root) >= rows, 'each system has a brace');
      const barlines = [...root.querySelectorAll('rect')].filter(r =>
        Number(r.getAttribute('width')) === 1 && Number(r.getAttribute('height')) > 80);
      assert.ok(barlines.length >= 2, 'joined right barlines run between the two staves');
      for (const event of navigation.events.filter(e => e.staff === 'left')) {
        const simultaneous = navigation.events.find(e => e.staff === 'right' && e.measure === event.measure && e.onset === event.onset);
        const upper = composition.getNote(simultaneous.id), lower = composition.getNote(event.id);
        assert.equal(upper.getAbsoluteX(), lower.getAbsoluteX(), 'align matching onsets');
        assert.deepEqual([upper.getStave().getClef(), lower.getStave().getClef()], ['treble', 'bass']);
        assert.equal(rangeFor(event.id, duet)?.start, Number(event.source.slice(1)), 'the left-hand hit resolves to its own source');
      }
    }
    const notes = scorePerformance(score, 60).events.flatMap(e => e.notes.map(n => [e.time, n.pitch, n.duration]));
    assert.deepEqual(notes.filter(n => n[0] === 0), [[0,60,1], [0,48,2]], 'both hands sound on beat one');
    assert.deepEqual(notes.filter(n => n[1] === 43), [[2,43,4]], 'left hand sustains across the bar');
  });

  QUnit.test('Four voices keep accidental memory on the owning stave', assert => {
    const satb = 'piano time=2/4 voice=top\nnotes :q F#-F/4 |\n' +
      'voice hand=right voice=bottom\nnotes :h C/4 |\n' +
      'voice hand=left voice=top\nnotes F-F/4 |\n' +
      'voice hand=left voice=bottom\nnotes :h C/3 |';
    const score = parseScore(satb);
    const voices = score.measures[0].voices;
    assert.deepEqual(voices.map(v => [v.hand, v.stem]), [['right','up'],['right','down'],['left','up'],['left','down']]);
    assert.deepEqual(voices[0].events.map(e => e.heads[0].sounding), ['f#/4','f#/4']);
    assert.deepEqual(voices[2].events.map(e => e.heads[0].sounding), ['f/4','f/4']);
    const screen = renderScore(host(), score);
    assert.deepEqual(screen.composition.voices[0].map(v => v.length), [2,2]);
    assert.deepEqual(screen.navigation.events.filter(e => e.onset === '0/1').map(e => e.staff), ['right','right','left','left']);
    // The printed grand staff keeps the explicit sharp on its original head and stave.
    const printed = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
    const signs = [...printed.querySelectorAll('.vf-notehead text')].filter(text => text.textContent === '\uE262');
    assert.equal(signs.length, 1, 'one SMuFL sharp');
    const marked = parseScore('piano time=2/4\nnotes F#-F#~/4 |\nvoice hand=left\nnotes Fn-F/4 |');
    const page = renderScorePart(host(), marked, 'notation').publication.pages[0].svg;
    const heads = [...page.querySelectorAll('.vf-notehead')].map(head => head.textContent);
    assert.ok(heads[1].includes('\uE26A\uE262\uE26B'), 'cautionary sharp retains both parentheses');
    assert.ok(heads[2].includes('\uE261'), 'lower hand retains its written natural');
    // Select a voice relative to its hand.
    const {publication} = renderScorePart(host(), score, 'left', {voice:2});
    const events = JSON.parse(publication.pages[0].svg.querySelector('metadata').textContent).events;
    assert.deepEqual(events.map(e => [e.staff, e.keys]), [['left',['c/3']]]);
  });

  QUnit.test('Chord fingerings and explicit accidentals stay with their piano hand', assert => {
    const score = parseScore('piano time=2/4 fingering=left accents=top\nnotes :q (Fn/4[f2].A/4[f4:r]) G/4[>] |\n' +
      'voice hand=left\nnotes :h C/3[f1] |');
    for (const part of ['score', 'notation', 'right', 'left'] as const) {
      const root = host();
      if (part === 'score') renderScore(root, score);
      else renderScorePart(root, score, part);
      const fingers = [...root.querySelectorAll('.vf-stavenote text')].map(el => el.textContent)
        .filter(text => ['1', '2', '4'].includes(text)).sort();
      const naturals = [...root.querySelectorAll('.vf-notehead text')].filter(el => el.textContent.includes('\uE261'));
      assert.deepEqual(fingers, part === 'left' ? ['1'] : part === 'right' ? ['2', '4'] : ['1', '2', '4'], part);
      assert.equal(naturals.length, part === 'left' ? 0 : 1, part + ' written natural');
    }
  });

  QUnit.test('Printed pages and practice hands preserve their source identities', assert => {
    const score = parseScore(duet);
    for (const part of ['notation','right','left'] as const) {
      const root = host();
      const {publication, rangeFor} = renderScorePart(root, score, part);
      const page = publication.pages[0].svg;
      const events = JSON.parse(page.querySelector('metadata').textContent).events;
      const hands = [...new Set(events.map(e => e.staff))];
      assert.deepEqual(hands, part === 'notation' ? ['right','left'] : [part]);
      assert.equal(bracePaths(page) > 0, part === 'notation');
      for (const event of events) assert.ok(rangeFor(event.id, duet));
      assert.deepEqual(publication.diagnostics, []);
    }
    const single = renderScore(host(), score, {part:'left'});
    assert.ok(single.navigation.events.every(e => e.staff === 'left'));
    assert.ok(scorePerformance(single.score, 60).events.every(e => e.notes.every(n => n.pitch < 60)));

    const el = host();
    el.textContent = duet;
    const embed = new Div(el);
    assert.equal(embed.getReadingEvents().length, 12, 'a piano embed selects grand-staff layout');
    embed.setPart('right');
    assert.ok(embed.getReadingEvents().every(e => e.staff === 'right'));
    embed.dispose();
  });

  QUnit.test('Playback highlights the engraved hand on screen and on the printed page', assert => {
    const score = parseScore(duet);
    for (const part of ['notation', 'right', 'left'] as const) {
      const root = host();
      const screen = renderScore(root, score, { part });
      const print = renderScorePart(host(), score, part);
      for (const [svg, music] of [[root.querySelector('svg'), screen.score], [print.publication.pages[0].svg, print.score]] as const) {
        const surface = scoreSurfaces.get(svg);
        assert.strictEqual(surface.score, music, 'the player uses the score for the selected hands');
        const geometry = surface.read();
        const attacks = music.measures.flatMap(m => m.voices.flatMap(v => v.events));
        assert.equal(geometry.size, attacks.length, 'each attack has a highlight position');
        for (const attack of attacks) assert.equal(geometry.get(attack.id)?.heads.length, 1, part + ' highlights one head per note');
      }
    }
  });

  QUnit.test('Incomplete or inconsistent hands identify the score line', assert => {
    for (const [source, error] of [
      ['piano time=1/4\nnotes C/4', /left hand.*line 1/],
      ['piano time=1/4\nnotes C/4\nvoice\nnotes C/3', /hand=right or hand=left.*line 3/],
      ['piano time=1/4\nnotes C/4\nvoice hand=left\nnotes :h C/3', /fill the same bar.*line 4/],
      ['piano time=1/4\nnotes 0/1\nvoice hand=left\nnotes C/3', /named pitches.*line 2/],
    ] as const) assert.throws(() => parseScore(source), error);
  });
});
