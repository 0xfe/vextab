// Install the actual importer tarball, check both public entries, and engrave worker output with VexTab.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { checkMeasuredConsumers } from '../../scripts/test-importer-measured.mjs';
import { parseScore } from 'vextab/parse';

const out = resolve('build/importer-m1');
await mkdir(out, { recursive: true });
const consumer = await mkdtemp(join(tmpdir(), 'vextab-import-consumer-'));
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', out],
  { cwd: 'importer', encoding: 'utf8' }));
assert.ok(pack.size <= 96 * 1024 && pack.unpackedSize <= 320 * 1024);
await writeFile(join(consumer, 'package.json'), '{"type":"module","private":true}');
execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(out, pack.filename)], { cwd: consumer });
const use = createRequire(join(consumer, 'package.json'));
assert.throws(() => use.resolve('vexflow'), { code: 'MODULE_NOT_FOUND' });
const fixture = name => readFile('importer/test/voices.' + name, 'utf8');
const expected = await fixture('vextab');
const inputs = { musicxml: await fixture('musicxml'), lilypond: await fixture('ly') };
const names = { musicxml: 'importMusicXML', lilypond: 'importLilyPond' };

/** Independently specify what the public parser must report in whole-note fractions. */
function checkScore(text) {
  assert.equal(text, expected);
  const score = parseScore(text);
  const voices = score.parts[0].staves[0].voices;
  assert.deepEqual(voices.map(v => v.events.map(e => [e.kind, e.at, e.duration, e.heads.map(h => h.pitch)])), [
    [['attack', '0/1', '1/4', ['F#4']], ['attack', '1/4', '1/4', ['Fn4']]],
    [['skip', '0/1', '1/4', []], ['attack', '1/4', '1/4', ['C4']]],
  ]);
}

let types = 'import { importMXL } from "vextab-import/mxl";\n'
  + 'const compressed = await importMXL(new Uint8Array()); if (compressed.status === "exact") '
  + 'compressed.documents[0].text.toUpperCase();\n';
for (const [entry, input] of Object.entries(inputs)) {
  const id = 'vextab-import/' + entry, name = names[entry];
  checkScore(use(id)[name](input).documents[0].text);
  const program = 'import {' + name + '} from ' + JSON.stringify(id) + '; console.log(JSON.stringify(' + name + '(process.argv[1])))';
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program, input], { cwd: consumer, encoding: 'utf8' }));
  checkScore(result.documents[0].text);
  types += 'import { ' + name + ' } from "' + id + '";\n'
    + 'const ' + entry + ' = ' + name + '(""); if (' + entry + '.status !== "failed") '
    + entry + '.documents[0].text.toUpperCase();\n';
}
await writeFile(join(consumer, 'check.ts'), types);
execFileSync(resolve('node_modules/.bin/tsc'), ['--noEmit', '--strict', '--target', 'es2022',
  '--module', 'nodenext', 'check.ts'], { cwd: consumer, stdio: 'inherit' });

const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 760, height: 500 } });
  const page = await context.newPage();
  // Serve only the installed ESM modules and their worker callers, with no network fallback.
  await context.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body:
      '<style>body{background:white;color:#222;font:16px system-ui;margin:20px}h2{font-size:17px}</style><main></main>' });
    for (const [entry, name] of Object.entries(names)) {
      if (path === '/' + entry + '.js') return route.fulfill({ contentType: 'text/javascript', path: use.resolve('vextab-import/' + entry) });
      if (path === '/' + entry + '-worker.js') return route.fulfill({ contentType: 'text/javascript',
        body: 'import {' + name + '} from "./' + entry + '.js"; onmessage = ({data}) => postMessage(' + name + '(data));' });
    }
    return route.abort();
  });
  await page.goto('http://consumer.test/');
  await page.addScriptTag({ path: resolve('dist/main.dev.js') });
  for (const [entry, input] of Object.entries(inputs)) {
    const result = await page.evaluate(({ entry, input }) => new Promise((done, fail) => {
      const worker = new Worker('/' + entry + '-worker.js', { type: 'module' });
      worker.onerror = e => { worker.terminate(); fail(Error(e.message)); };
      worker.onmessage = ({data}) => { worker.terminate(); done(data); };
      worker.postMessage(input);
    }), { entry, input });
    checkScore(result.documents[0].text);
    const observed = await page.evaluate(({ entry, text }) => {
      const main = document.querySelector('main');
      const title = main.appendChild(document.createElement('h2'));
      title.textContent = entry === 'musicxml' ? 'MusicXML' : 'LilyPond';
      const host = main.appendChild(document.createElement('div'));
      host.textContent = text;
      const editor = new window.vextab.Div(host);
      return editor.getScore().measures[0].voices.map(v => v.events.map(e => e.heads.map(h => h.sounding)));
    }, { entry, text: result.documents[0].text });
    assert.deepEqual(observed, [[['f#/4'], ['f/4']], [[], ['c/4']]]);
  }
  await page.locator('main').screenshot({ path: join(out, 'imported-voices.png') });
  await checkMeasuredConsumers(browser, use, out);
} finally { await browser.close(); }
console.log('Packed Node ESM, CommonJS, TypeScript, two independent browser workers and projected pitches passed.');
console.log({ packedBytes: pack.size, installedBytes: pack.unpackedSize, consumer });
