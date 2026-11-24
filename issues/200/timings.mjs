// Repeat M0's generated workloads and optional release control on the same machine and browser.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { benchmark } from '../195/capture.mjs';

const bundles = process.argv.slice(2);
if (!bundles.length) bundles.push('dist/main.prod.js');
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel:'chrome' });
try {
  const results = [];
  for (const bundle of bundles) {
    const page = await browser.newPage({ viewport:{ width:1000, height:800 }, deviceScaleFactor:1 });
    try {
      await page.setContent('<style>*{box-sizing:content-box}body,#screen,#paper{background:white;margin:0}#screen{width:fit-content}</style><div id="screen"></div><div id="paper"></div><div id="embed"></div>');
      await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
      await page.addScriptTag({ path:resolve(bundle) });
      await page.addScriptTag({ path:resolve('issues/195/browser.js') });
      const version = await page.evaluate(async () => {
        const vf = window.vextab.Vex.Flow;
        await vf.loadFonts('Bravura','Academico');
        await document.fonts.ready;
        return vf.BUILD.VERSION;
      });
      const timings = await benchmark((method, data) => page.evaluate(([fn, arg]) => window.m0[fn](arg), [method, data]));
      results.push({ version, browser:browser.version(), timings });
      console.log(version, timings.map(({ parts, bars, medianMs }) => ({ parts, bars, medianMs })));
    } finally { await page.close(); }
  }
  await mkdir('build/vt6-m5', { recursive:true });
  await writeFile('build/vt6-m5/timings.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
