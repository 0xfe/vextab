// Sample Chrome renderer RSS across 21 conversions of the selected quartet movement in one worker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { rendererMiB } from '../206/renderer-memory.mjs';

// The single-use case supplements the original 21-conversion worker budget.
const conversions = process.argv.includes('--once') ? 1 : 21;
const profile = process.argv.includes('--expressive') ? 'expressive' : 'extended';
const archive = readFileSync(new URL('fixtures/haydn.mxl', import.meta.url));
const bundle = readFileSync(new URL('../../importer/dist/mxl.js', import.meta.url));
const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'});
try {
  const session = await browser.newBrowserCDPSession();
  const page = await browser.newPage();
  await page.route('http://memory.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({contentType:'text/html', body:'<title>Movement benchmark</title>'});
    if (path === '/archive') return route.fulfill({contentType:'application/octet-stream', body:archive});
    if (path === '/mxl.js') return route.fulfill({contentType:'text/javascript', body:bundle});
    if (path === '/worker.js') return route.fulfill({contentType:'text/javascript', body:`
      import { importMXL } from './mxl.js';
      onmessage = async ({data}) => {
        try {
          const archive = new Uint8Array(data);
          const options = {mode:'partial', capacity:'large', targetProfile:${JSON.stringify(profile)}, selection:{firstMeasure:129, lastMeasure:237}};
          for (let i = 0; i < ${conversions}; i++) {
            const result = await importMXL(archive, options);
            if (!result.documents.length) throw Error('Missing imported movement');
          }
          postMessage('done');
        } catch (error) { postMessage(String(error)); }
      };`});
    return route.abort();
  });
  await page.goto('http://memory.test/');
  await page.evaluate(async () => { window.archive = await (await fetch('/archive')).arrayBuffer(); });
  const baselineMiB = await rendererMiB(session);
  let done = false;
  const conversion = page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker('/worker.js', {type:'module'});
    worker.onmessage = e => resolve(e.data);
    worker.onerror = e => reject(Error(e.message));
    worker.postMessage(window.archive, [window.archive]);
  })).finally(() => { done = true; });
  let sampledPeakMiB = baselineMiB;
  let samples = 0;
  do {
    sampledPeakMiB = Math.max(sampledPeakMiB, await rendererMiB(session));
    samples++;
    await delay(5);
  } while (!done);
  assert.equal(await conversion, 'done');
  console.log(JSON.stringify({profile, conversions, baselineMiB, sampledPeakMiB, growthMiB:sampledPeakMiB - baselineMiB, samples}));
} finally { await browser.close(); }
