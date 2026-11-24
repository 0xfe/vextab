// Run the M0 budgets against real public importers and save every measurement before deciding the gate.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const timing = {};
const memory = [];
const dir = 'build/importer-m5';
mkdirSync(dir, { recursive: true });

/** Each timing invocation samples 21 fresh processes or worker realms. Keep all raw reported metrics. */
const workloads = [
  ['xml32', ['--xml32'], 25],
  ['ly32', ['--ly32'], 25],
  ['quartetXML', ['--xml', '--expressive'], 500],
  ['quartetMXL', ['--expressive'], 750],
  ['echigo', ['--echigo'], null],
  ['sor', ['--sor'], null],
  ['maple', ['--maple'], 100],
];
for (const [name, args] of workloads) {
  timing[name] = JSON.parse(
    execFileSync(process.execPath, ['issues/210/timing.mjs', ...args], { encoding: 'utf8' }),
  );
  console.log(name, JSON.stringify(timing[name]));
}
// New Chrome for each RSS run, with the resident source and one worker reused for all 21 imports in a run.
for (const profile of [[], ['--expressive']]) {
  for (const extra of [[], [], [], ['--once'], ['--source-map']]) {
    const row = JSON.parse(
      execFileSync(process.execPath, ['issues/210/memory.mjs', ...profile, ...extra], { encoding: 'utf8' }),
    );
    memory.push(row);
    console.log('Chrome RSS', JSON.stringify(row));
  }
}
writeFileSync(dir + '/benchmark.json', JSON.stringify({ timing, memory }, null, 2) + '\n');
for (const [name, , ceiling] of workloads) {
  const {
    nodeLoadConvertReparseMs: node,
    workerLoadConvertMs: worker,
    nodePeakRssGrowthMiB: rss,
  } = timing[name];
  assert.ok(node[0][1] < 10 && worker[0][1] < 10, name + ' cold-load p95');
  if (ceiling) assert.ok(node[1][1] <= ceiling && worker[1][1] <= ceiling, name + ' conversion p95');
  if (name.startsWith('quartet')) assert.ok(rss[1] <= 64, name + ' Node peak RSS growth');
}
for (const row of memory.filter((r) => r.conversions === 21 && !r.sourceMap)) {
  assert.ok(row.growthMiB <= 128, row.profile + ' sustained renderer RSS growth ' + row.growthMiB + ' MiB');
}
