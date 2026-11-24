// Exercise the original scores in the built guide and check the two piano passages that exposed the API gaps.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [scoreDirectory = 'guide/scores', distribution = 'dist'] = process.argv.slice(2);
const demos = ['liszt-consolation-no5', 'liszt-hungarian-rhapsody-no2', 'chopin-etude-op25-no6',
  'chopin-ballade-no3', 'sor-op35-no22', 'joplin-maple-leaf', 'flamenco-tab', 'all-of-me',
  'handy-st-louis-blues', 'haydn-emperor-variation', 'pocket-change'];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(pathToFileURL(resolve(distribution, 'guide/index.html')).href);
  await page.addScriptTag({ path: resolve(distribution, 'main.dev.js') });
  await page.evaluate(() => document.fonts.ready);
  for (const id of demos) {
    const source = await readFile(resolve(scoreDirectory, id + '.vextab'), 'utf8');
    // Unlisted repertoire can still be opened as a draft in the packaged piano lesson.
    const listed = await page.locator('#picker option').evaluateAll((options, id) => options.some(o => o.value === id), id);
    const route = '#lesson/' + (listed ? id : 'chopin-ballade-no3');
    await page.evaluate(route => { location.hash = route; }, route);
    await page.waitForFunction(route => document.querySelector('#main').dataset.route === route, route);
    const editor = page.locator('#score textarea').first();
    await editor.fill(source);
    await editor.press('Control+Enter');
    assert.equal(await page.locator('#score .editor-error').innerText(), '', id);
    const report = await page.evaluate(({ id, source }) => {
      const score = vextab.parseScore(source);
      const host = document.body.appendChild(document.createElement('div'));
      try {
        const view = vextab.renderConductor(host, score, { width: score.layout?.width ?? 1080 });
        const checks = {};
        if (id === 'liszt-hungarian-rhapsody-no2') {
          checks.distance = view.composition.sheet.getContinuousLayout().rows.map(row => {
            const [upper, lower] = view.composition.staves[row.measures[0] - 1];
            return lower.getYForLine(0) - upper.getYForLine(4);
          });
          checks.handLabels = [...host.querySelectorAll('text')].filter(el => ['R.H.', 'L.H.'].includes(el.textContent)).length;
        }
        if (id === 'chopin-ballade-no3') {
          const gap = composition => {
            const [upper, lower] = composition.staves[0];
            return lower.getYForLine(0) - upper.getYForLine(4);
          };
          const control = vextab.parseScore(source);
          for (const part of control.parts) for (const staff of part.staves) for (const voice of staff.voices)
            voice.spans = voice.spans.filter(span => !['crescendo', 'diminuendo', 'hairpin'].includes(span.kind));
          const withoutWedges = vextab.renderConductor(host.appendChild(document.createElement('div')), control,
            { width: score.layout.width });
          checks.openingWedgeClearance = gap(view.composition) - gap(withoutWedges.composition);
        }
        if (id === 'handy-st-louis-blues') {
          checks.pianoGaps = view.composition.sheet.getContinuousLayout().rows.map(row => {
            const [, upper, lower] = view.composition.staves[row.measures[0] - 1];
            return lower.getYForLine(0) - upper.getYForLine(4);
          });
        }
        if (id === 'liszt-consolation-no5') {
          const notes = (bar, voice) => view.navigation.events.filter(e => e.measure === bar && e.source.includes('.' + voice + '.'))
            .map(e => view.composition.getNote(e.id));
          const bass = notes(7, 'bass');
          checks.pickup = notes(1, 'bass').map(n => n.getStemDirection());
          checks.bass = bass.map(n => n.getStemDirection());
          checks.sameBeam = !!bass[0].getBeam() && bass.every(n => n.getBeam() === bass[0].getBeam());
          checks.quarters = notes(7, 'sustained').map(n => n.getStemDirection());
        }
        const print = vextab.renderEdition(host, score, id === 'haydn-emperor-variation' ? { partId: 'cello' } : 'conductor');
        return { attacks: view.navigation.events.length, pages: print.publication.pages.length,
          diagnostics: [...view.diagnostics, ...print.diagnostics].map(d => d.detail ?? d.code), checks };
      } finally { host.remove(); }
    }, { id, source });
    assert.deepEqual(report.diagnostics, [], id);
    assert.ok(report.attacks > 0 && report.pages > 0, id);
    if (id === 'liszt-hungarian-rhapsody-no2') {
      const [first, second, third] = report.checks.distance;
      assert.ok(second <= Math.max(first, third) + 25, 'bar 9 text clears the bass without separating the hands');
      assert.equal(report.checks.handLabels, 0, 'preserve the two explicitly empty hand names');
    }
    if (id === 'chopin-ballade-no3') {
      assert.ok(Math.abs(report.checks.openingWedgeClearance) < 10, 'both opening wedges fit inside the existing piano gap');
    }
    if (id === 'handy-st-louis-blues') {
      assert.ok(report.checks.pianoGaps.every(gap => gap > 0 && gap < 100), 'keep the piano hands together beneath the singer');
    }
    if (id === 'liszt-consolation-no5') assert.deepEqual(report.checks, {
      pickup: [1, 1], bass: Array(6).fill(-1), sameBeam: true, quarters: [1, 1, 1],
    });
    if (id === 'chopin-etude-op25-no6') {
      const before = '(B4[finger 1 above] D#5[finger 3 above])';
      const after = '(D#5[finger 3 above] B4[finger 1 above])';
      assert.ok(source.includes(before));
      const edited = source.replace(before, after);
      await editor.fill(edited);
      await editor.press('Control+Enter');
      assert.equal(await page.locator('#score .editor-error').innerText(), '');
      const selections = await page.evaluate(edited => {
        const doc = vextab.parseScore(edited), host = document.body.appendChild(document.createElement('div'));
        try {
          const screen = vextab.renderScore(host, doc);
          const attack = screen.score.measures[4].voices[0].events.find(event => event.heads.some(h => h.written === 'd#/5'));
          const note = screen.composition.getNote(screen.navigation.events.find(e => e.source === attack.id).id);
          const fingers = note.getModifiers().filter(m => typeof m.getFretHandFinger === 'function')
            .map(m => [note.getKeys()[m.getIndex()], m.getFretHandFinger()]).sort();
          const printed = vextab.renderScorePart(host, doc, 'right');
          const printedDigits = printed.publication.pages.flatMap(p => [...p.svg.querySelectorAll('[data-vf-id]')])
            .find(el => el.getAttribute('data-vf-id').endsWith('-' + attack.id) && el.classList.contains('vf-stavenote'));
          const digits = [...printedDigits.querySelectorAll('text')].map(t => t.textContent).filter(t => t === '1' || t === '3').sort();
          const ranges = [screen.navigation.heads.get(attack.id), printed.publication.pages.flatMap(p => p.heads.get(attack.id))]
            .map((heads, i) => heads.filter(h => h.role === 'notehead').map(h => {
              const range = (i ? printed : screen).headRangeFor(h.sourceEvent, h.sourceHead, edited);
              return edited.slice(range.start, range.end);
            }).sort());
          return { ranges, fingers, digits };
        } finally { host.remove(); }
      }, edited);
      assert.deepEqual(selections.fingers, [['b/4', '1'], ['d#/5', '3']]);
      assert.deepEqual(selections.digits, ['1', '3']);
      assert.deepEqual(selections.ranges[0], selections.ranges[1]);
      assert.deepEqual(selections.ranges[0].map(s => s.split('[')[0]), ['B4', 'D#5']);
    }
    console.log(id, report.attacks, 'reading events,', report.pages, 'pages');
  }
} finally { await browser.close(); }
