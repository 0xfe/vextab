// Measure a committed snapshot in a temporary checkout so old build products cannot affect the report.
import { execFileSync } from 'node:child_process';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { browserCoverage } from './coverage.mjs';
import { bundleSizes, dependencies, sourceMetrics } from './metrics.mjs';
import { archivePage, commitPage, readEntries } from './html.mjs';

import { root, base, git, revision, withSnapshot, releases } from './snapshot.mjs';

export const output = join(root, 'build/reports');
/** Write beside the destination so readers always see one complete version. */
async function save(path, html) {
  await mkdir(dirname(path), { recursive: true });
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, html);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

/** Read saved commit headers and include reports produced by overlapping local runs. */
export async function refreshArchive(directory) {
  async function completeCommits() {
    const ids = [];
    for (const name of await readdir(directory)) {
      if (!/^[0-9a-f]{40}$/.test(name)) continue;
      try {
        await access(join(directory, name, 'index.html'));
        ids.push(name);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    return ids.sort();
  }
  for (;;) {
    const ids = await completeCommits();
    const entries = [];
    for (const id of ids) entries.push(...readEntries(await readFile(join(directory, id, 'index.html'), 'utf8')));
    await save(join(directory, 'index.html'), archivePage(entries));
    if (ids.join() === (await completeCommits()).join()) return;
  }
}

// Both entry bundles and the test suite use the webpack version locked by the measured revision.
export function buildBundles(checkout, mode) {
  execFileSync(process.execPath, [join(root, 'tools/reports/webpack.cjs'), mode], { cwd: checkout, stdio: 'inherit' });
}

/** Load a completed measurement and check its identity before reusing it. */
export async function savedReport(commit) {
  let html;
  try {
    html = await readFile(join(output, commit, 'index.html'), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  const [entry] = readEntries(html);
  const data = JSON.parse(/id="report-data">([^<]+)/.exec(html)?.[1]);
  if (entry.commit !== commit || data.commit !== commit || data.schema !== 1) throw Error('Invalid report: ' + commit);
  return data;
}

/** Refresh presentation of cached measurements without rerunning the musical test suite. */
export async function ensureReport(commit) {
  const saved = await savedReport(commit);
  if (!saved) {
    await buildReport(commit);
    return savedReport(commit);
  }
  saved.releaseTag = releases(commit).find((release) => release.hash === commit)?.tag;
  await save(join(output, commit, 'index.html'), commitPage(saved));
  return saved;
}

/** Measure a Git revision, then install the commit page and update the local archive. */
export async function buildReport(ref = 'HEAD') {
  const commit = revision(ref),
    head = revision('HEAD');
  git(root, 'merge-base', '--is-ancestor', base, commit);
  const releaseTag = releases(commit).find((r) => r.hash === commit)?.tag;
  const branch = (commit === head && git(root, 'branch', '--show-current')) || 'detached HEAD';
  await withSnapshot(commit, async (checkout) => {
    const pkg = JSON.parse(await readFile(join(checkout, 'package.json')));
    const lock = JSON.parse(await readFile(join(checkout, 'package-lock.json')));
    if (releaseTag && releaseTag !== pkg.version) throw Error('Package version does not match tag ' + releaseTag);
    console.log('Measuring VexTab', releaseTag ?? commit);
    const tracked = git(checkout, 'ls-files', '-z').split('\0').filter(Boolean);
    const source = await sourceMetrics(checkout, tracked);
    buildBundles(checkout, 'production');
    const bundles = await bundleSizes(checkout);
    buildBundles(checkout, 'coverage');
    const coverage = await browserCoverage(checkout, tracked);
    const report = {
      schema: 1,
      commit,
      branch,
      releaseTag,
      version: pkg.version,
      node: process.version,
      subject: git(checkout, 'log', '-1', '--format=%s'),
      committed: git(checkout, 'log', '-1', '--format=%cI'),
      generated: new Date().toISOString(),
      source,
      coverage,
      bundles,
      dependencies: dependencies(pkg, lock),
    };
    await save(join(output, commit, 'index.html'), commitPage(report));
    await refreshArchive(output);
    console.log(join(output, commit, 'index.html'));
  });
}
