// Generate a local, offline score gallery from the qualified sources and downloaded repertoire.
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importMXL } from '../../../importer/dist/mxl.js';
import { importLilyPond } from '../../../importer/dist/lilypond.js';
import { parseScore } from 'vextab/parse';

const out = resolve('build/importer-m5/works');
const corpus = 'build/importer-complex-musicxml/';
const rows = [];
function work(id, title, credit, file, options = {}, source = {}) {
  rows.push({ id, title, credit, file, options, source });
}

const manifest = JSON.parse(await readFile(new URL('../complex-musicxml/sources.json', import.meta.url)));
for (const [id, file, title, credit] of [
  ['brandenburg-i', 'Bach_BWV.1048_1.mxl', 'Brandenburg Concerto No. 3 · I', 'J. S. Bach'],
  ['brandenburg-iii', 'Bach_BWV.1048_3.mxl', 'Brandenburg Concerto No. 3 · III', 'J. S. Bach'],
  ['gretchen', 'lc7111114.mxl', 'Gretchen am Spinnrade', 'Franz Schubert · Voice and piano'],
  ['erlkonig', 'lc29062370.mxl', 'Erlkönig', 'Franz Schubert · Clarinet and piano edition'],
]) {
  const edition = manifest.find((item) => item.file === file);
  work(id, title, credit, corpus + file, {}, { recent: true, url: edition.url, credit: edition.credits });
}
work(
  'bwv846',
  'Fugue in C major',
  'J. S. Bach · BWV 846',
  'issues/212/complex-lilypond/bwv846.ly',
  {},
  {
    recent: true,
    url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=4',
    credit: 'Mutopia · Shay Rojansky and Andreas Scherer · Public domain',
  },
);
work('echigo', 'Echigo-Jishi', 'Japanese song', 'issues/212/musicxml/Echigo-Jishi.mxl');
work('bwv269', 'Aus meines Herzens Grunde', 'J. S. Bach · BWV 269', 'build/importer-m5/musicxml/bwv269.mxl');
work('sor', 'Study in B minor', 'Fernando Sor · Op. 35 No. 22', 'issues/212/lilypond/sor.ly', {
  guitar: true,
});
work('bwv999', 'Prelude in D minor', 'J. S. Bach · BWV 999', 'issues/212/lilypond/bwv999.ly', {
  guitar: true,
});
work('maple', 'Maple Leaf Rag', 'Scott Joplin', 'issues/212/lilypond/maple.ly', { finalFragment: true });
work('haydn-i', 'Emperor Quartet · I', 'Joseph Haydn · Op. 76 No. 3', 'issues/210/fixtures/haydn.mxl', {
  selection: { firstMeasure: 1, lastMeasure: 128 },
});
work('haydn-ii', 'Emperor Quartet · II', 'Joseph Haydn · Op. 76 No. 3', 'issues/210/fixtures/haydn.mxl', {
  selection: { firstMeasure: 129, lastMeasure: 237 },
});

/** Music text and edition credits are displayed literally, including angle brackets in chords. */
function html(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function page(title, body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><link rel="stylesheet" href="gallery.css"><main>${body}</main></html>`;
}

await mkdir(out, { recursive: true });
// The server exposes this folder. Only the viewer bundles and fonts need a path outside it.
try {
  await symlink('../../../dist', join(out, 'dist'));
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  assert.equal(resolve(out, await readlink(join(out, 'dist'))), resolve('dist'));
}
for (const name of ['gallery.css', 'viewer.js'])
  await copyFile(new URL(name, import.meta.url), join(out, name));
const previews = process.argv.includes('--previews');
const cards = { recent: [], qualified: [] };
for (const { id, title, credit, file, options, source } of rows) {
  const original = await readFile(file);
  const lily = extname(file) === '.ly',
    format = lily ? 'LilyPond' : 'MusicXML';
  const settings = {
    mode: 'partial',
    targetProfile: 'expressive',
    capacity: 'large',
    filename: basename(file),
    ...options,
  };
  const result = lily
    ? importLilyPond(original.toString(), { ...settings, score: 'print' })
    : await importMXL(original, settings);
  assert.ok(result.documents.length, id + ': ' + result.diagnostics.at(-1)?.message);
  const text = result.documents[0].text,
    model = parseScore(text, { capacity: 'large' });
  const originalFile = id + extname(file);
  await writeFile(join(out, originalFile), original);
  await writeFile(join(out, id + '.vextab'), text);
  const summary = `${model.measureCount} written bars · ${model.parts.length} ${model.parts.length === 1 ? 'part' : 'parts'}`;
  const lossTypes = [...new Set(result.diagnostics.map((d) => d.message))];
  const notes = result.diagnostics.length
    ? `<details><summary>Import notes (${result.diagnostics.length} warnings)</summary><ul>${lossTypes.map((s) => '<li>' + html(s) + '</li>').join('')}</ul></details>`
    : '';
  const edition = source.url
    ? `<p class="meta"><a href="${html(source.url)}">Source edition</a> · ${html(source.credit)}</p>`
    : '';
  const body = `<a href="./">← All works</a><h1>${html(title)}</h1><p>${html(credit)} · ${format} · ${summary}</p>
  <nav><span id="player"></span><button id="edit">Edit VexTab</button><a href="${id}.vextab" download>Download VexTab</a><a href="${originalFile}" download>Download ${lily ? 'LilyPond' : 'MXL'}</a></nav>${edition}
  <div id="score" data-editor="true" data-show-errors="true" data-view="${model.parts.length > 1 ? 'conductor' : 'parts'}">${html(text)}</div>${notes}
  <script src="dist/main.prod.js"></script><script src="viewer.js"></script>`;
  await writeFile(join(out, id + '.html'), page(title, body));
  const image = previews ? `<img src="${id}.png" alt="">` : '';
  cards[source.recent ? 'recent' : 'qualified'].push(
    `<a class="card" href="${id}.html">${image}<span class="meta">${format} · ${summary}</span><h2>${html(title)}</h2>${html(credit)}</a>`,
  );
}

// Render real opening measures for the index; the source and download links also work without a browser build step.
if (previews) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch(
    process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' },
  );
  try {
    for (const { id } of rows) {
      const tab = await browser.newPage({ viewport: { width: 1170, height: 850 } });
      try {
        await tab.goto(pathToFileURL(join(out, id + '.html')).href);
        await tab.waitForSelector('html[data-ready="true"]', { state: 'attached' });
        const surface = await tab.locator('#score svg').first().boundingBox();
        const head = await tab.locator('#score .vf-notehead').first().boundingBox();
        await tab.screenshot({
          path: join(out, id + '.png'),
          clip: { x: surface.x + 5, y: Math.max(surface.y, head.y - 46), width: 570, height: 138 },
        });
      } finally {
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
}
const section = (title, items) =>
  `<section><h2>${title}</h2><div class="grid">${items.join('')}</div></section>`;
await writeFile(
  join(out, 'index.html'),
  page(
    'VexTab importer · Scores',
    '<h1>Imported scores</h1><p>Open a work to read, play or edit the score.</p>' +
      section('New repertoire', cards.recent) +
      section('Qualification scores', cards.qualified),
  ),
);
console.log(out);
