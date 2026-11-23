// Benchmark the complete quartet movement, or the M4 Joplin strain, in fresh Node processes and Chrome workers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

const joplin = process.argv.includes('--joplin');
const expressive = joplin || process.argv.includes('--expressive');
const entry = joplin ? 'lilypond' : 'mxl';
const method = joplin ? 'importLilyPond' : 'importMXL';
const file = new URL(joplin ? '../211/fixtures/joplin-first.ly' : 'fixtures/haydn.mxl', import.meta.url);
const options = joplin ? {targetProfile:'expressive', mode:'partial'} :
  {targetProfile:expressive ? 'expressive' : 'extended', capacity:'large', mode:'partial', selection:{firstMeasure:129,lastMeasure:237}};

/** Time conversion and public reparse separately. File I/O is outside the measurement. */
if (process.argv.includes('--sample')) {
  const archive = joplin ? readFileSync(file, 'utf8') : readFileSync(file);
  const {parseScore} = await import('vextab/parse');
  const rssBefore = process.resourceUsage().maxRSS;
  const start = performance.now();
  const convert = (await import('../../importer/dist/' + entry + '.js'))[method];
  const loaded = performance.now();
  const result = await convert(archive, options);
  const emitted = performance.now();
  const doc = result.documents[0];
  assert.ok(doc, JSON.stringify(result.diagnostics.at(-1)));
  const parsed = parseScore(doc.text, {capacity:'large'});
  const finished = performance.now();
  assert.deepEqual(parsed.parts.map(p => p.measureCount), joplin ? [18] : [109,109,109,109]);
  const peakGrowthMiB = (process.resourceUsage().maxRSS - rssBefore) / 1024;
  console.log(JSON.stringify([loaded-start, emitted-loaded, finished-emitted, peakGrowthMiB]));
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
    JSON.parse(execFileSync(process.execPath, [import.meta.filename,'--sample', ...process.argv.slice(2)], {encoding:'utf8'})));
  const {chromium} = await import('playwright-core');
  const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'});
  try {
    const page = await browser.newPage();
    await page.context().route('http://benchmark.test/**', route => {
      switch (new URL(route.request().url()).pathname) {
        case '/': return route.fulfill({contentType:'text/html',body:'<title>Importer timing</title>'});
        case '/entry.js': return route.fulfill({contentType:'text/javascript',path:fileURLToPath(new URL('../../importer/dist/' + entry + '.js',import.meta.url))});
        case '/worker.js': return route.fulfill({contentType:'text/javascript',body:`
          onmessage = async ({data}) => {
            const start = performance.now();
            const convert = (await import('./entry.js'))[data.method];
            const load = performance.now();
            const result = await convert(data.archive, data.options);
            postMessage({ times: [load - start, performance.now() - load], status: result.status });
          };`});
        default: return route.abort();
      }
    });
    await page.goto('http://benchmark.test/');
    const workers = await page.evaluate(async ({base64, options, count, method, joplin}) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const archive = joplin ? new TextDecoder().decode(bytes) : bytes;
      const rows = [];
      for (let i=0;i<count;i++) {
        const worker = new Worker('/worker.js', {type:'module'});
        try {
          const message = new Promise((done,fail) => {
            worker.onmessage = e => done(e.data);
            worker.onerror = e => fail(Error(e.message));
          });
          worker.postMessage({archive, options, method});
          const result = await message;
          if (result.status === 'failed') throw Error('Worker conversion failed');
          rows.push(result.times);
        } finally { worker.terminate(); }
      }
      return rows;
    }, {base64: readFileSync(file).toString('base64'), options, count, method, joplin});
    console.log(JSON.stringify({entry, profile:options.targetProfile, cpu:cpus()[0].model,node:process.version,chrome:browser.version(),samples:count,
      nodeLoadConvertReparseMs:report(node).slice(0,3), nodePeakRssGrowthMiB:report(node)[3], workerLoadConvertMs:report(workers)}, null, 2));
  } finally { await browser.close(); }
}
