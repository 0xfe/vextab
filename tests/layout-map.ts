// Exercise written-time cursor positioning and pointer seeking on actual SVG and Canvas scores.
import { parseScore, renderConductor, renderScore, type ScoreLayoutMap, type ScoreLayoutPosition } from '../src/browser';

/** Mounted surfaces expose their actual SVG transforms and CSS client rectangles. */
function host(): HTMLElement {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}

/** The cursor and inverse should agree to half an unscaled engraving pixel after pointer snapping. */
function roundTrip(assert, map: ScoreLayoutMap, cursor: ScoreLayoutPosition) {
  const hit = map.hitTest({ x: cursor.x, y: cursor.staffCenterY });
  assert.deepEqual([hit.partIndex, hit.staffIndex, hit.measure, hit.system], [cursor.partIndex, cursor.staffIndex, cursor.measure, cursor.system]);
  assert.closeTo(hit.offset, cursor.offset, 1e-9);
  assert.closeTo(map.positionAt(hit).x, cursor.x, 0.5);
  assert.deepEqual(hit.eventIds, cursor.eventIds);
}

QUnit.module('Written score layout map', () => {
  QUnit.test('pickup, sustained notes, rests and the next system keep their written addresses through reflow', assert => {
    const score = parseScore('meter 4/4 pickup 1/4 staff lead { :q G4 | :h C4 rest | break system :w D4 bar final }');
    const target = host();
    const widths = [370, 720];
    for (const renderer of ['svg', 'canvas'] as const) {
      const rests = [];
      for (const width of widths) {
        const view = renderScore(target, score, { renderer, width });
        const map = view.layoutMap;
        const at = (measure: number, offset: number | string) => map.positionAt({ partIndex: 0, measure, offset });
        const pickup = at(1, '1/8'), pickupEnd = at(1, '1/4');
        roundTrip(assert, map, pickup);
        roundTrip(assert, map, pickupEnd);
        assert.strictEqual(at(1, '3/8'), undefined);
        assert.equal(pickupEnd.x, pickupEnd.staffBounds.right);
        const note = at(2, 0), sustain = at(2, '1/4'), rest = at(2, '1/2'), inside = at(2, '3/4');
        const barline = at(2, 1), next = at(3, 0);
        for (const pos of [note, sustain, rest, inside, barline, next]) roundTrip(assert, map, pos);
        assert.ok(note.x < sustain.x && sustain.x < rest.x && rest.x < inside.x && inside.x < barline.x);
        assert.closeTo(inside.x, (rest.x + barline.x) / 2, 1e-7);
        assert.deepEqual(note.eventIds, [view.score.measures[1].voices[0].events[0].id]);
        assert.deepEqual(rest.eventIds, [view.score.measures[1].voices[0].events[1].id]);
        assert.deepEqual(sustain.eventIds, []);
        assert.deepEqual(inside.eventIds, []);
        assert.deepEqual(next.eventIds, [view.score.measures[2].voices[0].events[0].id]);
        for (const cursor of [note, rest, next]) {
          const reading = view.navigation.events.find(e => e.source === cursor.eventIds[0]);
          const engraved = view.composition.getNote(reading.id);
          assert.closeTo(cursor.x, engraved.getAbsoluteX(), 0.01, 'cursor meets the engraved attack or rest');
          assert.ok(cursor.staffCenterY >= engraved.getStave().getYForLine(0));
          assert.ok(cursor.staffCenterY <= engraved.getStave().getYForLine(4));
        }
        assert.ok(next.system > inside.system && next.systemBounds.top > inside.systemBounds.bottom);

        const music = target.querySelector<SVGSVGElement | HTMLCanvasElement>('svg, canvas');
        const nativeWidth = parseFloat(music.style.width), nativeHeight = parseFloat(music.style.height);
        music.style.transformOrigin = 'top left';
        music.style.transform = 'scale(0.6, 0.8)';
        const rect = music.getBoundingClientRect();
        // Dispatch a CSS-space pointer through the same client-to-surface lookup an editor uses.
        let sought: ScoreLayoutPosition;
        music.addEventListener('pointerdown', (event: PointerEvent) => { sought = map.hitTest(map.clientPoint(event)); }, { once: true });
        music.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + inside.x * rect.width / nativeWidth,
          clientY: rect.top + inside.staffCenterY * rect.height / nativeHeight }));
        assert.equal(sought.measure, inside.measure);
        assert.closeTo(map.positionAt(sought).x, inside.x, 0.5);
        rests.push(inside.x);
        assert.strictEqual(map.hitTest({ x: inside.x, y: (inside.systemBounds.bottom + next.systemBounds.top) / 2 }), undefined);
        assert.strictEqual(map.hitTest({ x: -5, y: inside.staffCenterY }), undefined);
        for (const invalid of ['3/0', '3/4junk', -0.5, Infinity]) assert.strictEqual(at(2, invalid), undefined);
      }
      assert.notEqual(rests[0], rests[1], 'the new map uses the new engraving width');
    }
  });

  QUnit.test('automatic line wrapping moves a saved time to its new system', assert => {
    const model = parseScore('staff { times 4 { :8 C4 D4 E4 F4 G4 F4 E4 D4 | } }');
    const target = host();
    const where = { partIndex: 0, measure: 4, offset: '3/16' };
    const wide = renderScore(target, model, { width: 900 }).layoutMap;
    const narrow = renderScore(target, model, { width: 360 }).layoutMap;
    const before = wide.positionAt(where), after = narrow.positionAt(where);
    assert.ok(after.system > before.system);
    assert.ok(after.systemBounds.top > before.systemBounds.top);
    roundTrip(assert, narrow, after);
  });

  QUnit.test('conductor voices, centered rests and extracted TAB share source event identities', assert => {
    const score = parseScore('meter 4/4 staff tacet { :w rest | } '
      + 'staff choir { voice high { :8 G4 A4 :q B4 :h C5 | } voice low { :h C4 rest | } } '
      + 'guitar strings { view both :w 0/1 | }');
    const conductor = renderConductor(host(), score);
    const map = conductor.layoutMap;
    const choir = conductor.parts[1].measures[0].voices;
    const downbeat = map.positionAt({ partIndex: 1, measure: 1, offset: 0 });
    assert.deepEqual(downbeat.eventIds, choir.map(v => v.events[0].id));
    const tacet = map.positionAt({ partIndex: 0, measure: 1, offset: 0 });
    const second = map.positionAt({ partIndex: 1, measure: 1, offset: '1/8' });
    const held = map.positionAt({ partIndex: 0, measure: 1, offset: '1/8' });
    assert.equal(tacet.x, downbeat.x, 'a centered whole rest shares the downbeat column');
    assert.ok(tacet.x < held.x);
    assert.equal(held.x, second.x, 'a held note uses the neighboring voice’s engraved spacing');
    assert.deepEqual(held.eventIds, []);
    assert.deepEqual(second.eventIds, [choir[0].events[1].id]);
    for (const pos of [tacet, downbeat, second, held]) roundTrip(assert, map, pos);

    const tablature = map.positionAt({ partIndex: 2, staffIndex: 1, measure: 1, offset: 0 });
    const notation = map.positionAt({ partIndex: 2, measure: 1, offset: 0 });
    assert.ok(tablature.staffBounds.top > notation.staffBounds.bottom);
    assert.deepEqual(tablature.eventIds, notation.eventIds);
    roundTrip(assert, map, tablature);
    const extracted = renderScore(host(), score, { partId: 'strings', part: 'tab' }).layoutMap;
    const solo = extracted.positionAt({ partIndex: 2, measure: 1, offset: 0 });
    assert.deepEqual(solo.eventIds, tablature.eventIds);
    roundTrip(assert, extracted, solo);
    assert.strictEqual(extracted.positionAt({ partIndex: 0, measure: 1, offset: 0 }), undefined);
  });
  QUnit.test('cross-staff notes, invisible skips and legacy measures use the same map', assert => {
    const piano = parseScore('meter 2/4 piano { upper treble { :8 G4[beamStart b] F4 E4[onStaff lower] D4[onStaff lower, beamEnd b] | } '
      + 'lower bass { :h skip | } }');
    const view = renderScore(host(), piano);
    const [upper, lower] = view.score.measures[0].voices;
    const map = view.layoutMap;
    const onUpper = map.positionAt({ partIndex: 0, measure: 1, offset: '1/4' });
    const onLower = map.positionAt({ partIndex: 0, staffIndex: 1, measure: 1, offset: '1/4' });
    assert.deepEqual(onUpper.eventIds, []);
    assert.deepEqual(onLower.eventIds, [upper.events[2].id], 'the destination staff owns the displayed attack');
    roundTrip(assert, map, onLower);
    const skip = map.positionAt({ partIndex: 0, staffIndex: 1, measure: 1, offset: 0 });
    assert.deepEqual(skip.eventIds, [lower.events[0].id]);
    roundTrip(assert, map, skip);

    const legacy = renderScore(host(), parseScore('stave time=2/4\nnotes :q C/4 D/4', { language: 1 }));
    const second = legacy.layoutMap.positionAt({ partIndex: 0, measure: 1, offset: '1/4' });
    assert.deepEqual(second.eventIds, [legacy.score.measures[0].voices[0].events[1].id]);
    roundTrip(assert, legacy.layoutMap, second);
  });

  QUnit.test('an actual ledger-line notehead gives a written location outside the staff band', assert => {
    const view = renderScore(host(), parseScore('staff { :w C7 | }'));
    const attack = view.score.measures[0].voices[0].events[0];
    const head = view.navigation.heads.get(attack.id)[0].bounds;
    const position = view.layoutMap.positionAt({ partIndex: 0, measure: 1, offset: 0 });
    const point = { x: head.x + head.w / 2, y: head.y + head.h / 2 };
    assert.ok(point.y < position.staffBounds.top);
    assert.deepEqual(view.layoutMap.hitTest(point), position);
    assert.strictEqual(view.layoutMap.hitTest({ x: point.x + 60, y: point.y }), undefined);
  });

});
