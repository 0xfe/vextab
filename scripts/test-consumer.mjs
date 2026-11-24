// Install the actual tarball in a fresh project and compile a typed browser consumer against it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const archive = resolve(process.argv[2]);
const cwd = await mkdtemp(join(tmpdir(), 'vextab-consumer-'));
await writeFile(join(cwd,'package.json'), JSON.stringify({name:'vextab-consumer',version:'1.0.0',private:true}));
execFileSync('npm', ['install','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',archive], { cwd, stdio:'inherit' });
// Hosts can compile and mount every public playback adapter without installing a synth.
const consumerRequire = createRequire(join(cwd, 'package.json'));
assert.throws(() => consumerRequire.resolve('spessasynth_lib'), { code: 'MODULE_NOT_FOUND' });
// Exercise the installed CLI through npm's bin link, as a score author would.
const converted = execFileSync(join(cwd, 'node_modules/.bin/vextab-migrate'), [], {
  cwd, input: 'stave time=1/4\nnotes :q C/4 |', encoding: 'utf8',
});
assert.equal(consumerRequire('vextab/parse').parseScore(converted).measureCount, 1);
const lesson = await readFile(resolve('guide/scores/first-fret.vextab'), 'utf8');
const previewCheck = "if (parseScore('staff { :w C4 | }').measureCount !== 1) process.exit(1)";
execFileSync(process.execPath, ['--input-type=module','-e',"import {parseScore} from 'vextab/parse';" + previewCheck], { cwd });
execFileSync(process.execPath, ['-e',"const {parseScore}=require('vextab/parse');" + previewCheck], { cwd });
await writeFile(join(cwd,'consumer.ts'), `import { Div, parseScore, renderScore, renderScorePart, type ScoreV2, type PlaybackPlugin, createSpessaSynthPlayback } from 'vextab/browser';
import VexFlow from 'vexflow';
import { Vex } from 'vextab/browser';
if (Vex !== VexFlow) throw Error('Multiple engraving engines');
const host = document.getElementById('manual')!;
const score: ScoreV2 = parseScore('meter 1/4 staff { C4 | }');
const preview: ScoreV2 = parseScore('meter common staff { :w C4 | text words { :h "One" "two" | } }');
if (preview.parts[0].staves[0].voices[0].events[0].duration !== '1/1') throw new Error('bad preview timing');
renderScore(document.getElementById('preview')!, preview, { renderer: 'canvas' });
renderScorePart(document.getElementById('paper')!, preview, 'notation');
new Div(document.getElementById('editor')!);
const screen = renderScore(host, score);
host.dataset.event = screen.navigation.events[0].label;
const example: PlaybackPlugin = { open: () => ({
  playNote(note) { host.dataset.firstPitch ??= String(note.pitch); },
  stop() {}
}) };
const editor = new Div(document.getElementById('embed')!, { player: true, playback: example });
document.getElementById('select')!.onclick = () => {
  editor.selectSource(editor.getReadingEvents()[0].id, editor.getScore()!);
};
if (typeof createSpessaSynthPlayback !== 'function') throw new Error('missing host adapter');`);
execFileSync(resolve('node_modules/.bin/tsc'), ['--module','esnext','--target','es2022','--moduleResolution','bundler','--strict','consumer.ts'], {cwd,stdio:'inherit'});
const compiler = webpack({ mode:'development',devtool:false,context:cwd,entry:'./consumer.js',output:{path:cwd,filename:'bundle.js'} });
try {
  const stats = await new Promise((ok,fail) => compiler.run((e,s) => e ? fail(e) : ok(s)));
  assert.ok(!stats.hasErrors(), stats.toString({ all:false, errors:true }));
} finally { await new Promise(ok => compiler.close(ok)); }
const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'});
try {
  const page = await browser.newPage();
  await page.setContent('<div id="preview"></div><div id="paper"></div><div id="editor" data-editor="true">staff { :w F4 | }</div><div id="manual"></div><div id="embed" data-editor="true" data-editor-height="72"></div><button id="select">Select first note</button><div class="vextab-auto">staff { :w G4 | }</div>');
  await page.locator('#embed').evaluate((el, source) => { el.textContent = source; }, lesson);
  await page.addScriptTag({path:join(cwd,'bundle.js')});
  await page.locator('#embed svg').waitFor();
  await page.locator('#preview canvas').waitFor();
  await page.locator('#paper svg').first().waitFor();
  assert.match(await page.locator('#paper').textContent(), /One/);
  assert.equal(await page.locator('#paper .vf-timed-direction').count(), 2);
  await page.locator('#editor svg').waitFor();
  assert.equal(await page.locator('#embed textarea').evaluate(el => el.style.height), '72px');
  assert.equal(await page.locator('#embed textarea').inputValue(), lesson);
  await page.locator('#embed .vextab-play').click();
  await page.locator('#manual[data-first-pitch="64"]').waitFor();
  await page.locator('#embed .vextab-stop').click();
  await page.locator('#select').click();
  assert.equal(await page.locator('#embed textarea').evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd)), '0/1');
  assert.match(await page.locator('#manual').getAttribute('data-event'), /C 4/);
  assert.equal(await page.locator('.vextab-auto svg').count(), 0);
  const embed = await browser.newPage();
  const script = join(cwd, 'node_modules/vextab/dist/runtime/vextab.js');
  const errors = [];
  embed.on('pageerror', error => errors.push(error.message));
  await embed.addScriptTag({ path: script });
  assert.match(errors.pop() ?? '', /Load vexflow.js before vextab.js/);
  await embed.goto('about:blank');
  await embed.setContent('<div class="vextab-auto">staff { :w G4 | }</div><div class="vex-tabdiv">staff { :w C4 | }</div>');
  await embed.addScriptTag({ path: consumerRequire.resolve('vexflow') });
  await embed.addScriptTag({ path: script });
  await embed.locator('.vextab-auto svg .vf-stavenote').waitFor();
  await embed.locator('.vex-tabdiv canvas').waitFor();
  assert.ok(await embed.evaluate(() => window.vextab.Vex === window.VexFlow && window.VexTabDiv.Flow === window.VexFlow));
  // Exercise every authored guide score with only the two installed scripts, including print fonts.
  const fixtures = new URL('../guide/scores/', import.meta.url);
  for (const name of (await readdir(fixtures)).filter(file => file.endsWith('.vextab'))) {
    const source = await readFile(new URL(name, fixtures), 'utf8');
    const result = await embed.evaluate(source => {
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      const score = window.vextab.parseScore(source);
      window.vextab.renderConductor(host, score, { width: score.layout?.width ?? 960 });
      const screen = host.querySelectorAll('svg .vf-stave').length;
      host.replaceChildren();
      const { publication } = window.vextab.renderEdition(host, score, 'conductor', {});
      return { screen, pages: publication.pages.length, print: host.querySelectorAll('svg .vf-stave').length };
    }, source);
    assert.ok(result.screen && result.pages && result.print, name);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Installed consumer passed CommonJS, ESM, strict TypeScript, bundling and manual browser mounting.');
