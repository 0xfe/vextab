// Benchmark the selected complete quartet movement in fresh Node processes and dedicated Chrome workers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

const file = new URL('fixtures/haydn.mxl', import.meta.url);
const options = { targetProfile:'extended', capacity:'large', mode:'partial', selection:{firstMeasure:129,lastMeasure:237} };

/** Time conversion and public reparse separately. File I/O is outside the measurement. */
if (process.argv.includes('--sample')) {
  const archive = readFileSync(file);
  const {parseScore} = await import('vextab/parse');
  const start = performance.now();
  const {importMXL} = await import('../../importer/dist/mxl.js');
  const loaded = performance.now();
  const result = await importMXL(archive, options);
  const emitted = performance.now();
  const doc = result.documents[0];
  assert.ok(doc, JSON.stringify(result.diagnostics.at(-1)));
  const parsed = parseScore(doc.text, {capacity:'large'});
  const finished = performance.now();
  assert.deepEqual(parsed.parts.map(p => p.measureCount), [109,109,109,109]);
  console.log(JSON.stringify([loaded-start, emitted-loaded, finished-emitted]));
} else {
  const count = 21;
  /** Sort each column independently. Use nearest-rank median and p95. */
  function report(rows) {
    return rows[0].map((_, c) => {
      const column = rows.map(row => row[c]).sort((a,b) => a-b);
      return [0.5,0.95].map(p => Number(column[Math.ceil(p * count)-1].toFixed(2)));
    });
  }
  const node = Array.from({length:count}, () =>
    JSON.parse(execFileSync(process.execPath, [import.meta.filename,'--sample'], {encoding:'utf8'})));
  const {chromium} = await import('playwright-core');
  const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'});
  try {
    const page = await browser.newPage();
    await page.context().route('http://benchmark.test/**', route => {
      switch (new URL(route.request().url()).pathname) {
        case '/': return route.fulfill({contentType:'text/html',body:'<title>Importer timing</title>'});
        case '/mxl.js': return route.fulfill({contentType:'text/javascript',path:fileURLToPath(new URL('../../importer/dist/mxl.js',import.meta.url))});
        case '/worker.js': return route.fulfill({contentType:'text/javascript',body:`
          onmessage = async ({data}) => {
            const start = performance.now();
            const {importMXL} = await import('./mxl.js');
            const load = performance.now();
            const result = await importMXL(data.archive, data.options);
            postMessage({ times: [load - start, performance.now() - load], status: result.status });
          };`});
        default: return route.abort();
      }
    });
    await page.goto('http://benchmark.test/');
    const workers = await page.evaluate(async ({base64, options, count}) => {
      const archive = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const rows = [];
      for (let i=0;i<count;i++) {
        const worker = new Worker('/worker.js', {type:'module'});
        try {
          const message = new Promise((done,fail) => {
            worker.onmessage = e => done(e.data);
            worker.onerror = e => fail(Error(e.message));
          });
          worker.postMessage({archive, options});
          const result = await message;
          if (result.status === 'failed') throw Error('Worker conversion failed');
          rows.push(result.times);
        } finally { worker.terminate(); }
      }
      return rows;
    }, {base64: readFileSync(file).toString('base64'), options, count});
    console.log(JSON.stringify({cpu:cpus()[0].model,node:process.version,chrome:browser.version(),samples:count,
      nodeLoadConvertReparseMs:report(node), workerLoadConvertMs:report(workers)}, null, 2));
  } finally { await browser.close(); }
}
