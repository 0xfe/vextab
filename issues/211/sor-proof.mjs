// Print the Sor guitar import and optionally place its opening beside the edition engraved by LilyPond.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { importLilyPond } from '../../importer/dist/lilypond.js';

const file = resolve('issues/211/fixtures/sor-opening.ly');
const out = resolve('build/importer-m4');
const result = importLilyPond(await readFile(file, 'utf8'), {targetProfile:'expressive', mode:'partial', guitar:true, score:'print'});
assert.ok(result.documents.length, JSON.stringify(result.diagnostics));
await mkdir(out, {recursive:true});
const native = process.argv.includes('--native');
if (native) execFileSync('lilypond', ['-dbackend=svg','-dno-point-and-click','-o', resolve(out,'sor-native'),file], {stdio:'pipe'});
const original = native ? await readFile(resolve(out,'sor-native.svg'),'utf8') : '';
const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1040,height:860}});
  await page.setContent('<style>body{margin:24px;background:white;color:#222;font:16px system-ui}h1{font-size:22px}h2{font-size:16px;margin:12px 0 0}.edition{width:970px}#host{width:970px}aside{position:absolute;left:-200vw}</style><h1>Fernando Sor · Op. 35, No. 22</h1><main></main><h2>VexTab · notation and tablature</h2><div id="host"></div><aside></aside>');
  await page.addScriptTag({path:resolve('dist/main.dev.js')});
  const proof = await page.evaluate(({original, text}) => {
    if (original) {
      const box = document.querySelector('main');
      box.appendChild(document.createElement('h2')).textContent = 'Mutopia edition · GNU LilyPond';
      const svg = new DOMParser().parseFromString(original,'image/svg+xml').documentElement;
      box.appendChild(document.importNode(svg,true));
      const sheet = box.querySelector('svg');
      const lines = [...sheet.querySelectorAll('line')].filter(line => Number(line.getAttribute('x2')) > 40);
      if (!lines.length) throw Error('Missing original staff lines');
      const staffYs = lines.map(line => line.getCTM().f / sheet.getCTM().d);
      const y = Math.min(...staffYs), bottom = Math.max(...staffYs);
      sheet.setAttribute('viewBox', '6 ' + (y-9) + ' 109 ' + (bottom-y+17));
      sheet.removeAttribute('width');
      sheet.removeAttribute('height');
      sheet.classList.add('edition');
    }
    const api = window.vextab;
    const host = document.querySelector('#host');
    host.textContent = text;
    const editor = new api.Div(host, {player:false});
    const documentModel = editor.getScoreDocument();
    const print = api.renderEdition(document.querySelector('aside'), documentModel, {partIndex:0});
    if (print.diagnostics.length) throw Error(JSON.stringify(print.diagnostics));
    const metadata = print.publication.pages.map(page => JSON.parse(page.svg.querySelector('metadata').textContent));
    const surface = document.querySelector('#host svg');
    return {bars:metadata.flatMap(m => m.measures), screenHeads:surface.querySelectorAll('.vf-notehead').length,
      screenFrets:surface.querySelectorAll('.vf-tabnote').length,
      printFrets:print.publication.pages.reduce((n,p) => n + p.svg.querySelectorAll('.vf-tabnote').length,0)};
  }, {original,text:result.documents[0].text});
  assert.deepEqual(proof.bars,[1,2,3,4,5,6,7,8]);
  assert.ok(proof.screenHeads >= 60 && proof.screenFrets > 0 && proof.printFrets > 0, JSON.stringify(proof));
  await page.screenshot({path:resolve(out,native ? 'sor-comparison.png' : 'sor.png'),fullPage:true});
  console.log('Sor, bars 1–8:', proof);
} finally { await browser.close(); }
