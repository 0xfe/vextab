// Run the built QUnit suite and check the interactive playground in headless Chrome.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import manifest from '../package.json' with { type: 'json' };
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

// Release checks point the same suite at the files extracted from the package.
const dist = resolve(process.argv[2] ?? 'dist');
const browser = await chromium.launch(process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN }
  : { channel: 'chrome' });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(pathToFileURL(resolve(dist, 'index.html')).href);
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
  // Older pages load the VexTabDiv global and use a different class and attributes.
  await page.goto('about:blank');
  await page.setContent('<div class="vex-tabdiv" editor="true" editor_width="520">tabstave\nnotes 5/2</div>');
  await page.addScriptTag({ path: resolve(dist, 'vextab-div.js') });
  await page.locator('.vex-tabdiv canvas').waitFor();
  assert.equal(await page.locator('.vex-tabdiv textarea').inputValue(), 'tabstave\nnotes 5/2');
  assert.equal(await page.locator('.editor-error').innerText(), '');
  assert.equal(await page.evaluate(() => window.VexTabDiv.Flow.BUILD.VERSION), manifest.dependencies.vexflow);
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
