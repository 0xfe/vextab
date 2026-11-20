// Verify the offline report, both endpoint measurements, gallery images and searchable inventories.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../reports/coverage.mjs';
import { base, git, revision, root } from '../reports/snapshot.mjs';
import { savedReport } from '../reports/build.mjs';

const directory = join(root, 'build/improvements');
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
  assert.deepEqual(errors, []);
  console.log('Verified both report pages, archive search, JSON download and ' + images.length + ' score images.');
} finally {
  await browser.close();
}
