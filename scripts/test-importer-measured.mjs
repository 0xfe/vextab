// Exercise the installed subpath exports on equivalent two-bar scores in real browser workers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseScore } from 'vextab/parse';

/** Make a compressed container with the standard library, independently of the importer. */
function archive(xml) {
  const program = [
    'import io, sys, zipfile',
    'out = io.BytesIO()',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    z.writestr("META-INF/container.xml", \'<container><rootfiles><rootfile full-path="Music/score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>\')',
    '    z.writestr("Music/score.xml", sys.stdin.buffer.read())',
    'sys.stdout.buffer.write(out.getvalue())',
  ].join('\n');
  return new Uint8Array(execFileSync('python3', ['-c', program], {input: xml}));
}

/** Independent expectations include written bar, onset, rational duration and each chord head. */
function verify(result) {
  assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
  const { text } = result.documents[0];
  const events = parseScore(text).parts[0].staves[0].voices[0].events;
  assert.deepEqual(events.map(e => [e.bar, e.at, e.duration, e.heads.map(h => h.pitch)]), [
    [1, '0/1', '1/4', ['C4','E4','G4']], [1, '1/4', '1/8', ['D4']], [1, '3/8', '1/8', ['E4']],
    [2, '0/1', '1/12', ['F4']], [2, '1/12', '1/12', ['E4']], [2, '1/6', '1/12', ['D4']], [2, '1/4', '1/4', ['C4']],
  ]);
  return text;
}

/** The page only serves installed modules, and each worker imports exactly one public entry. */
export async function checkMeasuredConsumers(browser, use, output) {
  const xml = await readFile('importer/test/measured.musicxml', 'utf8');
  const ly = await readFile('importer/test/measured.ly', 'utf8');
  const cases = [
    ['musicxml', 'importMusicXML', xml, 'MusicXML'],
    ['mxl', 'importMXL', archive(xml), 'Compressed MusicXML'],
    ['lilypond', 'importLilyPond', ly, 'LilyPond'],
  ];
  const page = await browser.newPage({viewport: {width: 780, height: 720}});
  try {
    await page.context().route('**/*', route => {
      const path = new URL(route.request().url()).pathname;
      if (/^\/shared\/[A-Z0-9]+\.mjs$/.test(path)) return route.fulfill({
        contentType: 'text/javascript', path: join(use.resolve('vextab/import/mxl'), '../..', path.slice(1)),
      });
      if (path === '/') return route.fulfill({contentType: 'text/html', body:
        '<style>body{background:white;color:#222;font:16px system-ui;margin:20px}h2{font-size:17px}</style><main></main>'});
      for (const [id, fn] of cases) {
        if (path === '/' + id + '.js') return route.fulfill({contentType: 'text/javascript', path: use.resolve('vextab/import/' + id)});
        if (path === '/' + id + '-worker.js') return route.fulfill({contentType: 'text/javascript', body:
          'import {' + fn + '} from "./' + id + '.js"; onmessage = async e => postMessage(await ' + fn + '(e.data));'});
      }
      return route.abort();
    });
    await page.goto('http://consumer.test/');
    await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
    await page.addScriptTag({path: resolve('dist/main.dev.js')});
    for (const [id, fn, source, title] of cases) {
      const expected = verify(await use('vextab/import/' + id)[fn](source));
      const result = await page.evaluate(({id, source}) => new Promise((done, fail) => {
        const worker = new Worker('/' + id + '-worker.js', {type: 'module'});
        worker.onerror = e => { worker.terminate(); fail(Error(e.message)); };
        worker.onmessage = e => { worker.terminate(); done(e.data); };
        worker.postMessage(typeof source === 'string' ? source : Uint8Array.from(source));
      }), {id, source: typeof source === 'string' ? source : Array.from(source)});
      assert.equal(verify(result), expected);
      await page.evaluate(({title, expected}) => {
        const main = document.querySelector('main');
        main.appendChild(document.createElement('h2')).textContent = title;
        const host = main.appendChild(document.createElement('div'));
        host.textContent = expected;
        const editor = new window.vextab.Div(host);
        if (editor.getScore().measures.length !== 2) throw Error('Expected two engraved measures');
      }, {title, expected});
    }
    await page.locator('main').screenshot({path: join(output, 'measured-imports.png')});
  } finally { await page.close(); }
}
