// Run the built QUnit suite and check the interactive playground in the selected browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import manifest from '../package.json' with { type: 'json' };
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testDisplay } from './test-display.mjs';
import { testGuideAudio } from './test-guide-audio.mjs';
import { testGuide } from './test-guide.mjs';
import { chromium, firefox, webkit } from 'playwright-core';

// Release checks point the same suite at the files extracted from the package.
const dist = resolve(process.argv[2] ?? 'dist');
// The same packaged parser is usable by a command-line validator without a browser.
const { parseScore, ScoreError } = createRequire(import.meta.url)(resolve(dist, 'score.cjs'));
execFileSync(process.execPath, ['experiments/grammarv2/compiler.test.mjs', resolve(dist, 'score.cjs')], { stdio: 'inherit' });
const sample = 'stave time=1/4\r\nnotes C/4';
assert.throws(() => parseScore(sample + ' ?'), error =>
  error instanceof ScoreError && error.range.start === sample.length + 1);
const note = parseScore(sample).measures[0].voices[0].events[0];
assert.equal(sample.slice(note.range.start, note.range.end), 'C/4');
assert.equal(note.duration, '1/4');
const engine = process.env.VEXTAB_BROWSER ?? 'chromium';
const browsers = { chromium, firefox, webkit };
assert.ok(Object.hasOwn(browsers, engine), 'Unknown VEXTAB_BROWSER: ' + engine);
const chrome = process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' };
const browser = await browsers[engine].launch(engine === 'chromium' ? chrome : {});

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(pathToFileURL(resolve(dist, 'index.html')).href);
  await page.getByRole('link', { name: 'Browser test suite' }).click();
  await page.locator('#qunit-banner.qunit-pass, #qunit-banner.qunit-fail').waitFor({ state: 'attached' });
  const result = await page.locator('#qunit-testresult').innerText();
  console.log(result);
  const failures = await page.locator('#qunit-tests > .fail').allTextContents();
  assert.deepEqual(failures, []);
  assert.match(result, /[1-9]\d* passed/);

  await page.goto(pathToFileURL(resolve(dist, 'playground.html')).href);
  await page.locator('#boo svg path').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('#error').innerText(), '');

  // A markup-shaped option name must stay readable when a user edits a score.
  await page.locator('#blah').fill('tabstave <em>label</em>=true');
  await page.locator('#blah').press('End');
  await page.waitForFunction(() => document.querySelector('#error').textContent.includes('<em>label</em>'));
  assert.equal(await page.locator('#error em').count(), 0);
  assert.equal(await page.locator('#boo').getAttribute('data-preview-stale'), 'true');
  await page.locator('#blah').fill('stave\nnotes C/4');
  await page.waitForFunction(() => !document.querySelector('#boo').hasAttribute('data-preview-stale'));

  // Exercise the packaged guide with keyboard editing, both views, and a mobile viewport.
  await page.goto(pathToFileURL(resolve(dist, 'guide/triplets.html')).href);
  const source = page.getByRole('textbox', { name: 'VexTab source' });
  const toggle = page.getByRole('checkbox', { name: 'Show standard notation' });
  const original = await source.inputValue();
  await page.locator('#score svg path').first().waitFor({ state: 'attached' });
  const pairedHeight = await page.locator('#score svg').getAttribute('height');
  await toggle.focus();
  await toggle.press('Space');
  await page.waitForFunction(h => document.querySelector('#score svg').getAttribute('height') !== h, pairedHeight);
  assert.match(await source.inputValue(), /notation=false/);
  await source.fill((await source.inputValue()).replace('4/1 |', '5/1 |'));
  await toggle.check();
  assert.match(await source.inputValue(), /5\/1 \|/);
  await source.fill('stave\nnotes ?');
  await page.locator('[data-preview-stale="true"]').waitFor();
  assert.equal(await toggle.isDisabled(), true);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-preview-stale]'));
  assert.equal(await source.inputValue(), original);
  assert.equal(await toggle.isChecked(), true);
  await page.setViewportSize({ width: 360, height: 740 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 720 });

  // A keyboard selection follows the same source through reflow and independent print.
  await page.getByRole('link', { name: /Follow a tied chord/ }).click();
  const selecting = page.getByRole('button', { name: 'Select the tied chord' });
  const selection = () => source.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd));
  const phrase = await source.inputValue();
  await page.locator('#score svg').waitFor();
  const height = Number(await page.locator('#score svg').getAttribute('height'));
  await page.getByRole('checkbox', { name: 'Narrow the score' }).check();
  assert.ok(Number(await page.locator('#score svg').getAttribute('height')) > height);
  await selecting.focus();
  await selecting.press('Enter');
  assert.equal(await selection(), 'T(2/3.1/2)');
  await page.getByRole('button', { name: 'Engrave notation part' }).click();
  await page.locator('#part svg').waitFor();
  await page.getByRole('button', { name: 'Find the chord from the part' }).click();
  assert.equal(await selection(), 'T(2/3.1/2)');
  await source.fill(phrase + ' ?');
  // Exercise the revision guard before the debounced parser has even run.
  assert.equal(await page.evaluate(() => {
    document.querySelector('#select').click();
    const input = document.querySelector('textarea');
    return input.selectionStart === input.selectionEnd;
  }), true);
  await page.locator('#score [data-preview-stale="true"] svg').waitFor();
  assert.equal(await page.locator('#part svg').count(), 0);
  await selecting.click();
  assert.equal(await selection(), '');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await page.waitForFunction(() => !document.querySelector('#score [data-preview-stale]'));
  await selecting.click();
  assert.equal(await selection(), 'T(2/3.1/2)');
  await page.setViewportSize({ width: 360, height: 740 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 720 });

  // Exercise the two packaged studies through the real editor and its ResizeObserver.
  await page.getByRole('link', { name: /fingerstyle turnaround and a lead sheet/ }).click();
  const select = page.getByRole('combobox', { name: 'Study' });
  const tabs = page.getByRole('checkbox', { name: 'Tab only' });
  await page.locator('#score svg').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const scoreHeight = () => page.locator('#score svg').evaluate(svg => Number(svg.getAttribute('height')));
  const wideHeight = await scoreHeight();
  await page.setViewportSize({ width: 392, height: 800 }); // 360 px after page gutters.
  const waitForScoreWidth = width => page.waitForFunction(expected =>
    Math.abs(Number(document.querySelector('#score svg').getAttribute('width')) - expected) < 0.01, width);
  await waitForScoreWidth(360);
  assert.ok(await scoreHeight() > wideHeight);
  await tabs.check();
  const endingLabels = await page.locator('#score svg text').allTextContents();
  assert.ok(endingLabels.includes('1.') && endingLabels.includes('2.'), 'Both native tab endings are drawn');
  const draft = (await source.inputValue()).replace('capo=0', 'capo=2');
  await source.fill(draft);
  await select.selectOption('lead');
  assert.equal(await tabs.isVisible(), false);
  await page.locator('.vf-fret-diagram').waitFor();
  assert.equal(await page.locator('#score .editor-error').innerText(), '');
  await source.fill((await source.inputValue()).replace('Slow,', 'Go!'));
  await page.waitForFunction(() => document.querySelector('#score svg').textContent.includes('Go!'));
  await select.selectOption('guitar');
  assert.equal(await source.inputValue(), draft);
  await page.getByRole('button', { name: 'Reset study' }).click();
  assert.match(await source.inputValue(), /capo=0/);
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForScoreWidth(960);
  assert.equal(await scoreHeight(), wideHeight);

  await testGuide(page, dist);
  await testGuideAudio(browser, dist);
  await testDisplay(browser, dist, engine);

  // Older pages load the VexTabDiv global and use a different class and attributes.
  await page.goto('about:blank');
  await page.setContent(`
    <div id="legacy" class="vex-tabdiv" data-renderer="" editor="true" editor_width="520">tabstave\nnotes 5/2</div>
    <div id="legacy-piano" class="vex-tabdiv">piano time=1/4\nnotes C/4\nvoice hand=left\nnotes C/3</div>
    <div id="fixed" class="vex-tabdiv" layout="flow" data-layout="fixed" data-renderer="svg"
      width="240" data-width="600" data-scale="0.5" data-editor="true"
      editor_height="100" data-editor_height="80" data-editor-height="60"
      data-editor_width="280">tabstave\nnotes 5/2</div>
    <div id="flow" class="vextab-auto" style="width: 450px" width="200" data-width="auto"
      data-layout="flow" editor="true" data-editor="false">stave time=1/4\nnotes C/4</div>
    <div id="fixed-width" class="vextab-auto" style="width: 450px" width="auto" data-width="300"
      data-layout="" layout="flow">stave time=1/4\nnotes C/4</div>
    <div id="invalid" class="vextab-auto" data-show-errors="true">notes ?</div>`);
  await page.addScriptTag({ path: resolve(dist, 'vextab-div.js') });
  await page.locator('#legacy canvas').waitFor();
  assert.equal(await page.locator('#legacy').getAttribute('renderer'), 'canvas');
  assert.match(await page.locator('#legacy canvas').getAttribute('aria-label'), /string 2 fret 5/);
  assert.equal(await page.locator('#legacy textarea').inputValue(), 'tabstave\nnotes 5/2');
  assert.equal(await page.locator('#legacy textarea').evaluate(el => el.style.width), '520px');
  assert.equal(await page.locator('#legacy .editor-error').innerText(), '');
  const piano = page.locator('#legacy-piano svg');
  assert.equal(await piano.count(), 1);
  assert.match(await piano.textContent(), /R\.H\./);
  assert.match(await piano.textContent(), /L\.H\./);
  assert.equal(await page.evaluate(() => window.VexTabDiv.Flow.BUILD.VERSION), manifest.dependencies.vexflow);

  // Namespaced settings work for both entry points, including older editor_height markup.
  assert.equal(Number(await page.locator('#fixed svg').getAttribute('width')), 300);
  assert.deepEqual(await page.locator('#fixed textarea').evaluate(el => [el.style.width, el.style.height]), ['280px', '60px']);
  assert.equal(await page.locator('#fixed .vex-canvas').evaluate(el => getComputedStyle(el).overflowX), 'visible');
  assert.ok(await page.locator('#invalid [role="status"]').innerText());

  // Only the host whose effective width is auto follows its container through a resize.
  assert.equal(Number(await page.locator('#flow svg').getAttribute('width')), 450);
  assert.equal(await page.locator('#flow textarea').count(), 0);
  assert.equal(await page.locator('#flow .vex-canvas').evaluate(el => getComputedStyle(el).overflowX), 'auto');
  await page.locator('#flow, #fixed-width').evaluateAll(hosts => hosts.forEach(el => { el.style.width = '360px'; }));
  await page.waitForFunction(() => Number(document.querySelector('#flow svg').getAttribute('width')) === 360);
  assert.equal(Number(await page.locator('#fixed-width svg').getAttribute('width')), 300);
  assert.equal(await page.locator('#fixed-width .vex-canvas').evaluate(el => getComputedStyle(el).overflowX), 'auto');
  if (process.argv[2]) {
    // Exercise both public production entry points directly from the packed distribution.
    const packed = JSON.parse(await readFile(resolve(dist, '../package.json'), 'utf8'));
    assert.equal(packed.name, manifest.name);
    assert.equal(packed.version, manifest.version);
    await page.goto('about:blank');
    await page.setContent('<div id="score"></div>');
    await page.addScriptTag({ path: resolve(dist, '..', packed.main) });
    await page.evaluate(() => {
      const { Artist, Vex, VexTab } = window.vextab;
      const artist = new Artist(10, 10, 500);
      const renderer = new Vex.Flow.Renderer(document.querySelector('#score'), Vex.Flow.Renderer.Backends.SVG);
      new VexTab(artist).parse('tabstave notation=true\nnotes 5/2');
      artist.render(renderer);
    });
    await page.locator('#score svg path').first().waitFor({ state: 'attached' });

    await page.goto('about:blank');
    await page.setContent('<div class="vextab-auto">tabstave\nnotes 5/2</div>');
    await page.addScriptTag({ path: resolve(dist, 'div.prod.js') });
    await page.locator('.vextab-auto svg path').first().waitFor({ state: 'attached' });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
