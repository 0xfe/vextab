// Publish a fresh, isolated guide build to Cloud Storage, with stable HTML uploaded last.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'dry-run': { type: 'boolean', default: false },
  destination: { type: 'string', default: 'gs://vexflow.com/vextab/guide/' },
} });
const destination = values.destination;
if (!/^gs:\/\/[a-z0-9][a-z0-9._-]+\/(?:[\w-]+\/)+$/.test(destination)) {
  throw new Error('Use a Cloud Storage bucket with a nonempty prefix and trailing slash.');
}

const pageCache = '--cache-control=public,max-age=60,must-revalidate';
const publicRead = '--predefined-acl=publicRead';

/** Fail immediately on a storage error so a partial asset upload cannot publish new pages. */
function storage(...args) {
  if (values['dry-run']) {
    console.log(['gcloud', 'storage', ...args].join(' '));
    return;
  }
  return execFileSync('gcloud', ['storage', ...args], { stdio: args[0] === 'cat' ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
}

const staging = mkdtempSync(join(tmpdir(), 'vextab-guide-'));
try {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('webpack/bin/webpack.js'), '--mode', 'production',
    '--env', 'guideSite', '--output-path', staging], { cwd: new URL('../', import.meta.url), stdio: 'inherit' });

  const pages = readdirSync(staging).filter(name => name.endsWith('.html') && name !== 'index.html');
  pages.push('index.html');
  // Only fingerprinted bundles have immutable URLs. Keep old bundles available to open tabs.
  for (const folder of ['assets', 'fonts', 'licenses', 'scores']) {
    const cache = folder === 'assets' ? '--cache-control=public,max-age=31536000,immutable' : pageCache;
    storage('rsync', join(staging, folder), destination + folder + '/', '--recursive', '--checksums-only', publicRead, cache);
  }
  for (const page of pages) {
    const file = join(staging, page);
    const expected = readFileSync(file);
    storage('cp', file, destination + page, publicRead, pageCache, '--content-type=text/html');
    const uploaded = storage('cat', destination + page);
    if (uploaded && !uploaded.equals(expected)) throw new Error('Uploaded page differs from build: ' + page);
  }
  console.log(values['dry-run'] ? 'Dry run complete.' : 'Published ' + destination);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
