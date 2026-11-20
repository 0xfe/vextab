// Rebuild tagged sources with their own locked dependencies, away from a developer's checkout.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const base = '4.0.0';
export const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 }).trimEnd();
export const revision = (ref) => git(root, 'rev-parse', '--verify', '--end-of-options', ref + '^{commit}');

/** Enumerate actual release tags on the ancestry path; never invent a missing patch release. */
export function releases(head) {
  const tags = git(root, 'tag', '--contains', base, '--merged', head, '--sort=version:refname').split('\n');
  return tags
    .filter((tag) => /^v?\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => {
      const hash = revision(tag);
      return { tag, hash, date: git(root, 'show', '-s', '--format=%as', hash) };
    });
}

/** Cache npm installs by manifest and lockfile bytes, Node version and platform. Publish a complete cache atomically. */
async function dependencies(checkout) {
  const lock = await readFile(join(checkout, 'package-lock.json'));
  const key = createHash('sha256')
    .update(lock)
    .update(await readFile(join(checkout, 'package.json')))
    .update(process.version + process.platform + process.arch)
    .digest('hex');
  const cache = join(root, 'build/report-cache');
  await mkdir(cache, { recursive: true });
  const target = join(cache, key);
  try {
    await access(join(target, 'node_modules/.package-lock.json'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const work = await mkdtemp(join(cache, 'install-'));
    try {
      for (const file of ['package.json', 'package-lock.json']) {
        await copyFile(join(checkout, file), join(work, file));
      }
      execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: work, stdio: 'inherit' });
      try {
        await rename(work, target);
      } catch (err) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(err.code)) throw err;
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  await symlink(join(target, 'node_modules'), join(checkout, 'node_modules'), 'dir');
}

/** A detached clone supplies Git metadata required by the historical webpack configs. */
export async function withSnapshot(commit, action) {
  const checkout = await mkdtemp(join(tmpdir(), 'vextab-report-'));
  try {
    git(root, 'clone', '--quiet', '--shared', '--no-checkout', root, checkout);
    git(checkout, 'checkout', '--quiet', '--detach', commit);
    await dependencies(checkout);
    return await action(checkout);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
}
