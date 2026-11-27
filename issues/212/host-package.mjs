// Verify the actual release inventory and the module graph of each packed entry.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
const files = await readdir(root, { recursive: true });
for (const entry of Object.values(manifest.exports)) {
  for (const file of typeof entry === 'string' ? [entry] : Object.values(entry)) assert.ok(files.includes(file.slice(2)), file);
}
assert.deepEqual(Object.keys(manifest.dependencies), ['vexflow']);
assert.ok(files.includes('dist/runtime/THIRD-PARTY.txt'));
assert.ok(files.every(file => !file.endsWith('.map') && !file.endsWith('.dev.js')));
for (const file of files) assert.ok(file.startsWith('dist/runtime/') ||
  ['package.json', 'README.md', 'LICENSE', 'SECURITY.md', 'dist', 'dist/runtime', 'scripts', 'scripts/migrate-score.mjs'].includes(file), file);
const { modules, browser } = JSON.parse(await readFile('build/runtime-stats.json'));
assert.ok(browser.outputs['dist/runtime/vextab.js'].bytes < 400_000, 'Browser script size budget exceeded');
for (const graph of [modules, browser]) {
  assert.ok(Object.keys(graph.inputs).every(file => !file.includes('node_modules/vexflow/')));
  for (const file of Object.keys(graph.outputs)) assert.ok(files.includes(file), file);
}
// Follow shared chunks so an accidental import from the renderer is caught after splitting.
function inputsOf(graph, entry) {
  const inputs = new Set(), seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const output = graph.outputs[file];
    for (const input of Object.keys(output.inputs)) inputs.add(input);
    for (const dependency of output.imports) if (!dependency.external) visit(dependency.path);
  }
  visit(entry);
  return [...inputs];
}
for (const entry of ['auto', 'browser', 'parse', 'resolve', 'performer']) {
  assert.ok(inputsOf(modules, 'dist/runtime/' + entry + '.mjs').every(file => !file.startsWith('importer/')));
}
const parserInputs = inputsOf(modules, 'dist/runtime/parse.mjs');
assert.ok(!parserInputs.includes('src/score/grammar2/project.ts'), 'Syntax-only imports must omit the part projection');
assert.ok(!inputsOf(modules, 'dist/runtime/resolve.mjs').includes('src/score/layout.ts'), 'Resolving a part must omit screen rendering');
assert.ok(inputsOf(browser, 'dist/runtime/vextab.js').every(file => !file.startsWith('importer/')));
for (const name of ['musicxml', 'mxl', 'lilypond']) {
  const inputs = inputsOf(modules, 'dist/runtime/import/' + name + '.mjs');
  assert.ok(inputs.includes('importer/src/' + name + '.ts'));
  assert.ok(inputs.every(file => !file.startsWith('src/')));
}
console.log('Verified production entries, shared chunks and external VexFlow in the packed release.');
