// Read total resident memory for the renderers owned by a benchmark Chrome process.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** ps reports resident KiB. Include the page and any worker renderer processes owned by this Chrome. */
export async function rendererMiB(session) {
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  const ids = processInfo.filter(p => p.type === 'renderer').map(p => p.id);
  assert.ok(ids.length);
  const rows = execFileSync('ps', ['-o', 'rss=', '-p', ids.join(',')], { encoding: 'utf8' });
  return rows.trim().split(/\s+/).reduce((total, value) => total + Number(value), 0) / 1024;
}
