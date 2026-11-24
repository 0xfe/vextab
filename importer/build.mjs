// Produce self-contained per-format modules and check the actual browser dependency graph.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { minify } from 'terser';

for (const [entry, ceiling] of [
  ['musicxml', 32768],
  ['lilypond', 24576],
  ['mxl', 40960],
]) {
  const outfile = 'dist/' + entry + '.js';
  const result = await build({
    entryPoints: ['src/' + entry + '.ts'],
    outfile,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
  });
  const graph = Object.keys(result.metafile.inputs);
  assert.ok(
    graph.every((path) => !path.includes('node_modules/') || /node_modules\/(?:saxes|xmlchars)\//.test(path)),
    graph,
  );
  assert.equal(
    graph.some((path) => path.includes('saxes/')),
    entry !== 'lilypond',
  );
  // MXL shares the XML reader. Only the compressed entry may contain the container decoder.
  assert.equal(graph.includes('src/mxl.ts'), entry === 'mxl');
  assert.equal(graph.includes('src/xml.ts'), entry !== 'lilypond');
  assert.equal(graph.includes('src/musicxml-reader.ts'), entry !== 'lilypond');
  assert.equal(
    graph.some((path) => path.startsWith('src/musicxml')),
    entry !== 'lilypond',
  );
  assert.equal(
    graph.some((path) => path.startsWith('src/lilypond')),
    entry === 'lilypond',
  );
  assert.ok(
    Object.values(result.metafile.outputs).every((output) => output.imports.length === 0),
    entry + ' must load without external modules or lazy chunks',
  );
  // esbuild keeps the SAX state machine fast. Reassigning short names on the final bundle improves gzip
  // without running another optimizer over those hot loops.
  const { code } = await minify(result.outputFiles[0].text, {
    module: true,
    ecma: 2022,
    compress: false,
  });
  assert.ok(code, 'Missing production bundle for ' + entry);
  const bytes = gzipSync(code, { level: 9 }).length;
  assert.ok(bytes <= ceiling, entry + ' exceeds its gzip budget');
  writeFileSync(outfile, code);
  console.log(entry + ': ' + bytes + ' gzip bytes (' + graph.join(', ') + ')');
}
