// Inspect the packed VexTab host and every public executable entry's production source map.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
assert.ok(root && process.argv[3], 'Pass the unpacked vextab package directory and its webpack stats JSON');
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
const forbidden = /(?:^|\/)(?:vextab-import|importers?|gallery|saxes|xmlchars)(?:\/|$)/;
const files = await readdir(root, { recursive: true });
assert.ok(
  files.every((file) => !forbidden.test(file)),
  'Unexpected importer payload in host',
);
for (const dependencies of [
  manifest.dependencies,
  manifest.optionalDependencies,
  manifest.peerDependencies,
]) {
  assert.ok(Object.keys(dependencies ?? {}).every((name) => !forbidden.test(name)));
}
// Include split production chunks in addition to the parser, player, browser and editor exports.
const maps = files.filter((file) => file.startsWith('dist/') && /(?:\.prod\.js|\.cjs)\.map$/.test(file));
for (const [id, entry] of Object.entries(manifest.exports)) {
  if (id === './*') continue;
  assert.ok(maps.includes(entry.default.slice(2) + '.map'), id + ' has no production source map');
}
// Generated font chunks have no source maps. Inspect webpack's full module graph as well.
const stats = JSON.parse(await readFile(process.argv[3], 'utf8'));
const modules = [];
function visit(module) {
  for (const id of [module.name, module.identifier, module.nameForCondition]) {
    if (id) assert.ok(!forbidden.test(id), 'Importer code in host module ' + id);
  }
  if (module.identifier) modules.push(module.identifier);
  for (const child of [...(module.modules ?? []), ...(module.children ?? [])]) visit(child);
}
for (const module of stats.modules) visit(module);
assert.ok(modules.some(id => id.includes('src/score/')), 'Incomplete host module inventory');
assert.ok(modules.some(id => id.includes('node_modules/vexflow/')), 'Missing bundled engraving engine');
for (const file of files.filter(file => /^dist\/[^/]+\.prod\.js$/.test(file))) {
  assert.ok(stats.assets.some(asset => asset.name === file.slice(5)), 'Unaccounted production asset ' + file);
}
for (const path of maps) {
  const map = JSON.parse(await readFile(join(root, path)));
  assert.ok(map.sources.length, path);
  assert.ok(
    map.sources.every((source) => !forbidden.test(source)),
    path + ' contains an importer module',
  );
}
console.log(
  'Host package has no importer files or dependencies across ' + maps.length + ' production bundle maps and ' + modules.length + ' module records.',
);
