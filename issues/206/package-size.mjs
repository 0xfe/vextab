// Pack the three self-contained probe entries, then measure their payload in an isolated offline install.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { output } from './workloads.mjs';

const base = resolve(output);
const pkg = join(base, 'sizing-package');
const consumer = mkdtempSync(join(base, 'sizing-consumer-'));
const name = 'vextab-m0-sizing-probe';
mkdirSync(pkg, { recursive: true });
const entries = ['musicxml', 'mxl', 'lilypond'];
const files = entries.map(entry => entry + '.mjs');
for (const file of files) cpSync(join(base, file), join(pkg, file));
const manifest = { name, private: true, version: '0.0.0', type: 'module', files,
  exports: Object.fromEntries(entries.map(entry => ['./' + entry, './' + entry + '.mjs'])) };
writeFileSync(join(pkg, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
const npm = (args, cwd) => execFileSync('npm', [...args, '--cache', join(base, 'npm-cache')], { cwd, encoding: 'utf8' });
const [pack] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', base], pkg));
writeFileSync(join(consumer, 'package.json'), '{"name":"m0-consumer","private":true}\n');
npm(['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts', '--no-save', join(base, pack.filename)], consumer);
const installed = join(consumer, 'node_modules', name);
const payload = readdirSync(installed).reduce((sum, file) => sum + statSync(join(installed, file)).size, 0);
assert.equal(payload, pack.unpackedSize);
for (const entry of entries) execFileSync(process.execPath, ['--input-type=module', '-e', 'import {probe} from "' + name + '/' + entry + '"; if(typeof probe !== "function") process.exit(1)'], { cwd: consumer });
console.log({ packedBytes: pack.size, installedPayloadBytes: payload, files: pack.entryCount });
