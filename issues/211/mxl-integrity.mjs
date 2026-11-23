// Exercise the native browser inflater and prove that no document escapes a failed archive checksum.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The standard ZIP writer supplies an independent central directory and CRC for this small UTF-16 score. */
function archive(content) {
  const python = `import io,sys,zipfile
out=io.BytesIO()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
    z.writestr('score.xml',sys.stdin.buffer.read())
sys.stdout.buffer.write(out.getvalue())`;
  return execFileSync('python3', ['-c', python], { input: Buffer.from('\uFEFF' + content, 'utf16le') });
}
function corrupt(bytes) {
  const result = Buffer.from(bytes);
  const entry = result.lastIndexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  assert.ok(entry > 0);
  result[entry + 16] ^= 1;
  return result;
}
export async function checkArchiveIntegrity(browser) {
  const score = readFileSync(new URL('fixtures/song.musicxml', import.meta.url), 'utf8');
  const good = archive(score);
  // The unexpected close tag is read before several more chunks and before the inflater checks the final CRC.
  const bad = archive(score.replace('<part-list>', '</mismatch><part-list>') + ' '.repeat(50000));
  const cases = [good, bad, corrupt(good), corrupt(bad)];
  const page = await browser.newPage();
  try {
    await page.route('http://archive.test/**', (route) => {
      if (route.request().url().endsWith('/mxl.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: readFileSync(new URL('../../importer/dist/mxl.js', import.meta.url)),
        });
      return route.fulfill({ contentType: 'text/html', body: '<title>Browser archive verification</title>' });
    });
    await page.goto('http://archive.test/');
    const results = await page.evaluate(
      async (encoded) => {
        const { importMXL } = await import('/mxl.js');
        return Promise.all(
          encoded.map((source) =>
            importMXL(
              Uint8Array.from(atob(source), (c) => c.charCodeAt(0)),
              { targetProfile: 'expressive', filename: 'source.mxl' },
            ),
          ),
        );
      },
      cases.map((bytes) => bytes.toString('base64')),
    );
    assert.equal(results[0].status, 'exact');
    assert.equal(results[1].status, 'failed');
    assert.equal(results[1].diagnostics.at(-1).file, 'source.mxl!/score.xml');
    assert.match(results[1].diagnostics.at(-1).message, /close tag/);
    for (const result of results.slice(2)) {
      assert.equal(result.status, 'failed');
      assert.deepEqual(result.documents, []);
      assert.equal(result.diagnostics.at(-1).file, 'source.mxl');
      assert.match(result.diagnostics.at(-1).message, /checksum/);
    }
  } finally {
    await page.close();
  }
}
