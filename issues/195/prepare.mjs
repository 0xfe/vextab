// Prepare three immutable VexTab bundles for the M0 engraving comparison.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Pin both the shipped browser code and the exact sources used for the two rebuilds. */
const base = 'https://github.com';
const revision = '5c3c0c5ddf0b1bf3d254240c135300da87c1dd42';
const assets = {
  release: {
    url: base + '/0xfe/vextab/releases/download/6.0.0/vextab-6.0.0.tgz',
    sha256: 'e9f3cf930509b7477f60748865d2e61f2a371179a9d638dabcdfd39c802084d8',
  },
  source: {
    url: 'https://codeload.github.com/0xfe/vextab/tar.gz/' + revision,
    sha256: 'edad712fee3c3eb474fb34cabc5d732b8e5e5de17fb4047702cb3158989eab9a',
  },
  trial: {
    url: base + '/vexflow/vexflow/releases/download/5.7.0/vexflow-5.7.0.tgz',
    sha256: '48aa4e82b7f2ae1efe7e33ec6677fdbbde8b1139453b3bd022f5a67dead092e5',
  },
};

/** Verify each archive before extracting it into a new directory. */
async function unpack(parent, name) {
  const { url, sha256 } = assets[name];
  const response = await fetch(url);
  if (!response.ok) throw new Error(response.status + ' fetching ' + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, url);
  const archive = join(parent, name + '.tgz');
  const target = join(parent, name);
  await writeFile(archive, bytes);
  await mkdir(target);
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', target]);
  return target;
}

/** Use the release's build and lockfile for both engines. Swap only the VexFlow package. */
export async function prepare(output) {
  const working = await mkdtemp(join(tmpdir(), 'vextab-m0-build-'));
  try {
    const shipped = await unpack(working, 'release');
    const source = await unpack(working, 'source');
    const trial = await unpack(working, 'trial');
    await copyFile(join(shipped, 'dist/main.prod.js'), join(output, 'release.js'));
    await mkdir(join(output, 'scores'));
    for (const name of ['bossa', 'guitar-duet', 'slow-river']) {
      const file = name + '.vextab';
      await copyFile(join(shipped, 'dist/guide/scores', file), join(output, 'scores', file));
    }
    const run = args => execFileSync('npm', args, { cwd: source, stdio: 'inherit' });
    run(['ci', '--no-audit', '--no-fund']);
    const installed = join(source, 'node_modules/vexflow');
    const manifest = async path => JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    const oldEngine = await manifest(installed);
    const newEngine = await manifest(trial);
    assert.equal(oldEngine.version, '5.6.1');
    assert.equal(newEngine.version, '5.7.0');
    assert.deepEqual(newEngine.dependencies, oldEngine.dependencies, 'isolated trial must use the same transitive graph');
    run(['run', 'build']);
    await copyFile(join(source, 'dist/main.prod.js'), join(output, 'control.js'));
    await rename(installed, join(working, 'original-engine'));
    await rename(trial, installed);
    run(['run', 'build']);
    await copyFile(join(source, 'dist/main.prod.js'), join(output, 'trial.js'));
    await writeFile(join(output, 'inputs.json'), JSON.stringify({ revision, assets }, null, 2) + '\n');
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}
