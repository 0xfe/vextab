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
    await page.goto(url + '#tutorial/notes');
    await page.evaluate(() => document.fonts.ready);
    const examples = page.locator('.chapter-example');
    const control = index => examples.nth(index).locator('.guide-audio button');
    assert.equal(await examples.count(), 2);
    assert.ok(!requests.some(url => url.includes('guide-instrument')));
    // Cancel while the async chunk is still loading. Its late completion must stay silent.
    await control(0).evaluate(button => { button.click(); button.click(); });
    assert.equal(await control(0).innerText(), 'Play');
    await control(0).click();
    await page.waitForFunction(() => {
      if (!window.guideMeter) return false;
      const samples = new Float32Array(1024);
      window.guideMeter.getFloatTimeDomainData(samples);
      return samples.some(value => Math.abs(value) > 0.0001);
    });
    await control(1).click();
    assert.equal(await control(0).innerText(), 'Play');
    assert.equal(await control(1).innerText(), 'Stop');
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
    await page.locator('#edition-controls .vextab-play').click();
    await page.locator('#part .vextab-playback-paper ellipse').first().waitFor();
    assert.equal(await part.locator('.vextab-playback-ink').count(), 0);
    const whilePlaying = await part.first().evaluate(svg => svg.outerHTML);
    await page.locator('#edition-controls .vextab-stop').click();
    assert.equal(await page.locator('#part .vextab-playback-paper').count(), 0);
    assert.equal(await part.first().evaluate(svg => svg.outerHTML), whilePlaying, 'Stop preserves the printable music');
    assert.ok(!requests.some(url => /^https?:/.test(url)), 'Offline playback requested a network resource');
  } finally { await page.close(); }
}
