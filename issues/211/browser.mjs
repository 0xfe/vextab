// Exercise source imports through the editor, printed part and public player, with comparable evidence images.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { importMusicXML } from '../../importer/dist/musicxml.js';

const output = resolve('build/importer-m4');
await mkdir(output, {recursive:true});
const cases = [
  ['song', 'Voice · tied C, crossing slur and crescendo'],
  ['keyboard', 'Piano · four eighths in one cross-staff beam'],
  ['kit', 'Percussion · acoustic snare with a cross head'],
  ['guitar', 'Guitar · two stopped strings, capo II'],
];
const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'});

/** Render each unchanged input through either importer profile on a white proof sheet. */
async function proof(profile) {
  const page = await browser.newPage({viewport:{width:1120,height:780}});
  try {
    await page.setContent('<style>body{margin:20px;background:white;color:#222;font:16px system-ui}h1{font-size:23px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}section{border-top:1px solid #aaa;min-height:210px}h2{font-size:17px}p{max-width:40em;color:#333}aside{position:absolute;left:-200vw}</style><h1></h1><main></main><aside></aside>');
    await page.addScriptTag({path:resolve('dist/main.dev.js')});
    await page.locator('h1').evaluate((el, text) => { el.textContent = text; }, profile === 'extended' ? 'M3 · extended import' : 'M4 · expressive import');
    for (const [id, title] of cases) {
      const bytes = await readFile(new URL('fixtures/' + id + '.musicxml', import.meta.url));
      const result = importMusicXML(bytes, {targetProfile:profile, mode:'partial'});
      if (profile === 'expressive') assert.ok(result.documents.length, id + ': ' + JSON.stringify(result.diagnostics));
      const score = await page.evaluate(async ({id, title, result, profile}) => {
        const vt = window.vextab;
        const panel = document.querySelector('main').appendChild(document.createElement('section'));
        panel.appendChild(document.createElement('h2')).textContent = title;
        if (result.diagnostics.length) panel.appendChild(document.createElement('p')).textContent =
          result.diagnostics.length + (result.diagnostics.length === 1 ? ' diagnostic. ' : ' diagnostics. ') + (result.diagnostics.find(d => d.severity === 'error') ?? result.diagnostics[0]).message;
        if (!result.documents.length) return;
        const host = panel.appendChild(document.createElement('div'));
        host.textContent = result.documents[0].text;
        const editor = new vt.Div(host, {player:false});
        const model = editor.getScoreDocument();
        if (!model || !editor.getScore()) throw Error('Editor could not open ' + id);
        if (profile === 'extended') return;
        const printed = vt.renderEdition(document.querySelector('aside'), model, {partIndex:0});
        if (printed.diagnostics.length) throw Error(JSON.stringify(printed.diagnostics));
        const svg = printed.publication.pages[0].svg;
        const screen = host.querySelector('svg');
        function inspect(surface) {
          return {
            text:[...surface.querySelectorAll('text')].map(n => n.textContent),
            classes:[...new Set([...surface.querySelectorAll('[class]')].flatMap(n => [...n.classList]))],
            events:surface.querySelectorAll('.vf-notehead').length,
          };
        }
        const notes = [];
        const player = new vt.Player(model, {playback:{open:() => ({
          playNote(note) { notes.push({pitch:note.pitch, duration:note.duration, velocity:note.velocity}); },
          stop() {},
        })}});
        try { await player.play(); } finally { player.dispose(); }
        return {screen:inspect(screen), print:inspect(svg), notes, spans:editor.getScore().spans.map(s => s.kind)};
      }, {id,title,result,profile});
      if (profile === 'expressive') check(id, score);
    }
    await page.locator('body').screenshot({path:resolve(output, profile + '.png')});
  } finally { await page.close(); }
}

/** Compare the projected reading, physical ink and actual plugin calls against these source scores. */
function check(id, score) {
  const pitches = score.notes.map(n => n.pitch);
  for (const surface of [score.screen,score.print]) {
    assert.ok(surface.events || surface.classes.includes('vf-tabnote'), id + ' must engrave on both surfaces');
    if (id === 'song') {
      for (const syllable of ['Fly','ing']) assert.ok(surface.text.includes(syllable), syllable);
    }
  }
  if (id === 'song') {
    assert.deepEqual([...pitches].sort((a,b) => a-b), [60,64,67,69,71]);
    assert.ok(score.notes.find(n => n.pitch === 60).duration > 1.8 * score.notes.find(n => n.pitch === 64).duration);
    assert.ok(score.notes.at(-1).velocity > score.notes[0].velocity);
    for (const kind of ['slur','crescendo']) assert.ok(score.spans.includes(kind), kind);
  } else if (id === 'keyboard') assert.deepEqual(pitches, [72,52,74,55]);
  else if (id === 'kit') assert.deepEqual(pitches, [38]);
  else assert.deepEqual([...pitches].sort((a,b) => a-b), [62,67]);
}

try {
  await proof('extended');
  if (!process.argv.includes('--before-only')) await proof('expressive');
} finally { await browser.close(); }
