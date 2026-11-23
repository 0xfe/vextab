// Verify the offline report, both endpoint measurements, gallery images and searchable inventories.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../reports/coverage.mjs';
import { base, git, revision, root } from '../reports/snapshot.mjs';
import { savedReport } from '../reports/build.mjs';

const directory = join(root, 'build/whatsnew');
const data = JSON.parse(await readFile(join(directory, 'changes.json'), 'utf8'));
const inventory = JSON.parse(await readFile(join(directory, 'render-inventory.json'), 'utf8'));
assert.equal(data.before, revision(base));
assert.equal(data.commits.length, Number(git(root, 'rev-list', '--count', base + '..' + data.head)));
assert.deepEqual(
  data.quality.map((q) => q.hash),
  [data.before, data.head],
);
for (const sample of data.quality) {
  const report = await savedReport(sample.hash);
  assert.deepEqual(sample.lines, report.coverage.total.lines);
  assert.equal(sample.tests, report.coverage.tests.passed);
  assert.equal(report.coverage.tests.failed, 0);
}
const images = data.figures.flatMap((f) => [f.left, f.right].filter(Boolean));
assert.deepEqual(images.sort(), inventory.map((c) => c.path).sort());
for (const capture of inventory) {
  const bytes = await readFile(join(directory, capture.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256);
}
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ offline: true });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(pathToFileURL(join(directory, 'index.html')).href);
  assert.equal(await page.title(), "VexTab · What's New?");
  assert.equal(await page.locator('h1').innerText(), "What's New?");
  const releaseLinks = page.getByRole('navigation', { name: 'Jump to release' }).getByRole('link');
  assert.deepEqual(await releaseLinks.locator('strong').allTextContents(), data.editions.map((edition) => edition.tag));
  assert.equal(data.editions.reduce((n, edition) => n + edition.count, 0), data.commits.length);
  for (const edition of data.editions) {
    const chapter = page.locator(await releaseLinks.filter({ hasText: edition.tag }).getAttribute('href'));
    assert.ok(await chapter.locator('.change').count(), 'Empty release chapter: ' + edition.tag);
    if (!edition.hash) continue; // The npm-only patch has no commits on the main ancestry path.
    const reachable = new Set(git(root, 'rev-list', data.base + '..' + edition.hash).split('\n'));
    for (const change of edition.highlights) assert.ok(reachable.has(change.hash), change.title);
  }
  await page.locator('#search').fill('6.2.0 chord');
  assert.match(await page.locator('.edition:visible').innerText(), /Chord-melody guitar/);
  await releaseLinks.filter({ hasText: '6.1.0' }).click();
  assert.ok(page.url().endsWith('#release-6-1-0'));
  await page.locator('#release-6-1-0 [data-commits]').click();
  assert.equal(await page.locator('#commit-release').inputValue(), '6.1.0');
  const summaries = await page.locator('#commit-list summary').allTextContents();
  assert.equal(summaries.length, Math.min(24, data.editions.find((e) => e.tag === '6.1.0').count));
  assert.ok(summaries.every((s) => s.includes('6.1.0')));
  await page.locator('#commit-release').selectOption('');
  await page.locator('#release-6-2-0 [data-plate="chopin-ballade-no3"]').click();
  assert.equal(await page.locator('dialog[open] h2').innerText(), 'Ballade No. 3');
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'hidden' });
  await page.locator('#search').fill('guitar');
  assert.ok(await page.locator('.change:visible').count());
  await page.locator('#api-query').fill('parseScore');
  assert.match(await page.locator('#api-list').innerText(), /parseScore/);
  await page.locator('#commit-query').fill(data.commits[0].hash);
  assert.equal(await page.locator('#commit-list details').count(), 1);
  const paired = data.figures.find((f) => f.left);
  await page.locator('#figure-query').fill(paired.name);
  await page.locator('#figures .tile').first().click();
  assert.equal(await page.locator('dialog[open] #plates img').count(), 2);
  await page.locator('dialog img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('#search').fill('');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile report overflows');
  await page.locator('#quality-metrics a').last().click();
  assert.equal(await page.locator('#coverage').count(), 1);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'vextab-' + data.head + '.json');
  await page.getByRole('link', { name: 'Report archive' }).click();
  await page.locator('input[type=search]').fill(data.head.slice(0, 12));
  assert.equal(await page.locator('tbody tr:visible').count(), 1);
  // Serve the old bookmark and its new destination locally to exercise the real browser navigation.
  const site = 'https://vexflow.com/vextab/reports/';
  const oldURL = site + 'ai2026/';
  const newURL = site + 'whatsnew/';
  const bookmark = '?q=chords#figures';
  const redirect = await readFile(new URL('./redirect.html', import.meta.url), 'utf8');
  await page.route(oldURL + '**', (route) => route.fulfill({ contentType: 'text/html', body: redirect }));
  await page.route(newURL + '**', (route) => route.fulfill({ contentType: 'text/html', body: '<main></main>' }));
  await page.goto(oldURL + bookmark, { waitUntil: 'commit' });
  await page.waitForURL(newURL + bookmark);
  const fallback = await browser.newPage({ javaScriptEnabled: false, offline: true });
  await fallback.route(oldURL, (route) => route.fulfill({ contentType: 'text/html', body: redirect }));
  await fallback.goto(oldURL);
  assert.equal(await fallback.locator('link[rel=canonical]').getAttribute('href'), newURL);
  const link = fallback.getByRole('link', { name: "What's New?" });
  assert.equal(await link.evaluate((anchor) => anchor.href), newURL);
  assert.deepEqual(errors, []);
  console.log('Verified both report pages, archive search, JSON download and ' + images.length + ' score images.');
} finally {
  await browser.close();
}
