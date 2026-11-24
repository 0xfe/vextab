// Install the actual importer tarball, check all three public entries, and engrave worker output with VexTab.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { checkMeasuredConsumers } from '../../scripts/test-importer-measured.mjs';
import { parseScore } from 'vextab/parse';

const out = resolve('build/importer-consumer');
await mkdir(out, { recursive: true });
const consumer = await mkdtemp(join(tmpdir(), 'vextab-import-consumer-'));
// Exercise the real release lifecycle once. The minimum-Node job consumes the prebuilt distribution.
const packFlags = process.argv.includes('--node-only') ? ['--ignore-scripts'] : [];
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', ...packFlags, '--pack-destination', out],
  { cwd: 'importer', encoding: 'utf8' }));
assert.ok(pack.size <= 96 * 1024 && pack.unpackedSize <= 320 * 1024);
// Inspect the package npm actually produced, including generated declarations and license notices.
const manifest = JSON.parse(await readFile('importer/package.json', 'utf8'));
assert.deepEqual(pack.files.map(file => file.path).sort(),
  [...manifest.files, 'README.md', 'package.json'].sort());
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
assert.deepEqual(Object.keys(manifest.optionalDependencies ?? {}), []);
assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}), []);
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
  + 'const compressed = await importMXL(new Uint8Array(), {targetProfile:"expressive", capacity:"large", selection:{parts:["P1"]}}); if (compressed.status === "exact") '
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
// Exercise asynchronous inflation via ESM on the installed subpath in a clean process.
const mxlProgram = `import { readFileSync } from 'node:fs';
  import { importMXL } from 'vextab-import/mxl';
  const result = await importMXL(readFileSync(process.argv[1]));
  console.log(JSON.stringify(result));`;
const mxlResult = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', mxlProgram,
  resolve('issues/208/fixtures/deflated.mxl')], { cwd: consumer, encoding: 'utf8' }));
assert.ok(mxlResult.documents.length, JSON.stringify(mxlResult.diagnostics));
assert.ok(parseScore(mxlResult.documents[0].text).parts.length);
const viaRequire = await use('vextab-import/mxl').importMXL(await readFile('issues/208/fixtures/deflated.mxl'));
assert.deepEqual(viaRequire, mxlResult);
await writeFile(join(consumer, 'check.ts'), types);
execFileSync(resolve('node_modules/.bin/tsc'), ['--noEmit', '--strict', '--target', 'es2022',
  '--module', 'nodenext', 'check.ts'], { cwd: consumer, stdio: 'inherit' });

/** Use the installed subpaths in isolated, offline browser workers. */
async function checkBrowser() {
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
          body: 'import {' + name + '} from "./' + entry + '.js"; onmessage = ({data}) => postMessage(' + name + '(data.input,data.options));' });
      }
      return route.abort();
    });
    await page.goto('http://consumer.test/');
    await page.addScriptTag({ path: resolve('dist/main.dev.js') });
    // Each worker loads only its installed entry, including when it emits the newer grammar.
    async function importInWorker(entry, input, options) {
      return page.evaluate(({ entry, input, options }) => new Promise((done, fail) => {
        const worker = new Worker('/' + entry + '-worker.js', { type: 'module' });
        worker.onerror = e => { worker.terminate(); fail(Error(e.message)); };
        worker.onmessage = ({data}) => { worker.terminate(); done(data); };
        worker.postMessage({input, options});
      }), { entry, input, options });
    }
    for (const [entry, input] of Object.entries(inputs)) {
      const result = await importInWorker(entry, input);
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
    const expressiveSources = {
      musicxml: await readFile(new URL('../211/fixtures/song.musicxml', import.meta.url), 'utf8'),
      lilypond: await readFile(new URL('../211/fixtures/joplin-first.ly', import.meta.url), 'utf8'),
    };
    for (const [entry, source] of Object.entries(expressiveSources)) {
      const result = await importInWorker(entry, source, {targetProfile:'expressive', mode:'partial'});
      assert.equal(result.target.minimumVersion, '6.4.0');
      assert.ok(result.documents.length, JSON.stringify(result.diagnostics.at(-1)));
      const model = parseScore(result.documents[0].text);
      assert.equal(model.parts[0].measureCount, entry === 'musicxml' ? 1 : 18);
      assert.ok(model.parts[0].staves[0].voices[0].spans.some(span => span.kind === 'crescendo'));
    }
    await page.locator('main').screenshot({ path: join(out, 'imported-voices.png') });
    await checkMeasuredConsumers(browser, use, out);
  } finally { await browser.close(); }
}

if (!process.argv.includes('--node-only')) await checkBrowser();
console.log('Packed ESM, CommonJS, TypeScript and compressed score conversions passed.');
console.log({ packedBytes: pack.size, installedBytes: pack.unpackedSize, consumer });
