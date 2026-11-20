// Exercise the revision's QUnit tests with instrumented library code and local browser assets.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import coverage from 'istanbul-lib-coverage';
import { createRequire } from 'node:module';

export const launchBrowser = () =>
  chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });

export async function browserCoverage(checkout, files) {
  const directory = join(checkout, 'coverage-build');
  const map = coverage.createCoverageMap({});
  for (const file of files.filter((f) => f.startsWith('src/') && f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
    map.addFileCoverage(JSON.parse(await readFile(join(directory, 'counters', file + '.json'))));
  }
  const source = await readFile(join(checkout, 'tests/tests.html'), 'utf8');
  const classic = source.includes('qunit-2.9.2.js');
  const qunit = classic
    ? createRequire(import.meta.url).resolve('qunit-classic')
    : createRequire(join(checkout, 'package.json')).resolve('qunit');
  const file = join(directory, 'report-tests.html');
  // Retain the original body fixtures, with the corresponding QUnit runner provided locally.
  const body = source.slice(source.indexOf('<body>')).replace('</body>', '<script src="tests.dev.js"></script></body>');
  await writeFile(
    file,
    '<!doctype html><meta charset="utf-8"><script src="qunit.js"></script>' +
      '<script>QUnit.on("runEnd", r => window.reportCounts = r.testCounts)</script>' +
      body,
  );
  await writeFile(join(directory, 'qunit.js'), await readFile(qunit));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.reportCounts, undefined, { timeout: 120000 });
    const { tests, hits } = await page.evaluate(() => ({ tests: window.reportCounts, hits: window.__coverage__ }));
    if (!tests.passed || tests.failed)
      throw Error('QUnit: ' + (await page.locator('#qunit-tests > .fail').allTextContents()));
    if (!hits || !Object.keys(hits).length) throw Error('QUnit ran without library coverage instrumentation.');
    map.merge(hits);
    const counts = (summary) =>
      Object.fromEntries(
        ['lines', 'statements', 'branches', 'functions'].map((key) => [
          key,
          { hit: summary[key].covered, total: summary[key].total },
        ]),
      );
    const rows = map
      .files()
      .sort()
      .map((file) => ({ file, ...counts(map.fileCoverageFor(file).toSummary()) }));
    return { tests, files: rows, total: counts(map.getCoverageSummary()) };
  } finally {
    await browser.close();
  }
}
