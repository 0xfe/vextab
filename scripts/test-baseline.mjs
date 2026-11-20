// Compare the 4.0.6 release and a candidate production build on the same Chrome installation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { arch, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import manifest from '../package.json' with { type: 'json' };
import { cases, measureScore, timeScores } from '../tests/baseline/music.mjs';
import { runExamples } from '../tests/baseline/examples.mjs';

// The immutable original is verified even when supplied from an offline cache.
const archive = 'vextab-4.0.6.tgz';
const releaseURL = 'https://github.com/0xfe/vextab/releases/download/4.0.6/' + archive;
const digest = '1887533456cd748c4abd4bd4a1e9ff23a003f25e8f8ef34ac9175b0bd96ff6cd';
const output = await mkdtemp(join(tmpdir(), 'vextab-baseline-'));
console.log('Baseline results directory:', output);

/** Extract the exact release into the results directory, alongside the original tarball. */
async function loadRelease() {
  const file = join(output, archive);
  if (process.env.VEXTAB_BASELINE_TGZ) {
    await writeFile(file, await readFile(process.env.VEXTAB_BASELINE_TGZ));
  } else {
    const response = await fetch(releaseURL);
    if (!response.ok) throw new Error('Baseline download failed: HTTP ' + response.status);
    await writeFile(file, new Uint8Array(await response.arrayBuffer()));
  }
  assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), digest, archive);
  execFileSync('tar', ['-xzf', file, '-C', output]);
  return join(output, 'package/dist');
}

/** Distinguish verified music, exact known failures and reports needing visual review. */
function classify(fixture, actual, label) {
  const expectDefect = fixture.released !== undefined && (label === 'release' || !fixture.fixed);
  const expected = expectDefect ? fixture.released : fixture.wanted;
  assert.deepEqual(actual, expected, label + ' ' + fixture.id + ': ' + fixture.expectation);
  return expectDefect ? 'reproduced defect' : 'working';
}

/** Run the same music and compatibility surfaces against each packaged library. */
async function examine(browser, dist, label, expectedFlow) {
  const examples = await runExamples(browser, dist, label === 'candidate');
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    await page.setContent('<style>body,#score{background:white}#score{width:fit-content}</style><div id="score"></div>');
    const bundle = join(dist, 'main.prod.js');
    await page.addScriptTag({ path: bundle });
    assert.equal(await page.evaluate(() => window.vextab.Vex.Flow.BUILD.VERSION), expectedFlow);
    // Prime the same music glyphs before measuring positions, taking pictures or timing.
    await page.evaluate(measureScore, cases.find(fixture => fixture.id === 'g-natural'));
    await page.evaluate(() => document.fonts.ready);
    const music = [];
    for (const fixture of cases) {
      const actual = await page.evaluate(measureScore, fixture).catch(cause => {
        throw new Error(label + ' ' + fixture.id + ': ' + fixture.expectation, { cause });
      });
      const status = classify(fixture, actual, label);
      music.push({ ...fixture, actual, status });
      console.log(label, fixture.id, status, JSON.stringify(actual));
      if (fixture.picture) {
        await page.locator('#score').screenshot({ path: join(output, label + '-' + fixture.id + '.png') });
      }
    }
    const medianMs = await page.evaluate(timeScores);
    return { vexflow: expectedFlow, bytes: (await stat(bundle)).size, medianMs, examples, music };
  } finally {
    await page.close();
  }
}

const releaseDist = await loadRelease();
const candidateDist = resolve(process.argv[2] ?? 'dist');
const browser = await chromium.launch(process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const release = await examine(browser, releaseDist, 'release', '5.3.0');
  const candidate = await examine(browser, candidateDist, 'candidate', manifest.dependencies.vexflow);
  const observable = ({ id, expectation, backend, hasInk, error }) => ({ id, expectation, backend, hasInk, error });
  assert.deepEqual(candidate.examples.filter(e => e.id !== 'doc/tutorial.html example 9b').map(observable), release.examples.map(observable), 'Example surfaces or smoke results changed');
  const environment = { platform: platform(), arch: arch(), node: process.version, chrome: browser.version() };
  const report = { environment, releaseURL, digest, release, candidate };
  await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(environment, 'Examples per build:', release.examples.length);
  for (const sample of [release, candidate]) {
    console.log('VexFlow', sample.vexflow, 'main bytes', sample.bytes, 'median ms by system count', sample.medianMs);
  }
} finally {
  await browser.close();
}
