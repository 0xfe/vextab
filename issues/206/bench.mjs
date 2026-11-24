// Bundle each probe separately, sample cold module loads, and compare Node with a dedicated browser worker.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { compile, limits } from '../../src/score/grammar2/compiler.mts';
import { output, workloads, distribution } from './workloads.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const count = 21;
const moduleFile = entry => resolve(output, entry + '.mjs');

/** Record the installed dependency graph and actual tree-shaken browser transfer size. */
async function bundles() {
  const results = {};
  for (const entry of ['musicxml', 'mxl', 'lilypond']) {
    const result = await build({ entryPoints: [join(dir, entry + '.mjs')], outfile: moduleFile(entry),
      format: 'esm', platform: 'browser', bundle: true, minify: true, metafile: true });
    const bytes = readFileSync(moduleFile(entry));
    const inputs = Object.keys(result.metafile.inputs);
    assert.ok(!inputs.some(path => /node_modules\/(vexflow|playwright)|\/src\/score\//.test(path)));
    assert.equal(inputs.some(path => path.includes('fflate/')), entry === 'mxl');
    assert.equal(inputs.some(path => path.includes('saxes/')), entry !== 'lilypond');
    results[entry] = { minified: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length,
      inputs: inputs.map(path => path.replace(/.*node_modules\//, '').replace(/^.*issues\/206\//, '')) };
  }
  return results;
}

/** Start each browser sample in a fresh worker realm. Bundle download and worker startup are outside load time. */
function browserSample({ code, input, emit }) {
  return new Promise((resolveSample, reject) => {
    const url = text => URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const moduleURL = url(code);
    const workerURL = url(`onmessage = async ({data}) => {
      try {
        const start = performance.now();
        const {probe} = await import(data.moduleURL);
        const loaded = performance.now();
        const result = probe(data.input,data.emit);
        postMessage({load:loaded-start,run:performance.now()-loaded,result});
      } catch(e) { postMessage({error:String(e)}); }
    }`);
    const worker = new Worker(workerURL, { type: 'module' });
    function finish(callback, result) {
      worker.terminate();
      URL.revokeObjectURL(moduleURL);
      URL.revokeObjectURL(workerURL);
      callback(result);
    }
    worker.onerror = event => finish(reject, Error(event.message));
    worker.onmessage = ({data}) => data.error ? finish(reject, Error(data.error)) : finish(resolveSample, data);
    worker.postMessage({ moduleURL, input, emit }, [input.buffer]);
  });
}

/** Exact observations prevent a faster empty scan from passing as a performance improvement. */
function verify(test, result) {
  if (test.emit) {
    const expected = 'staff { :q ' + Array(32).fill('C4 D4 E4 F4 |').join(' ') + ' }';
    assert.equal(result.text, expected);
    assert.equal(compile(result.text).parts[0].staves[0].voices[0].events.length, 128);
  }
  if (test.name === 'duet32') assert.equal(result.timed, 160);
  if (test.name === 'repeated') assert.equal(result.tokens, 4107);
  if (test.name === 'excerpt') assert.equal(result.timed, 784);
  if (test.name === 'quartet' || test.name === 'archive') assert.equal(result.timed, 10014);
  if (test.entry === 'lilypond') assert.ok(result.tokens > 0);
}

/** Exercise a compact lower bound at the real quartet cardinality, without overflowing tokens first. */
function capacity() {
  const excerpt = readFileSync('guide/scores/haydn-emperor-variation.vextab', 'utf8');
  const score = compile(excerpt);
  const events = score.parts.flatMap(p => p.staves.flatMap(s => s.voices.flatMap(v => v.events))).length;
  assert.equal(events, 772);
  const bars = 2503; // 10,012 quarters plus two in the final half bar.
  const control = 'staff { times 32 { times 32 { :q C4 C4 C4 C4 | } } '
    + 'times 32 { times 32 { :q C4 C4 C4 C4 | } } times 14 { times 32 { :q C4 C4 C4 C4 | } } '
    + 'times 7 { :q C4 C4 C4 C4 | } fragment { :q C4 C4 | } }';
  assert.throws(() => compile(control), e => e.code === 'event-limit');
  return { excerptBytes: Buffer.byteLength(excerpt), events, compactControlEvents: bars * 4 + 2, diagnostic: 'event-limit',
    defaults: limits };
}

/** Keep identical input buffers, assertions and sample counts for both runtimes. */
async function main() {
  const report = { node: process.version, os: release(), cpu: cpus()[0].model, samples: count,
    bundles: await bundles(), capacity: capacity(), cases: {} };
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    report.browser = browser.version();
    const page = await browser.newPage();
    await page.route('http://m0.test/', route => route.fulfill({ contentType: 'text/html', body: '<title>M0</title>' }));
    await page.goto('http://m0.test/');
    await page.addScriptTag({ content: 'window.sample = ' + browserSample.toString() });
    for (const test of workloads()) {
      const file = resolve(output, test.name + '.input');
      writeFileSync(file, test.bytes);
      const code = readFileSync(moduleFile(test.entry), 'utf8');
      const node = [], worker = [];
      // Transfer Uint8Array inside the page to avoid including Playwright serialization in conversion time.
      const payload = Buffer.from(test.bytes).toString('base64');
      await page.evaluate(s => { window.input = Uint8Array.from(atob(s), c => c.charCodeAt(0)); }, payload);
      for (let i = 0; i < count; i++) {
        const data = JSON.parse(execFileSync(process.execPath, [join(dir, 'node-sample.mjs'), moduleFile(test.entry), file, String(!!test.emit)], { encoding: 'utf8' }));
        verify(test, data.result);
        node.push(data);
        const observed = await page.evaluate(({code, emit}) => window.sample({ code, input: window.input.slice(), emit }), { code, emit: test.emit });
        assert.deepEqual(observed.result, data.result);
        worker.push(observed);
      }
      const summarize = rows => ({ loadMs: distribution(rows.map(x => x.load)), operationMs: distribution(rows.map(x => x.run)) });
      report.cases[test.name] = { bytes: test.bytes.length, node: summarize(node), worker: summarize(worker),
        nodePeakRSSMiB: distribution(node.map(x => x.peakRSSMiB)),
        nodePeakGrowthMiB: distribution(node.map(x => x.growthMiB)), observed: node[0].result };
      delete report.cases[test.name].observed.text;
      console.log(test.name, report.cases[test.name]);
    }
  } finally { await browser.close(); }
  writeFileSync(join(output, 'benchmark.json'), JSON.stringify(report, null, 2) + '\n');
}

await main();
