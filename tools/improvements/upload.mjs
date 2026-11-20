// Publish the reviewed illustrated report under its permanent website URL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { upload } from '../static-site-upload.mjs';

const jsonFiles = ['changes.json', 'render-inventory.json'];
const destination = 'gs://vexflow.com/vextab/reports/ai2026/';
const publicURL = 'https://vexflow.com/vextab/reports/ai2026/';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Include only the report's own resources and the score images named by its inventory. */
function reportAssets(figures) {
  const paths = new Set(['assets/report.css', 'assets/app.js']);
  for (const figure of figures) {
    for (const path of figure.left ? [figure.left, figure.right] : [figure.right]) {
      if (typeof path !== 'string' || !/^assets\/[\w-]+\.png$/.test(path))
        throw new Error(`Invalid image path: ${path}`);
      paths.add(path);
    }
  }
  return [...paths].sort();
}

/** Rewrite the static links and interactive gallery using the exact HTML that was reviewed. */
function publishHTML(html, relocate, figures) {
  const dataScript = /(<script type="application\/json" id="report-data">)([^<]*)(<\/script>)/;
  if (!dataScript.test(html)) throw new Error('Missing embedded report data.');
  return html
    .replaceAll('href="../reports/', 'href="../')
    .replace(
      /\b(src|href)="((?:\.\/)?assets\/[^"]+)"/g,
      (_, attr, path) => `${attr}="${relocate(path.replace(/^\.\//, ''))}"`
    )
    .replace(dataScript, (_, start, json, end) => {
      const data = JSON.parse(json);
      // Catch a partially copied report before exposing mismatched exhibits and downloads.
      if (JSON.stringify(data.figures) !== JSON.stringify(figures)) throw new Error('HTML and JSON exhibits differ.');
      data.figures = publishedFigures(figures, relocate);
      return start + JSON.stringify(data).replaceAll('<', '\\u003c') + end;
    });
}

/** Preserve exhibit metadata while pointing both sides of each comparison at the frozen assets. */
function publishedFigures(figures, relocate) {
  return figures.map((figure) => ({
    ...figure,
    ...(figure.left ? { left: relocate(figure.left) } : {}),
    right: relocate(figure.right),
  }));
}

/** Freeze the asset set and build the checksum manifest consumed by the shared website publisher. */
export async function stageReport(source, staging) {
  const data = JSON.parse(await readFile(join(source, 'changes.json'), 'utf8'));
  const page = await readFile(join(source, 'index.html'), 'utf8');
  const assets = new Map();
  for (const path of reportAssets(data.figures)) assets.set(path, await readFile(join(source, path)));
  const hashes = [...assets].map(([path, bytes]) => [path, digest(bytes)]);
  const assetPath = 'assets/' + digest(JSON.stringify(hashes)).slice(0, 16);
  const relocate = (path) => {
    if (!assets.has(path)) throw new Error(`Unknown report asset: ${path}`);
    return './' + assetPath + '/' + basename(path);
  };
  await mkdir(join(staging, assetPath), { recursive: true });
  const files = {};
  for (const [path, hash] of hashes) {
    const target = assetPath + '/' + basename(path);
    await writeFile(join(staging, target), assets.get(path));
    files[target] = hash;
  }

  const html = publishHTML(page, relocate, data.figures);
  data.figures = publishedFigures(data.figures, relocate);
  const captures = JSON.parse(await readFile(join(source, 'render-inventory.json'), 'utf8'));
  for (const capture of captures) {
    if (digest(assets.get(capture.path)) !== capture.sha256) throw Error('Invalid capture: ' + capture.path);
    capture.path = relocate(capture.path);
  }
  const inventory = JSON.stringify(captures, null, 2);
  for (const [path, bytes] of [
    ['index.html', html],
    ['changes.json', JSON.stringify(data, null, 2)],
    ['render-inventory.json', inventory],
  ]) {
    await writeFile(join(staging, path), bytes);
    files[path] = digest(bytes);
  }
  await writeFile(join(staging, 'manifest.json'), JSON.stringify({ assetPath, files }));
}

/** Stage in isolation so a dry run or failed upload never modifies the offline bundle. */
export async function publishReport(source, { dryRun = false, command = 'gcloud' } = {}) {
  const staging = await mkdtemp(join(tmpdir(), 'vextab-improvements-'));
  try {
    await stageReport(source, staging);
    await upload({ directory: staging, destination, publicURL, jsonFiles, dryRun, command });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Reuse an existing review build, or generate and browser-check a fresh report on demand. */
async function main(args) {
  if (args.some((arg) => !['--dry-run', '--rebuild'].includes(arg)))
    throw new Error('Usage: npm run improvements:upload -- [--dry-run] [--rebuild]');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const source = join(root, 'build/improvements');
  if (args.includes('--rebuild') || !existsSync(join(source, 'index.html'))) {
    for (const script of ['build', 'verify']) {
      execFileSync(process.execPath, [`tools/improvements/${script}.mjs`], { cwd: root, stdio: 'inherit' });
    }
  }
  await publishReport(source, { dryRun: args.includes('--dry-run') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
