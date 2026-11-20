// Publish immutable commit pages and merge the shared archive with Cloud Storage generation preconditions.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { archivePage, readEntries, summary } from './html.mjs';

/** Other failures (including permission errors) must never be treated as an empty archive. */
function storageError(stderr) {
  if (/conditionNotMet|Precondition Failed|pre-conditions? you specified|\b412\b/i.test(stderr)) return 'conflict';
  if (/\b404\b|matched no objects|No URLs matched|not found:/i.test(stderr)) return 'missing';
  return 'failure';
}

/** Use gcloud's normal credentials and stream HTML directly, without a mutable upload directory. */
function gcloud(args, input) {
  const result = spawnSync('gcloud', ['storage', ...args], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = Error(result.stderr.trim() || 'gcloud storage failed');
    err.kind = storageError(err.message);
    throw err;
  }
  return result.stdout;
}

function put(storage, url, html, generation, cache) {
  storage(
    [
      'cp',
      '-',
      url,
      '--if-generation-match=' + generation,
      '--predefined-acl=publicRead',
      '--content-type=text/html; charset=utf-8',
      '--cache-control=' + cache,
    ],
    html
  );
}

/** Preserve the first measurements at an immutable URL and verify new writes before indexing. */
function publishOnce(storage, url, html) {
  try {
    put(storage, url, html, '0', 'public,max-age=31536000,immutable');
  } catch (err) {
    if (err.kind !== 'conflict') throw err;
    return storage(['cat', url]);
  }
  const saved = storage(['cat', url]);
  if (saved !== html) throw Error('Published report failed readback: ' + url);
  return saved;
}

/** Read exactly the generation we will replace. Retry if another publisher removes that generation. */
function readArchive(storage, url) {
  let generation;
  try {
    generation = storage(['objects', 'describe', url, '--format=value(generation)']).trim();
  } catch (err) {
    if (err.kind === 'missing') return { generation: '0', entries: [] };
    throw err;
  }
  if (!/^\d+$/.test(generation)) throw Error('Invalid archive generation from gcloud.');
  return { generation, entries: readEntries(storage(['cat', url + '#' + generation])) };
}

/** The first report for a SHA wins. A later retry can repair the archive after an interrupted upload. */
export async function uploadReport({
  directory,
  commit,
  destination = 'gs://vexflow.com/vextab/reports/',
  dryRun = false,
  storage = gcloud,
}) {
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^gs:\/\/[a-z0-9][a-z0-9._-]+\/(?:[a-zA-Z0-9_-]+\/)+$/.test(destination))
    throw Error('Expected a full commit SHA and a bucket with a nonempty prefix.');
  const html = await readFile(join(directory, commit, 'index.html'), 'utf8');
  const validateCommit = (page) => {
    const entries = readEntries(page);
    if (entries.length !== 1 || entries[0].commit !== commit)
      throw Error('Report metadata does not match its commit path.');
    const data = /<script type="application\/json" id="report-data">([^<]+)<\/script>/.exec(page)?.[1];
    if (!data || !page.trimEnd().endsWith('</html>')) throw Error('Incomplete commit report.');
    const report = JSON.parse(data);
    if (report.schema !== 1 || JSON.stringify(summary(report)) !== JSON.stringify(entries[0]))
      throw Error('Report measurements do not match the archive entry.');
    return entries[0];
  };
  const local = validateCommit(html);
  if (local.releaseTag && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(local.version))
    throw Error('Invalid release report version.');
  const commitURL = destination + commit + '/index.html',
    indexURL = destination + 'index.html';
  if (dryRun) {
    console.log(
      `Dry run: create ${commitURL} if absent, then merge its entry into ${indexURL} using the current object generation.`
    );
    return;
  }
  const canonical = publishOnce(storage, commitURL, html);
  const entry = validateCommit(canonical);
  // A commit can acquire a release tag after its immutable measurements have been published.
  if (local.releaseTag && local.version !== entry.version)
    throw Error('Published package version differs from the tagged report.');
  if (local.releaseTag) {
    const versionURL = destination + local.version + '/index.html';
    if (publishOnce(storage, versionURL, canonical) !== canonical)
      throw Error('Release URL already points to a different report: ' + versionURL);
    entry.releaseTag = local.releaseTag;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const { generation, entries } = readArchive(storage, indexURL);
      const previous = entries.find((e) => e.commit === commit);
      if (!previous || (entry.releaseTag && !previous.releaseTag)) {
        const merged = [...entries.filter((e) => e.commit !== commit), entry];
        put(storage, indexURL, archivePage(merged), generation, 'public,max-age=60,must-revalidate');
      }
      console.log(`Report available at ${commitURL}. Archive: ${indexURL}`);
      return;
    } catch (err) {
      if (!['conflict', 'missing'].includes(err.kind)) throw err;
    }
  }
  throw Error('The archive kept changing. Rerun report:upload to index the saved commit page.');
}
