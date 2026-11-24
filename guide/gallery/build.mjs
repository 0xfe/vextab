// Build the guide's editable gallery from checksum-pinned editions and the public VexTab format readers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const out = resolve('build/import-guide/gallery');
const downloads = resolve('build/import-guide/sources');

/** Reuse only verified bytes. A partial download is never visible to another guide build. */
async function archive(filename, url, digest) {
  await mkdir(downloads, { recursive: true });
  const file = join(downloads, filename);
  const matches = bytes => createHash('sha256').update(bytes).digest('hex') === digest;
  if (existsSync(file) && matches(await readFile(file))) return file;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Could not fetch ' + url + ' (' + response.status + ')');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(matches(bytes), 'Checksum mismatch for ' + filename);
  const temporary = file + '.' + randomUUID();
  await writeFile(temporary, bytes);
  await rename(temporary, file);
  return file;
}

/** Collect the source editions and the selection required to open each complete movement. */
async function repertoire() {
  const rows = [];
  function work(id, title, credit, file, options = {}, source = {}) {
    rows.push({ id, title, credit, file, options, source });
  }

  const manifest = JSON.parse(await readFile('issues/212/complex-musicxml/sources.json'));
  for (const [id, file, title, credit] of [
    ['beethoven-v', 'Beethoven_Op.67_1.mxl', 'Symphony No. 5 · I', 'Ludwig van Beethoven · Op. 67'],
    ['brandenburg-i', 'Bach_BWV.1048_1.mxl', 'Brandenburg Concerto No. 3 · I', 'J. S. Bach'],
    ['brandenburg-iii', 'Bach_BWV.1048_3.mxl', 'Brandenburg Concerto No. 3 · III', 'J. S. Bach'],
    ['gretchen', 'lc7111114.mxl', 'Gretchen am Spinnrade', 'Franz Schubert · Voice and piano'],
    ['erlkonig', 'lc29062370.mxl', 'Erlkönig', 'Franz Schubert · Clarinet and piano edition'],
  ]) {
    const edition = manifest.find((item) => item.file === file);
    work(id, title, credit, await archive(file, edition.url, edition.archiveSHA256), {}, { recent: true, url: edition.url, credit: edition.credits, license: edition.licenseSource });
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
  work('echigo', 'Echigo-Jishi', 'Japanese song', 'issues/212/musicxml/Echigo-Jishi.mxl', {}, { url: 'https://wpmedia.musicxml.com/wp-content/uploads/2017/12/Echigo-Jishi.pdf', credit: 'Tom Potter · Public domain' });
  const bachURL = 'https://raw.githubusercontent.com/cuthbertLab/music21/40e95ae567fe8b8e35317447dc74d5cdbb2fb83d/music21/corpus/bach/bwv269.mxl';
  work('bwv269', 'Aus meines Herzens Grunde', 'J. S. Bach · BWV 269', await archive('bwv269.mxl', bachURL, '9676f11a2b26488bcf30db90c15576caa1ea2a616b909e376d44b8b804e9d138'), {}, { url: bachURL, credit: 'music21 Bach corpus' });
  const haydnEdition = { url: 'https://github.com/OpenScore/StringQuartets/tree/2614b0b2958dd1ce3f52e172a43e5f4d0e29570f/scores/Haydn%2C_Joseph/String_Quartet_in_C_major%2C_Hob.III77%2C_Op.76_No.3', credit: 'OpenScore String Quartets · CC0' };
  work('sor', 'Study in B minor', 'Fernando Sor · Op. 35 No. 22', 'issues/212/lilypond/sor.ly', {
    guitar: true,
  }, { url: 'https://www.mutopiaproject.org/ftp/SorF/O35/sorf_op35_no22/sorf_op35_no22.ly', credit: 'Glen Larsen · Original and VexTab adaptation licensed under CC BY-SA 3.0', license: 'https://creativecommons.org/licenses/by-sa/3.0/' });
  work('bwv999', 'Prelude in D minor', 'J. S. Bach · BWV 999', 'issues/212/lilypond/bwv999.ly', {
    guitar: true,
  }, { url: 'https://github.com/MutopiaProject/MutopiaProject/blob/2144afd6f52d56c5b6995b8b589ef1268b3139f0/ftp/BachJS/BWV999/Bach_Prelude_BWV999/Bach_Prelude_BWV999.ly', credit: 'Jakob Bagterp · Public domain' });
  work('maple', 'Maple Leaf Rag', 'Scott Joplin', 'issues/212/lilypond/maple.ly', { finalFragment: true }, { url: 'https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.ly', credit: 'Chris Sawer · Public domain' });
  work('haydn-i', 'Emperor Quartet · I', 'Joseph Haydn · Op. 76 No. 3', 'issues/210/fixtures/haydn.mxl', {
    selection: { firstMeasure: 1, lastMeasure: 128 },
  }, haydnEdition);
  work('haydn-ii', 'Emperor Quartet · II', 'Joseph Haydn · Op. 76 No. 3', 'issues/210/fixtures/haydn.mxl', {
    selection: { firstMeasure: 129, lastMeasure: 237 },
  }, haydnEdition);
  return rows;
}

/** Music text and edition credits are displayed literally, including angle brackets in chords. */
function html(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><link rel="stylesheet" href="gallery.css"></head><body><main><a href="../index.html#importing">VexTab guide · Importing</a><br>${body}</main></body></html>`;
}

/** Convert each score and stage the downloads and page templates for the guide build. */
export async function prepareGallery() {
  // The gallery exercises the exact modules shipped to npm users.
  execFileSync(process.execPath, ['scripts/build-runtime.mjs'], { stdio: 'inherit' });
  const { importLilyPond } = await import('../../dist/runtime/import/lilypond.mjs');
  const { importMXL } = await import('../../dist/runtime/import/mxl.mjs');
  const rows = await repertoire();
  await mkdir(out, { recursive: true });
  for (const name of ['gallery.css', 'viewer.js'])
    await copyFile(new URL(name, import.meta.url), join(out, name));

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
    const { text, staves } = result.documents[0];
    const parts = new Set(staves.map(staff => staff.target.split('/')[0])).size;
    const bars = staves[0].measures.length;
    const originalFile = id + extname(file);
    await writeFile(join(out, originalFile), original);
    await writeFile(join(out, id + '.vextab'), text);
    const summary = `${bars} written bars · ${parts} ${parts === 1 ? 'part' : 'parts'}`;
    const lossTypes = [...new Set(result.diagnostics.map((d) => d.message))];
    const notes = result.diagnostics.length
      ? `<details><summary>Import notes (${result.diagnostics.length} warnings)</summary><ul>${lossTypes.map((s) => '<li>' + html(s) + '</li>').join('')}</ul></details>`
      : '';
    const edition = source.url
      ? `<p class="meta"><a href="${html(source.url)}">Source edition</a> · ${html(source.credit)}${source.license ? ' · <a href="' + html(source.license) + '">License</a>' : ''}</p>`
      : '';
    const partPicker = parts > 1 ? '<label>View <select id="instrument"><option value="conductor">Full score</option></select></label>' : '';
    const body = `<a href="index.html">← All works</a><h1>${html(title)}</h1><p>${html(credit)} · ${format} · ${summary}</p>
    <nav>${partPicker}<span id="player"></span><button id="edit">Edit VexTab</button><a href="${id}.vextab" download>Download VexTab</a><a href="${originalFile}" download>Download ${lily ? 'LilyPond' : 'MXL'}</a></nav>${edition}
    <div id="score" data-editor="true" data-show-errors="true" data-opening-part="${id === 'beethoven-v' ? 'Oboe 1' : ''}">${html(text)}</div>${notes}
    <script defer src="viewer.js"></script>`;
    await writeFile(join(out, id + '.html'), page(title, body));
    await copyFile(new URL('previews/' + id + '.png', import.meta.url), join(out, id + '.png'));
    const image = `<img src="${id}.png" alt="">`;
    cards[source.recent ? 'recent' : 'qualified'].push(
      `<a class="card" href="${id}.html">${image}<span class="meta">${format} · ${summary}</span><h2>${html(title)}</h2>${html(credit)}</a>`,
    );
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
  return { out, pages: ['index', ...rows.map(row => row.id)] };
}
