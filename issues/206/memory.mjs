// Sample total Chrome renderer RSS on macOS/Linux in a separate pass from latency tests.
import { rendererMiB } from './renderer-memory.mjs';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { workloads, output } from './workloads.mjs';

const results = {};
for (const test of workloads().filter(t => ['excerpt', 'quartet', 'archive', 'rag'].includes(t.name))) {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const session = await browser.newBrowserCDPSession();
    const page = await browser.newPage();
    await page.route('http://m0.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>M0 RSS</title>' });
      if (pathname === '/probe.mjs') return route.fulfill({ contentType: 'text/javascript', path: output + '/' + test.entry + '.mjs' });
      return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from(test.bytes) });
    });
    await page.goto('http://m0.test/');
    // Hold input bytes before taking the baseline. Sample repeated scans to catch short allocation peaks.
    await page.evaluate(async () => {
      window.input = await (await fetch('/input')).arrayBuffer();
    });
    const baseline = await rendererMiB(session);
    let done = false;
    const conversion = page.evaluate(() => new Promise((resolve, reject) => {
      const code = `import {probe} from 'http://m0.test/probe.mjs';
        onmessage = ({data}) => {
          const bytes = new Uint8Array(data);
          for (let i=0; i<21; i++) probe(bytes);
          postMessage('done');
        };`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      window.worker = new Worker(url, { type: 'module' });
      window.worker.onmessage = () => resolve();
      window.worker.onerror = e => reject(Error(e.message));
      window.worker.postMessage(window.input, [window.input]);
    })).finally(() => { done = true; });
    let peak = baseline, samples = 0;
    do {
      peak = Math.max(peak, await rendererMiB(session));
      samples++;
      await delay(5);
    } while (!done);
    await conversion;
    results[test.name] = { baselineMiB: baseline, sampledPeakMiB: peak, growthMiB: peak - baseline, samples };
  } finally { await browser.close(); }
}
console.log(results);
writeFileSync(output + '/memory.json', JSON.stringify(results, null, 2) + '\n');
