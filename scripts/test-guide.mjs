// Exercise the packaged guide as a reader, editor, keyboard user and returning author.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  await go('#demos');
  assert.equal(await page.locator('#entries a').count(), 8);
  const routes = await page.locator('aside a').evaluateAll(links => links.map(a => a.hash));
  for (const hash of routes) {
    await go(hash);
    assert.equal(await source.inputValue(), await original(hash.split('/')[1]));
    assert.equal(await status.textContent(), '', hash);
    assert.equal(await svg.count(), 1, hash);
  }

  await go('#lesson/first-fret');
  await page.locator('#view').selectOption('tab');
  assert.match(await page.locator('#reading').textContent(), /tab.*string 1 fret 0/i);
  assert.match(await page.locator('#reader').ariaSnapshot(), /region "Score reader"[\s\S]*Measure 1, tab, voice 1/);
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await page.locator('#select').click();
  const selection = () => source.evaluate(s => s.value.slice(s.selectionStart, s.selectionEnd));
  assert.match(await selection(), /2/);
  const changed = (await source.inputValue()).replace('0-2-3-2', '0-2-5-2');
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
  await source.fill(valid.replace(' E/4', ''));
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
  await source.fill(valid + '?');
  await page.waitForTimeout(325);
  assert.equal(await status.textContent(), '');
  await source.dispatchEvent('compositionend');
  await score.locator('[data-preview-stale]').waitFor();
  await page.locator('#reset').click();
  await go('#reference');
  await page.locator('#search').fill('capo');
  assert.deepEqual(await page.locator('#entries a').allTextContents(), ['tuning · capo · bend · pm']);

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
  assert.ok(await page.locator('#print').isEnabled());
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
  assert.equal(await score.locator('.vex-canvas').evaluate(n => getComputedStyle(n).filter), 'invert(1)');
  await page.emulateMedia({ media:'print', colorScheme:'dark' });
  assert.equal(await score.locator('.vex-canvas').evaluate(n => getComputedStyle(n).filter), 'none');
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
