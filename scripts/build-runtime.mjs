// Build only the public npm modules, the two-tag browser entry, types and license notices.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import compileGrammar from './jison-loader.cjs';

const out = 'dist/runtime';
const tsc = resolve('node_modules/typescript/bin/tsc');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const formats = ['musicxml', 'mxl', 'lilypond'];
const assets = {
  name: 'vextab-assets',
  setup(builder) {
    builder.onLoad({ filter: /\.jison$/ }, async ({ path }) => ({
      contents: compileGrammar(await readFile(path, 'utf8')), loader: 'js',
    }));
    // Install the embed styles when the DOM API is loaded, including in a bundled app.
    builder.onLoad({ filter: /\.css$/ }, async ({ path }) => ({
      contents: 'const style = document.createElement("style"); style.textContent = ' +
        JSON.stringify(await readFile(path, 'utf8')) + '; document.head.append(style);',
    }));
  },
};
const options = { bundle: true, minify: true, target: 'es2022', metafile: true, sourcemap: process.argv.includes('--sourcemap'), legalComments: 'eof' };
const modules = await build({
  ...options, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'],
  entryPoints: {
    auto: 'src/auto.ts', browser: 'src/browser.ts', parse: 'src/score/parse.ts', performer: 'src/playback/performer.ts',
    ...Object.fromEntries(formats.map(name => ['import/' + name, 'importer/src/' + name + '.ts'])),
  },
  // Resolve from the root lockfile even when the importer test workspace has its own install.
  alias: { saxes: createRequire(import.meta.url).resolve('saxes') },
  splitting: true, chunkNames: 'shared/[hash]', outExtension: { '.js': '.mjs' },
  outdir: out, external: ['vexflow'], plugins: [assets],
});
const browser = await build({
  ...options, format: 'iife', globalName: 'vextab', entryPoints: ['src/script.ts'], outfile: out + '/vextab.js',
  plugins: [assets, {
    name: 'browser-vexflow',
    setup(builder) {
      builder.onResolve({ filter: /^vexflow$/ }, () => ({ path: 'vexflow', namespace: 'browser' }));
      builder.onLoad({ filter: /.*/, namespace: 'browser' }, () => ({
        contents: 'if (!window.VexFlow) throw new Error("Load vexflow.js before vextab.js."); module.exports = window.VexFlow;',
      }));
    },
  }],
});
// Keep the compiler output for the public importers alongside the host's declarations.
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.types.json', '--outDir', out + '/types'], { stdio: 'inherit' });
const importerTypes = 'build/importer-types';
execFileSync(process.execPath, [tsc, '-p', 'importer/tsconfig.json', '--outDir', importerTypes], { stdio: 'inherit' });
await mkdir(out + '/types/import', { recursive: true });
for (const name of [...formats, 'types']) await copyFile(importerTypes + '/' + name + '.d.ts', out + '/types/import/' + name + '.d.ts');
await copyFile('doc/vextab.css', out + '/vextab.css');
await copyFile('importer/THIRD-PARTY.txt', out + '/THIRD-PARTY.txt');
await copyFile('scripts/ZEPTO-LICENSE', out + '/ZEPTO-LICENSE');
await mkdir('build', { recursive: true });
await writeFile('build/runtime-stats.json', JSON.stringify({ modules: modules.metafile, browser: browser.metafile }));
