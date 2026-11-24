// Exercise the checkout guide as a reader, editor, keyboard user and returning author.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testGuideImporting } from './test-guide-importing.mjs';

export async function testGuide(page, dist) {
  const url = pathToFileURL(resolve(dist, 'guide/index.html')).href;
  await page.goto(url);
  const score = page.locator('#score');
  const source = score.getByRole('textbox');
  const status = score.locator('.editor-error');
  const svg = score.locator('svg');
  const original = id => readFile(new URL('../guide/scores/' + id + '.vextab', import.meta.url), 'utf8');
  const go = async hash => {
    await page.evaluate(hash => { location.hash = hash; }, hash);
    await page.waitForFunction(hash => document.querySelector('#main').dataset.route === hash, hash);
  };
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(async () => (await document.fonts.load('700 48px Tangerine')).length > 0),
    'the offline guide loads its bundled title font');
  assert.equal(await page.locator('#index h1').textContent(), 'The VexTab Tutorial');
  const chapters = await page.locator('.book-cover + h2 + .chapter-list a').evaluateAll(links => links.map(a => a.hash));
  assert.equal(chapters.length, 16);
  assert.deepEqual(chapters.slice(0, 8), [
    'notes', 'durations', 'chords', 'rests-and-barlines', 'durations-and-tuplets',
    'rhythmic-tab', 'player', 'hammer-ons-and-slides',
  ].map(id => '#tutorial/' + id));
  assert.equal(await page.locator('.book-cover .vextab-play').count(), 0);
  const coverLinks = page.getByRole('navigation', { name: 'More ways to use VexTab' });
  assert.deepEqual(await coverLinks.locator('a').evaluateAll(links => links.map(a => a.hash)),
    ['#quickstart', '#features', '#importing', '#reference']);
  await coverLinks.getByRole('link', { name: 'Embed in your code' }).click();
  await page.locator('#main[data-route="#quickstart"]').waitFor();
  assert.equal(await page.locator('#contents a[aria-current]').getAttribute('href'), '#quickstart/install');
  assert.equal(await page.locator('header a[aria-current]').innerText(), 'Quickstart');
  await page.locator('.page-turn').getByRole('link', { name: /Embed a score/ }).click();
  await page.locator('#main[data-route="#quickstart/embed"]').waitFor();
  assert.match(await page.locator('.chapter-body').textContent(), /new Div/);
  await page.locator('.page-turn').getByRole('link', { name: /configure playback/ }).click();
  await page.locator('#main[data-route="#quickstart/playback"]').waitFor();
  assert.equal(await page.locator('.chapter-example .editor-error').textContent(), '');
  assert.equal(await page.locator('.chapter-example .vextab-sheet .vextab-play').getAttribute('aria-label'), 'Play');
  await page.locator('.page-turn').getByRole('link', { name: /SoundFont with SpessaSynth/ }).click();
  await page.locator('#main[data-route="#quickstart/spessasynth"]').waitFor();
  for (const language of ['bash', 'javascript', 'html']) {
    assert.ok(await page.locator('pre[data-language="' + language + '"] .token').count(), language);
  }
  const audition = page.locator('.chapter-example textarea');
  const ink = page.locator('.syntax-layer');
  const phrase = await audition.inputValue();
  assert.equal(await ink.getAttribute('aria-hidden'), 'true');
  assert.ok(await ink.locator('.keyword').count() > 0);
  await audition.fill(phrase + '\n<literal> & music');
  assert.equal(await ink.textContent(), await audition.inputValue());
  assert.equal(await ink.locator('literal').count(), 0);
  await page.getByRole('button', { name: 'Reset example' }).click();
  assert.equal(await ink.textContent(), phrase);
  let examples = 0;
  for (const hash of chapters) {
    await go(hash);
    const chapter = page.locator('.chapter-body');
    const editors = chapter.locator('textarea');
    const count = await editors.count();
    assert.ok(count > 0, hash);
    assert.equal(await chapter.locator('.syntax-layer').count(), count, hash);
    assert.equal(await chapter.locator('svg').count(), count, hash);
    const playable = hash === '#tutorial/player' || hash === '#tutorial/hammer-ons-and-slides';
    assert.equal(await chapter.locator('.vextab-sheet .vextab-play').count(), playable ? 1 : 0, hash);
    if (hash === '#tutorial/hammer-ons-and-slides') {
      assert.match(await editors.first().inputValue(), /fragment\s*\{\s*:16\b/);
    }
    assert.ok((await chapter.locator('.editor-error').allTextContents()).every(text => !text), hash);
    examples += count;
  }
  assert.equal(examples, 31);
  await go('#tutorial/notes');
  assert.equal(await page.locator('#index h1').textContent(), 'Your first notes');
  // Both the fixed-width engraved sheet and its controls should fit and center within the panel.
  const viewport = page.viewportSize();
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const gaps = await page.locator('.chapter-example').evaluateAll(examples => examples.map(example => {
      const frame = example.getBoundingClientRect(), sheet = example.querySelector('svg').getBoundingClientRect();
      return [sheet.left - frame.left, frame.right - sheet.right];
    }));
    assert.ok(gaps.every(([left, right]) => left >= 0 && Math.abs(left - right) <= 2), 'Centered scores at ' + width);
  }
  await page.setViewportSize(viewport);
  const tutorialInput = page.locator('.chapter-example textarea').first();
  const written = await tutorialInput.inputValue();
  await tutorialInput.fill(written.replace('F#5', 'G5'));
  await tutorialInput.press('Control+Enter');
  await go('#tutorial/chords');
  await go('#tutorial/notes');
  assert.match(await tutorialInput.inputValue(), /G5/);
  await page.getByRole('button', {name:'Reset example'}).first().click();
  assert.equal(await tutorialInput.inputValue(), written);

  await go('#features');
  const features = await page.locator('.chapter-list a').evaluateAll(links => links.map(a => a.hash));
  for (const hash of features) {
    await go(hash);
    const chapter = page.locator('.chapter-body');
    assert.ok(await chapter.locator('a').count(), hash);
    assert.ok((await chapter.locator('.editor-error').allTextContents()).every(text => !text), hash);
    const editors = await chapter.locator('textarea').count();
    const extraStaff = hash === '#features/measured-music' ? 1 : 0;
    assert.equal(await chapter.locator('svg').count(), editors + extraStaff, hash);
  }
  await testGuideImporting(page, url);
  await go('#demos');
  assert.equal(await page.locator('#entries a').count(), 19);
  const routes = await page.locator('#picker option').evaluateAll(options => options.map(o => '#lesson/' + o.value));
  for (const hash of routes) {
    await go(hash);
    assert.equal(await source.inputValue(), await original(hash.split('/')[1]));
    assert.equal(await status.textContent(), '', hash);
    assert.equal(await svg.count(), 1, hash);
  }

  // Rehearse and export the same source revision, including a single player's part.
  for (const [id, view] of [['sor-op35-no22', '0/tab'], ['joplin-maple-leaf', 'keys'], ['chopin-ballade-no3', 'keys'],
    ['liszt-hungarian-rhapsody-no2', 'keys'], ['chopin-etude-op25-no6', 'keys'], ['liszt-consolation-no5', 'keys'], ['all-of-me', 'guitar/tab'], ['flamenco-tab', 'guitarra/notation'], ['pocket-change', 'keys'], ['handy-st-louis-blues', 'singer'], ['haydn-emperor-variation', 'cello']]) {
    await go('#lesson/' + id);
    assert.equal(await page.locator('#view').inputValue(), 'conductor');
    if (id === 'chopin-ballade-no3' || id === 'liszt-hungarian-rhapsody-no2') {
      // A font load or resize can replace the SVG. Measure the currently mounted drawing
      // in one browser task so WebKit never measures detached staves from the previous draw.
      const snapshot = await page.waitForFunction(() => {
        const drawing = document.querySelector('#score svg');
        const width = drawing?.getBoundingClientRect().width;
        if (!width) return false;
        const rows = new Map();
        for (const stave of drawing.querySelectorAll('g.vf-stave:not(.vf-ossia *)')) {
          const { width: staveWidth, y } = stave.firstElementChild.getBBox();
          if (!staveWidth) return false;
          rows.set(y, (rows.get(y) ?? 0) + 1);
        }
        return {
          width,
          counts: [...rows.values()],
          lines: [...rows.keys()],
          // Each cross-system slur has two visible cubic fragments. A brace has four cubics.
          slurFragments: [...drawing.querySelectorAll(':scope > path')].filter(p => (p.getAttribute('d').match(/C/g) ?? []).length === 2).length,
          levelBeams: [...drawing.querySelectorAll('.vf-beam')].filter(group =>
            Math.abs(group.querySelector(':scope > path').getBBox().height - 5) < 0.01).length,
          ossiaNotes: drawing.querySelectorAll('.vf-ossia .vf-stavenote').length,
          pedals: drawing.querySelectorAll('.vf-pedal-down').length,
          heading: drawing.querySelector('.vf-score-heading')?.textContent,
        };
      });
      const engraving = await snapshot.jsonValue();
      await snapshot.dispose();
      assert.ok(engraving.width < 900);
      if (id === 'chopin-ballade-no3') {
        assert.deepEqual(engraving.counts, Array(8).fill(6));
        assert.equal(engraving.ossiaNotes, 3);
        assert.equal(engraving.pedals, 16);
        assert.match(engraving.heading, /Fr.\sChopin,\sOp.\s47/);
      } else {
        assert.deepEqual(engraving.counts, [6, 6, 6, 6, 7, 7]);
        const gaps = engraving.lines.filter((_, i) => i % 2 === 1).map((y, i) => y - engraving.lines[i * 2]);
        assert.ok(gaps[1] <= Math.max(gaps[0], gaps[2]) + 25, 'the bass instruction stays outside the Friska grand staff');
        assert.equal(engraving.slurFragments, 18);
        assert.ok(engraving.levelBeams >= 19 && engraving.levelBeams < 38);
        assert.equal(await svg.locator('.vf-stavenote').count(), 152);
      }
    }
    if (id === 'pocket-change') {
      const mark = svg.locator('.vf-score-opening');
      assert.equal(await mark.count(), 1);
      assert.equal(await mark.locator('.vf-stavenote').count(), 4);
      assert.equal(await mark.locator('.vf-beam').count(), 1);
    }
    if (id === 'sor-op35-no22') assert.match(await page.locator('#reading').innerText(), /Guitar, notation, voice 1/);
    await page.locator('#view').selectOption('part-' + view);
    assert.equal(await status.textContent(), '');
    await page.getByRole('button', { name:'Next event' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name:'Select source' }).press('Enter');
    assert.ok(await source.evaluate(s => s === document.activeElement && s.selectionEnd > s.selectionStart));
    await page.locator('#prepare-print').click();
    await page.waitForFunction(() => !document.getElementById('save-svg').disabled || document.getElementById('print-status').textContent);
    assert.ok(await page.locator('#save-svg').isEnabled(), id + ' export: ' + await page.locator('#print-status').textContent());
    const pages = page.locator('#part svg:has(metadata)');
    assert.ok(await pages.count() > 0);
    if (id === 'chopin-etude-op25-no6' || id === 'liszt-consolation-no5') {
      const firstBars = id === 'chopin-etude-op25-no6' ? ['1', '3', '6', '9', '12', '15'] : ['1', '7', '12', '17'];
      assert.equal(await pages.count(), 1, id);
      assert.deepEqual(await pages.locator('[data-system]').evaluateAll(rows => rows.map(row => row.dataset.system)), firstBars);
      assert.equal(await page.locator('#print-status').textContent(), '');
    }
    if (id === 'liszt-hungarian-rhapsody-no2') {
      assert.equal(await pages.count(), 1);
      assert.deepEqual(await pages.locator('[data-system]').evaluateAll(rows => rows.map(row => row.dataset.system)),
        ['1', '7', '13']);
      const measures = await pages.locator('metadata').evaluate(m => JSON.parse(m.textContent).measures);
      assert.deepEqual(measures, Array.from({ length: 19 }, (_, i) => i + 1));
      assert.equal(await page.locator('#print-status').textContent(), '');
    }
    if (id === 'all-of-me' || id === 'flamenco-tab') {
      const bars = await pages.locator('metadata').evaluateAll(nodes => nodes.flatMap(n => JSON.parse(n.textContent).measures));
      const count = id === 'all-of-me' ? 17 : 16;
      assert.deepEqual(bars, Array.from({ length: count }, (_, i) => i + 1), id + ' exports every bar of the source page');
    }
    if (id === 'pocket-change') assert.equal(await pages.locator('[data-system="1"] .vf-score-opening').count(), 1);
    if (id === 'chopin-ballade-no3') {
      assert.equal(await pages.count(), 1);
      assert.equal(await pages.locator('[data-system="1"] .vf-ossia .vf-stavenote').count(), 3);
      assert.equal(await pages.locator('.vf-pedal-down').count(), 16);
      assert.equal(await pages.locator('.vf-pedal-up').count(), 16);
      assert.equal(await pages.locator('[data-system="1"] .vf-score-heading').count(), 1);
      assert.deepEqual(await pages.locator('[data-system]').evaluateAll(rows => rows.map(row => row.dataset.system)),
        ['1', '7', '13', '19']);
    }
    const edited = (await source.inputValue()) + '\n# rehearsal draft';
    await source.fill(edited);
    assert.equal(await page.locator('#save-svg').isDisabled(), true);
    await source.press('Control+Enter');
    await page.locator('#view').selectOption('conductor');
    assert.equal(await source.inputValue(), edited);
    await page.locator('#reset').click();
  }

  // An edited conductor with incompatible bars still offers both independent instruments.
  await go('#lesson/handy-st-louis-blues');
  await source.fill('staff a { meter 3/4 :h. C4 | } staff b { meter 2/4 :h G4 | }');
  await source.press('Control+Enter');
  assert.match(await status.textContent(), /share a span/);
  await page.locator('#view').selectOption('part-b');
  assert.equal(await status.textContent(), '');
  await source.fill('staff renamed { :w C4 | }');
  await source.press('Control+Enter');
  assert.equal(await page.locator('#view').inputValue(), 'conductor');
  assert.equal(await status.textContent(), '');
  await page.locator('#reset').click();

  // Saved v1 text stays recoverable while the new editor opens a valid v2 score.
  const v1Draft = 'tabstave\nnotes 7/3';
  await page.evaluate(value => localStorage.setItem('vextab.guide.first-fret', value), v1Draft);
  await go('#lesson/first-fret');
  const oldDraft = page.getByRole('link', { name: 'Download previous v1 draft' });
  assert.equal(await oldDraft.getAttribute('download'), 'first-fret-v1.vextab');
  assert.equal(decodeURIComponent((await oldDraft.getAttribute('href')).split(',')[1]), v1Draft);
  assert.match(await source.inputValue(), /guitar \{/);
  await page.locator('#view').selectOption('tab');
  assert.match(await page.locator('#reading').textContent(), /tab.*string 1 fret 0/i);
  assert.match(await page.locator('#reader').ariaSnapshot(), /region "Score reader"[\s\S]*Measure 1, tab, voice 1/);
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await page.locator('#select').click();
  const selection = () => source.evaluate(s => s.value.slice(s.selectionStart, s.selectionEnd));
  assert.match(await selection(), /2/);
  const changed = (await source.inputValue()).replace('0/1 2/1 3/1 2/1', '0/1 2/1 5/1 2/1');
  await source.fill(changed);
  await source.press('Control+Enter');
  const download = page.waitForEvent('download');
  await page.locator('#save').click();
  const file = await download;
  assert.equal(file.suggestedFilename(), 'first-fret.vextab');
  assert.equal(await readFile(await file.path(), 'utf8'), changed);
  await go('#original/first-fret');
  assert.equal(await source.inputValue(), await original('first-fret'));
  await go('#playground/first-fret');
  assert.equal(await source.inputValue(), changed);
  await page.reload();
  assert.equal(await source.inputValue(), changed);
  await page.locator('#reset').click();
  await page.locator('#open').setInputFiles({ name:'my-score.vextab',mimeType:'text/plain',buffer:Buffer.from(changed) });
  await page.waitForFunction(text => document.querySelector('#score textarea').value === text, changed);
  await source.press('Control+Alt+r');
  assert.equal(await source.inputValue(), await original('first-fret'));

  await go('#lesson/diagnostics');
  const valid = await source.inputValue();
  await source.fill(valid.replace(' E4', ''));
  await source.press('Control+Enter');
  await score.locator('[data-preview-stale]').waitFor();
  await page.locator('#error').focus();
  await page.keyboard.press('Enter');
  assert.equal(await selection(), '|');
  await source.fill(valid);
  await source.press('Control+Enter');
  assert.equal(await status.textContent(), '');

  // A composing editor must not run the partial syllable after the ordinary debounce.
  await source.dispatchEvent('compositionstart');
  await source.evaluate((element, text) => {
    element.value = text;
    element.dispatchEvent(new InputEvent('input', { bubbles:true, isComposing:true, inputType:'insertCompositionText' }));
  }, valid + '?');
  await page.waitForTimeout(325);
  assert.equal(await status.textContent(), '');
  await source.dispatchEvent('compositionend');
  await score.locator('[data-preview-stale]').waitFor();
  await page.locator('#reset').click();
  await go('#reference');
  await page.locator('#search').fill('capo');
  assert.deepEqual(await page.locator('.reference-results h3').allTextContents(), ['tuning · capo · palm mute']);
  await page.locator('#search').fill('Div.setWidth()');
  assert.ok(await page.locator('.reference-results #editor-view').count());
  await page.locator('#search').fill('selectSource revision');
  assert.equal(await page.locator('.reference-results article').count(), 1);
  await page.locator('.reference-results h3 a').click();
  // The hash changes before the guide replaces the search box for the selected entry.
  await page.locator('#main[data-route="#reference/editor-reading"]').waitFor();
  assert.match(page.url(), /#reference\/editor-reading$/);
  await page.locator('#search').fill('no-such-api-member');
  assert.equal(await page.locator('.result-count').textContent(), 'No matching entries. Try another term.');

  await go('#lesson/guitar-duet');
  const part = page.locator('#part svg');
  const metadata = () => part.locator('metadata').evaluate(m => JSON.parse(m.textContent));
  assert.match(await part.textContent(), /Guitar 1/);
  const upper = await metadata();
  await page.locator('#player').selectOption('2');
  assert.match(await part.textContent(), /Guitar 2/);
  const lower = await metadata();
  assert.deepEqual(upper.events[0].keys, ['g/4']);
  assert.deepEqual(lower.events[0].keys, ['g/3']);
  assert.ok(upper.spans.some(s => s.kind === 'tie') && !lower.spans.some(s => s.kind === 'tie'));
  assert.equal(new Set(lower.events.map(e => e.measure)).size, 4);
  const a4 = await part.getAttribute('viewBox');
  await page.locator('#paper').selectOption('Letter');
  assert.notEqual(await part.getAttribute('viewBox'), a4);
  await page.waitForFunction(() => !document.querySelector('#print').disabled);
  await page.locator('#player').selectOption('score');
  const full = await metadata();
  assert.equal(full.events.length, upper.events.length + lower.events.length);
  assert.ok(full.spans.some(s => s.kind === 'tie'));
  // The canonical four-bar duet fits a single page in each of its six editions.
  for (const paper of ['A4', 'Letter']) {
    await page.locator('#paper').selectOption(paper);
    for (const [player, expected] of [['1', upper], ['2', lower], ['score', full]]) {
      await page.locator('#player').selectOption(player);
      await page.waitForFunction(() => !document.querySelector('#save-print').disabled);
      assert.equal(await part.count(), 1);
      const current = await metadata();
      assert.deepEqual(current.events.map(e => [e.measure, e.keys]), expected.events.map(e => [e.measure, e.keys]));
      assert.equal(current.events[0].measure, 1);
      assert.equal(current.events.at(-1).measure, 4);
    }
  }
  const exportMetadata = await metadata();
  for (const [button, ext] of [['save-print','html'], ['save-svg','svg']]) {
    const pending = page.waitForEvent('download');
    await page.locator('#' + button).click();
    const file = await pending;
    assert.equal(file.suggestedFilename(), 'guitar-duet-score-Letter' + (ext === 'svg' ? '-1' : '') + '.' + ext);
    const markup = await readFile(await file.path(), 'utf8');
    assert.match(markup, /<path/);
    assert.match(markup, /<metadata/);
    assert.doesNotMatch(markup, /<text[ >]|<script[ >]|<link[ >]/);
    const offline = await page.context().newPage();
    try {
      await offline.route(/^https?:/, request => request.abort());
      await offline.goto('data:' + (ext === 'svg' ? 'image/svg+xml' : 'text/html') + ';charset=utf-8,' + encodeURIComponent(markup));
      assert.equal(await offline.locator('parsererror').count(), 0);
      const firstPage = JSON.parse(await offline.locator('svg metadata').first().textContent());
      assert.deepEqual(firstPage.events, exportMetadata.events);
    } finally { await offline.close(); }
  }
  await source.fill('?');
  assert.equal(await part.count(), 0);
  await page.locator('#reset').click();

  await go('#lesson/embed-workbench');
  const second = page.locator('#second textarea');
  await second.fill((await second.inputValue()).replace('3/2', '4/2'));
  await second.press('Control+Enter');
  await source.fill('?');
  await source.press('Control+Enter');
  assert.equal(await page.locator('#second .editor-error').textContent(), '');
  assert.equal(await page.locator('#second [data-preview-stale]').count(), 0);
  const previous = await second.elementHandle();
  await go('#lesson/first-fret');
  assert.equal(await previous.evaluate(n => n.isConnected), false);
  await go('#lesson/embed-workbench');
  assert.equal(await second.inputValue(), await original('embed-workbench'));
  await page.locator('#reset').click();
  await page.setViewportSize({width:360,height:760});
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(() => document.querySelector('#score svg').getBoundingClientRect().width < 360);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('html').evaluate(n => getComputedStyle(n).colorScheme), 'light');
  const menu = page.getByRole('button', {name:'Contents'});
  await menu.click();
  const firstLesson = page.locator('#contents a').first();
  assert.ok(await firstLesson.isVisible());
  const destination = await firstLesson.getAttribute('href');
  await firstLesson.click();
  await page.waitForFunction(hash => document.querySelector('#main').dataset.route === hash, destination);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  // Reflow replaces the sheet. Resolve the current element and read its style in one browser task.
  async function paperStyle(print) {
    const sample = await page.waitForFunction(print => {
      const sheet = document.querySelector('#score .vex-canvas');
      if (!sheet || matchMedia('print').matches !== print) return false;
      const style = getComputedStyle(sheet);
      return [style.filter, style.backgroundColor, style.color];
    }, print);
    return sample.jsonValue();
  }
  const whitePaper = ['none', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)'];
  assert.deepEqual(await paperStyle(false), whitePaper);
  await page.emulateMedia({ media:'print', colorScheme:'dark' });
  assert.deepEqual(await paperStyle(true), whitePaper);
  await page.emulateMedia({ media:'screen', colorScheme:'light' });
  await page.setViewportSize({width:1280,height:720});

  // Embedded privacy modes can throw even while accessing window.localStorage.
  const privatePage = await page.context().browser().newPage();
  try {
    await privatePage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw Error('unavailable'); } }));
    await privatePage.goto(url + '#lesson/first-fret');
    await privatePage.locator('#score textarea').fill(changed);
    await privatePage.locator('#play').click();
    assert.equal(await privatePage.locator('#score textarea').inputValue(), changed);
  } finally { await privatePage.close(); }
}
