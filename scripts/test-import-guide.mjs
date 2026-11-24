// Check the complete hosted guide under a URL prefix, or exercise a running npm start server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import manifest from '../package.json' with { type: 'json' };
import { testGuideImporting } from './test-guide-importing.mjs';

const directory = 'build/guide';
const prefix = '/vextab/guide/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const external = process.argv.find(argument => /^https?:\/\//.test(argument));
const previews = process.argv.includes('--previews');

/** Serve only listed build files, at the same depth as the public guide. */
async function serveBuild() {
  const paths = new Set(await readdir(directory, { recursive: true }));
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const name = pathname.slice(prefix.length);
    if (!pathname.startsWith(prefix) || !paths.has(name) || !extname(name)) {
      response.writeHead(404).end();
      return;
    }
    try {
      response.setHeader('Content-Type', types[extname(name)] || 'application/octet-stream');
      response.end(await readFile(join(directory, name)));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((accept, reject) => server.once('error', reject).listen(0, '127.0.0.1', accept));
  return server;
}

const server = external ? undefined : await serveBuild();
const base = external || 'http://127.0.0.1:' + server.address().port + prefix;
let browser;
try {
  browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1170, height: 850 } });
  // Before publication, serve the candidate bytes at the exact CDN URLs emitted by the site.
  if (!external) {
    const runtime = 'https://cdn.jsdelivr.net/npm/vextab@' + manifest.version + '/dist/runtime/';
    const files = new Set(await readdir('dist/runtime', { recursive: true }));
    await page.route(runtime + '**', route => {
      const file = route.request().url().slice(runtime.length);
      if (!files.has(file)) return route.abort();
      return route.fulfill({ path: join('dist/runtime', file), contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.route('https://cdn.jsdelivr.net/npm/vexflow@' + manifest.dependencies.vexflow + '/build/cjs/vexflow.js',
      route => route.fulfill({ path: 'node_modules/vexflow/build/cjs/vexflow.js', contentType: 'text/javascript' }));
  }
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Both standalone lessons run their own inline integrations against the public script API.
  for (const lesson of ['triplets', 'shared-score']) {
    await page.goto(new URL(lesson + '.html', base).href);
    await page.locator('#score svg .vf-stavenote').first().waitFor();
  }
  await testGuideImporting(page, new URL('index.html', base).href, true);
  const gallery = new URL('gallery/index.html', base);
  await page.goto(gallery.href);
  const works = await page.locator('a.card').evaluateAll(cards => cards.map(card => card.href));
  assert.equal(new Set(works).size, 13);
  assert.equal(await page.locator('img').evaluateAll(images => images.filter(image => image.naturalWidth > 0).length), works.length);
  for (const work of works) {
    const id = new URL(work).pathname.split('/').at(-1).replace('.html', '');
    const converted = await page.request.get(new URL(id + '.vextab', gallery).href);
    assert.ok(converted.ok(), id);
    assert.ok((await page.request.get(work)).ok(), id);
    if (!previews && !['beethoven-v', 'bwv846', 'echigo', 'haydn-ii'].includes(id)) continue;
    await page.goto(work);
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 90000 });
    assert.ok(await page.locator('#score textarea').inputValue() === await converted.text(), id + ' editor must preserve the complete download');
    const original = await page.getByRole('link', {name: /Download (LilyPond|MXL)/}).getAttribute('href');
    const response = await page.request.get(new URL(original, gallery).href);
    assert.ok(response.ok() && (await response.body()).length > 100, original);
    assert.ok(await page.locator('#score .vf-notehead').count() > 0);
    if (previews) {
      const surface = await page.locator('#score svg').first().boundingBox();
      const head = await page.locator('#score .vf-notehead').first().boundingBox();
      await page.screenshot({ path: 'guide/gallery/previews/' + id + '.png',
        clip: { x: surface.x + 5, y: Math.max(surface.y, head.y - 46), width: 570, height: 138 } });
    }
    if (id === 'beethoven-v') {
      const instruments = page.locator('#instrument');
      assert.equal(await instruments.locator('option:checked').innerText(), 'Oboe 1');
      assert.equal(await instruments.locator('option').count(), 19);
      await instruments.selectOption('0');
      assert.ok(await page.locator('#score .vf-notehead').count() > 0);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Verified the live importer lessons, 13 gallery editions and both source formats at ' + base);
} finally {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
}
