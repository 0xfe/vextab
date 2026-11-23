// Produce self-contained per-format modules and check the actual browser dependency graph.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

for (const [entry, ceiling] of [['musicxml', 32768], ['lilypond', 24576]]) {
  const outfile = 'dist/' + entry + '.js';
  const result = await build({ entryPoints: ['src/' + entry + '.ts'], outfile, platform: 'browser', format: 'esm',
    target: 'es2022', bundle: true, minify: true, metafile: true });
  const graph = Object.keys(result.metafile.inputs);
  assert.ok(graph.every(path => !path.includes('node_modules/') || /node_modules\/(?:saxes|xmlchars)\//.test(path)), graph);
  assert.equal(graph.some(path => path.includes('saxes/')), entry === 'musicxml');
  assert.ok(!graph.includes('src/' + (entry === 'musicxml' ? 'lilypond' : 'musicxml') + '.ts'));
  const bytes = gzipSync(readFileSync(outfile), { level: 9 }).length;
  assert.ok(bytes <= ceiling, entry + ' exceeds its gzip budget');
  console.log(entry + ': ' + bytes + ' gzip bytes (' + graph.join(', ') + ')');
}
