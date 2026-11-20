// Build the AI2026 illustrated engineering history from the actual baseline and endpoint bundles.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { siteTheme } from '../site-theme.mjs';
import { buildBundles, ensureReport, refreshArchive, output as reports } from '../reports/build.mjs';
import { launchBrowser } from '../reports/coverage.mjs';
import { root, base, git, revision, withSnapshot } from '../reports/snapshot.mjs';
import { declarations, apiChanges, history, repo } from './history.mjs';
import { comparisons, features, studies, topics } from './catalog.mjs';
import { renderReport } from './page.mjs';

const head = revision('HEAD'),
  before = revision(base);
const output = join(root, 'build/improvements');
const tool = join(root, 'tools/improvements');
const figures = [],
  inventory = [];

// Playwright runs this function in both snapshots. Legacy examples use the common public API.
function draw({ source, study }) {
  const { Artist, VexTab, Vex, parseScore, renderScore } = window.vextab;
  const host = document.querySelector('#score');
  host.replaceChildren();
  if (study) renderScore(host, parseScore(source, { language: 2 }), { width: 820 });
  else {
    const artist = new Artist(10, 10, 820);
    new VexTab(artist, { language: 1 }).parse(source);
    artist.render(new Vex.Flow.Renderer(host, Vex.Flow.Renderer.Backends.SVG));
  }
  if (!host.querySelector('svg')) throw Error('No score rendered');
}

/** Warm fonts, redraw, then capture the same white viewport at both revisions. */
async function capture(page, stage, spec) {
  await page.evaluate(draw, spec);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(draw, spec);
  const svg = page.locator('#score svg').first();
  const bounds = await svg.boundingBox();
  if (!bounds || bounds.height <= 0) throw Error('Empty score: ' + spec.id);
  const path = 'assets/' + spec.id + '-' + spec.hash.slice(0, 12) + '.png';
  const clip = {
    x: 0,
    y: 0,
    width: Math.min(840, Math.ceil(bounds.width + bounds.x)),
    height: Math.min(420, Math.ceil(bounds.height + bounds.y)),
  };
  const bytes = await page.screenshot({ path: join(stage, path), clip });
  inventory.push({ ...spec, path, clip, sha256: createHash('sha256').update(bytes).digest('hex') });
  return path;
}

/** Build once per endpoint, then render every example applicable to that release. */
async function endpoint(browser, stage, hash, current) {
  return withSnapshot(hash, async (checkout) => {
    buildBundles(checkout, 'production');
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
    try {
      await page.setContent('<style>body{margin:0;background:white}#score{width:820px}</style><div id="score"></div>');
      await page.addScriptTag({ path: join(checkout, 'dist/main.prod.js') });
      const examples = comparisons.map(([id, name, source]) => ({
        id,
        name,
        source,
        study: false,
        file: 'tests/baseline/music.mjs',
      }));
      if (current)
        for (const [id, name] of studies) {
          const file = 'guide/scores/' + id + '.vextab';
          examples.push({ id, name, file, source: await readFile(join(checkout, file), 'utf8'), study: true });
        }
      if (current) {
        const file = 'guide/features.html';
        const html = await readFile(join(checkout, file), 'utf8');
        const lessons = await page.evaluate(
          ({ html, features }) => {
            const guide = new DOMParser().parseFromString(html, 'text/html');
            return features.map((id) => {
              const section = guide.getElementById(id);
              return {
                id,
                name: section.querySelector('h2').textContent,
                source: section.querySelector('[data-score]').textContent,
              };
            });
          },
          { html, features },
        );
        for (const lesson of lessons) examples.push({ ...lesson, file, study: true });
      }
      for (const example of examples) {
        const path = await capture(page, stage, { ...example, hash });
        if (!current) continue;
        const first = inventory.find((item) => item.id === example.id && item.hash === before);
        figures.push({
          id: example.id,
          name: example.name,
          module: example.study ? 'Guide study' : 'Tab and notation',
          status: first ? 'Paired comparison' : 'Current study',
          left: first?.path,
          leftLabel: base,
          right: path,
          rightLabel: hash.slice(0, 12),
          source: repo + '/blob/' + head + '/' + example.file,
          description: example.study
            ? 'Opening of the study, rendered from its guide source.'
            : 'Identical input and renderer settings at both revisions.',
        });
      }
      return declarations(checkout);
    } finally {
      await page.close();
    }
  });
}

await mkdir(join(root, 'build'), { recursive: true });
const stage = await mkdtemp(join(root, 'build/improvements-stage-'));
try {
  await mkdir(join(stage, 'assets'));
  const browser = await launchBrowser();
  let data;
  try {
    const oldAPI = await endpoint(browser, stage, before, false);
    const currentAPI = await endpoint(browser, stage, head, true);
    const quality = [];
    for (const hash of [before, head]) {
      const r = await ensureReport(hash);
      quality.push({
        hash,
        tests: r.coverage.tests.passed,
        lines: r.coverage.total.lines,
        gzip: r.bundles.find((bundle) => bundle.name === 'main.prod.js').gzip,
      });
    }
    await refreshArchive(reports);
    data = {
      quality,
      schema: 1,
      base,
      before,
      head,
      date: git(root, 'show', '-s', '--format=%cs', head),
      version: browser.version(),
      ...history(head),
      api: apiChanges(oldAPI, currentAPI),
      figures,
      topics,
    };
  } finally {
    await browser.close();
  }
  await writeFile(join(stage, 'assets/report.css'), siteTheme + (await readFile(join(tool, 'report.css'), 'utf8')));
  await copyFile(join(tool, 'app.js'), join(stage, 'assets/app.js'));
  await writeFile(join(stage, 'changes.json'), JSON.stringify(data, null, 2));
  await writeFile(join(stage, 'render-inventory.json'), JSON.stringify(inventory, null, 2));
  await writeFile(join(stage, 'index.html'), renderReport(data));
  // Keep reviewed reports intact if a build fails, and install HTML after its assets.
  await mkdir(join(output, 'assets'), { recursive: true });
  for (const file of [
    ...inventory.map((item) => item.path),
    'assets/report.css',
    'assets/app.js',
    'render-inventory.json',
    'changes.json',
    'index.html',
  ])
    await rename(join(stage, file), join(output, file));
  console.log(join(output, 'index.html'));
} finally {
  await rm(stage, { recursive: true, force: true });
}
