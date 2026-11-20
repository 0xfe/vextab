// Exercise the real worklet from disk and measure PCM at the browser's audio output.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A sounding sample catches missing banks, disconnected synths and broken worklet URLs. */
export async function testGuideAudio(browser, dist) {
  const page = await browser.newPage();
  const url = pathToFileURL(resolve(dist, 'guide/index.html')).href;
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  try {
    await page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (destination, ...args) {
        if (destination === this.context.destination) {
          window.guideMeter = this.context.createAnalyser();
          connect.call(this, window.guideMeter);
        }
        return connect.call(this, destination, ...args);
      };
    });
    await page.goto(url + '#features/playback');
    await page.evaluate(() => document.fonts.ready);
    const sheet = page.locator('.chapter-example .vextab-sheet');
    const controls = sheet.locator('.vextab-sheet-controls');
    const metro = sheet.getByRole('button', { name: 'Adjust tempo' });
    const readout = sheet.locator('.vextab-bpm');
    const opacity = () => controls.evaluate(node => getComputedStyle(node).opacity);
    await page.mouse.move(0, 0);
    assert.equal(await opacity(), '1', 'the controls are visible on first render');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.vextab-sheet-controls')).opacity === '0');
    await sheet.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.vextab-sheet-controls')).opacity === '1');
    await metro.hover();
    assert.equal(await readout.innerText(), '96 BPM');
    await sheet.getByRole('button', { name: 'Increase tempo' }).click();
    assert.equal(await readout.innerText(), '101 BPM');
    await page.mouse.move(0, 0);
    await readout.waitFor({ state: 'hidden' });
    await metro.focus();
    await metro.press('Enter');
    await metro.press('Tab');
    await page.keyboard.press('Space');
    assert.equal(await readout.innerText(), '96 BPM', 'keyboard adjustment uses the same tempo');
    await page.keyboard.press('Escape');
    assert.equal(await metro.getAttribute('aria-expanded'), 'false');
    assert.equal(await metro.evaluate(node => node === document.activeElement), true);

    await page.goto(url + '#tutorial/notes');
    await page.evaluate(() => document.fonts.ready);
    const examples = page.locator('.chapter-example');
    const control = index => examples.nth(index).locator('.vextab-sheet-controls > button');
    assert.equal(await examples.count(), 4);
    assert.ok(!requests.some(url => url.includes('guide-instrument')));
    // Cancel while the async chunk is still loading. Its late completion must stay silent.
    await control(0).evaluate(button => { button.click(); button.click(); });
    assert.equal(await control(0).getAttribute('aria-label'), 'Play');
    await control(0).click();
    await page.waitForFunction(() => {
      if (!window.guideMeter) return false;
      const samples = new Float32Array(1024);
      window.guideMeter.getFloatTimeDomainData(samples);
      return samples.some(value => Math.abs(value) > 0.0001);
    }).catch(async cause => {
      const detail = await examples.first().evaluate(host => ({
        audio: window.guideMeter?.context.state ?? 'output disconnected',
        status: [...host.querySelectorAll('[role="status"]')].map(node => node.textContent),
      }));
      throw new Error('No SoundFont PCM at the guide output: ' + JSON.stringify(detail), { cause });
    });
    await control(1).click();
    assert.equal(await control(0).getAttribute('aria-label'), 'Play');
    assert.equal(await control(1).getAttribute('aria-label'), 'Stop');
    const source = examples.nth(1).locator('textarea');
    await source.fill('?');
    await source.press('Control+Enter');
    assert.equal(await control(1).count(), 0);
    await page.goto(url + '#features/pre-bends');
    const button = page.locator('.chapter-example button.vextab-play');
    await button.click();
    await page.locator('.chapter-example .vextab-stop').click();
    await button.waitFor();
    await page.goto(url + '#lesson/guitar-duet');
    await page.evaluate(() => document.fonts.ready);
    const part = page.locator('#part svg:has(metadata)');
    await page.locator('#part .vextab-play').click();
    await page.locator('#part .vextab-playback-paper ellipse').first().waitFor();
    assert.equal(await part.locator('.vextab-playback-ink').count(), 0);
    const whilePlaying = await part.first().evaluate(svg => svg.outerHTML);
    await page.locator('#part .vextab-stop').click();
    assert.equal(await page.locator('#part .vextab-playback-paper').count(), 0);
    assert.equal(await part.first().evaluate(svg => svg.outerHTML), whilePlaying, 'Stop preserves the printable music');
    assert.ok(!requests.some(url => /^https?:/.test(url)), 'Offline playback requested a network resource');
  } finally { await page.close(); }
}
