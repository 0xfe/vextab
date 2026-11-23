// Publish a frozen, verified build to a bucket prefix: immutable assets first, HTML last.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Validate manifest paths and contents before any remote operation. */
export async function validate(directory, jsonFiles = []) {
  for (const file of jsonFiles) {
    if (!/^[a-z][a-z0-9-]*\.json$/.test(file) || file === 'manifest.json')
      throw new Error('Invalid JSON download name.');
  }
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (!/^assets\/[a-f0-9]{16}$/.test(manifest.assetPath) || !manifest.files['index.html'])
    throw new Error('Invalid static-site manifest.');
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (
      file !== 'index.html' &&
      file !== 'all.html' &&
      !jsonFiles.includes(file) &&
      (!file.startsWith(manifest.assetPath + '/') || file.split('/').includes('..'))
    )
      throw new Error('Unsafe manifest path.');
    if (hash(await readFile(join(directory, file))) !== digest) throw new Error(`Build changed: ${file}`);
  }
  for (const page of ['index.html', 'all.html'].filter((name) => manifest.files[name])) {
    const html = await readFile(join(directory, page), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))
      if (!manifest.files[match[1].split('?')[0]]) throw new Error(`Missing page asset: ${match[1]}`);
  }
  return manifest;
}
/** Print the upload plan or run one Cloud Storage operation, optionally capturing its bytes. */
function run(command, dryRun, args, captureBytes = 0) {
  if (dryRun) {
    console.log([command, ...args].join(' '));
    return '';
  }
  const result = spawnSync(command, args, {
    stdio: captureBytes ? 'pipe' : 'inherit',
    maxBuffer: Math.max(1024 * 1024, captureBytes),
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`gcloud failed (${result.status ?? result.signal}). HTML publication stopped.`);
  return result.stdout;
}

/** Publish a mutable page or JSON download, then check its stored bytes against the reviewed file. */
export async function uploadFile(path, destination, checksum, { command, dryRun }) {
  run(command, dryRun, [
    'storage',
    'cp',
    path,
    destination,
    '--predefined-acl=publicRead',
    '--cache-control=public,max-age=60,must-revalidate',
    path.endsWith('.json') ? '--content-type=application/json' : '--content-type=text/html',
  ]);
  if (!dryRun) {
    const { size } = await stat(path);
    if (hash(run(command, dryRun, ['storage', 'cat', destination], size + 1)) !== checksum)
      throw new Error(`Uploaded file differs from the build (${destination}). Check for a concurrent upload.`);
  }
}

/** Upload immutable assets, then short-lived downloads and pages. Verify each stable URL after writing it. */
export async function upload({
  destination,
  dryRun = false,
  directory,
  command = 'gcloud',
  publicURL,
  jsonFiles = [],
} = {}) {
  if (!/^gs:\/\/[a-z0-9][a-z0-9._-]+\/(?:[a-zA-Z0-9_-]+\/)+$/.test(destination))
    throw new Error('Use a bucket and nonempty prefix, such as gs://vexflow.com/vextab/reports/whatsnew/.');
  const original = await validate(directory, jsonFiles);
  const staging = await mkdtemp(join(tmpdir(), 'vextab-static-upload-'));
  try {
    // Copy only manifest members. Extra local files must never become public assets.
    for (const file of [...Object.keys(original.files), 'manifest.json']) {
      await mkdir(dirname(join(staging, file)), { recursive: true });
      await copyFile(join(directory, file), join(staging, file));
    }
    const manifest = await validate(staging, jsonFiles);
    run(command, dryRun, [
      'storage',
      'rsync',
      join(staging, 'assets/'),
      `${destination}assets/`,
      '--recursive',
      '--checksums-only',
      '--predefined-acl=publicRead',
      '--cache-control=public,max-age=31536000,immutable',
    ]);
    for (const page of [...jsonFiles, 'all.html', 'index.html'].filter((name) => manifest.files[name])) {
      await uploadFile(join(staging, page), destination + page, manifest.files[page], { command, dryRun });
    }
    console.log(
      dryRun ? 'Dry run complete. No files uploaded.' : `Published ${destination}${publicURL ? ` → ${publicURL}` : ''}`
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
