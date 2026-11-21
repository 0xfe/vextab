// Reproduce VexTab 6.0.0 in Chrome and isolate the engraving changes in VexFlow 5.7.0.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release as osRelease } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { prepare } from './prepare.mjs';
import { capture } from './capture.mjs';
import { check } from './check.mjs';

const root = resolve('build/vt6-m0');
await mkdir(root, { recursive: true });
const output = await mkdtemp(join(root, 'run-'));
console.log('M0 artifacts:', output);
await prepare(output);
const browser = await chromium.launch(process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const environment = { os: platform(), release: osRelease(), arch: arch(), cpu: cpus()[0]?.model,
    node: process.version, chrome: browser.version(), viewport: [1000, 800], deviceScaleFactor: 1, background: 'white' };
  await writeFile(join(output, 'environment.json'), JSON.stringify(environment, null, 2) + '\n');
  const runs = {};
  for (const [name, version] of [['release', '5.6.1'], ['control', '5.6.1'], ['trial', '5.7.0']]) {
    console.log('Capturing', name, version);
    runs[name] = await capture(browser, output, name, version);
  }
  check(runs);
  for (const run of Object.values(runs)) {
    console.log(run.lane, 'native and literal chord clearances', run.chords.native[0].gap, run.chords.literal[0].gap);
    console.table(run.timings.map(({ parts, bars, medianMs }) => ({ parts, bars, ...medianMs })));
  }
  console.log('M0 passed. Measurements, sources and screenshots:', output);
} finally {
  await browser.close();
}
