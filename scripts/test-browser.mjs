// Run the built QUnit suite and check the interactive playground in headless Chrome.
import assert from 'node:assert/strict';
import manifest from '../package.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const browser = await chromium.launch(process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN }
  : { channel: 'chrome' });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(new URL('../dist/index.html', import.meta.url).href);
  await page.locator('#qunit-banner.qunit-pass, #qunit-banner.qunit-fail').waitFor({ state: 'attached' });
  const result = await page.locator('#qunit-testresult').innerText();
  console.log(result);
  const failures = await page.locator('#qunit-tests > .fail').allTextContents();
  assert.deepEqual(failures, []);
  assert.match(result, /[1-9]\d* passed/);

  await page.goto(new URL('../dist/playground.html', import.meta.url).href);
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
  await page.addScriptTag({ path: fileURLToPath(new URL('../dist/vextab-div.js', import.meta.url)) });
  await page.locator('.vex-tabdiv canvas').waitFor();
  assert.equal(await page.locator('.vex-tabdiv textarea').inputValue(), 'tabstave\nnotes 5/2');
  assert.equal(await page.locator('.editor-error').innerText(), '');
  assert.equal(await page.evaluate(() => window.VexTabDiv.Flow.BUILD.VERSION), manifest.dependencies.vexflow);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
