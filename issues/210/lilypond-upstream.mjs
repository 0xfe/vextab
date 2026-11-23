// Exercise unchanged upstream syntax and compare successful VexTab output with the native 2.26.0 listener.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScore } from 'vextab/parse';
import { importLilyPond } from '../../importer/dist/lilypond.js';

const revision = '3596756be0fac1f81066a99d2054329212172b2d';
const fixtures = [
  ['tuplet-nest-beam', '3fa665b50889cd0c1237da1bd7b691eff2df349b27e6b74e6e3114d3c81ff7d8'],
  ['staff-change-autobeam', 'adfe248aa8488abb0387b29b32c77e2124c906f008ecd78f7b8e74eba70f9c73', '\\change', 'Unknown display staff down.'],
  ['repeat-volta-specified-alternatives', '17ad8b02bc08b9555215cbbf18ecd53e403cd51a1eff26b96269f4cdc1d442eb', '3', 'Expected one consecutive pass number per written ending.'],
];
const golden = [
  [60,'0.00000000','0.05714286'], [62,'0.05714286','0.05714286'], [64,'0.11428571','0.05714286'],
  [65,'0.17142857','0.05714286'], [67,'0.22857143','0.05714286'], [69,'0.28571429','0.07142857'],
  [71,'0.35714286','0.07142857'], [72,'0.42857143','0.07142857'],
];
const rounded = fraction => {
  const [n,d] = fraction.split('/').map(Number);
  return (n/d).toFixed(8);
};

/** Native execution is confined to the reviewed, digest-checked successful fixture. */
function verifyNative(source) {
  assert.match(execFileSync('lilypond', ['--version'], {encoding:'utf8'}), /^GNU LilyPond 2\.26\.0\b/);
  const cwd = mkdtempSync(join(tmpdir(), 'vextab-upstream-lilypond-'));
  writeFileSync(join(cwd, 'score.ly'), '\\include "event-listener.ly"\n' + source);
  execFileSync('lilypond', ['-dno-print-pages','score.ly'], {cwd, stdio:'pipe', env:{...process.env, XDG_CACHE_HOME:cwd}});
  const events = readFileSync(join(cwd, 'score-unnamed-staff.notes'),'utf8').trim().split('\n')
    .map(line => line.split('\t')).filter(fields => fields[1] === 'note')
    .map(([at,,pitch,,duration]) => [Number(pitch),at,duration]);
  assert.deepEqual(events, golden);
}

for (const [name, digest, unsupported, message] of fixtures) {
  const filename = name + '.ly';
  const path = 'input/regression/' + filename;
  let bytes;
  if (process.env.LILYPOND_SOURCE_DIR) bytes = readFileSync(join(process.env.LILYPOND_SOURCE_DIR, path));
  else {
    const response = await fetch('https://raw.githubusercontent.com/lilypond/lilypond/' + revision + '/' + path);
    assert.ok(response.ok, filename + ' HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
  const source = bytes.toString('utf8');
  for (const mode of ['strict','partial']) {
    const result = importLilyPond(source, {filename, mode, finalFragment:true});
    if (unsupported) {
      assert.equal(result.status, 'failed');
      const error = result.diagnostics.at(-1);
      assert.equal(error.file, filename);
      assert.equal(error.message, message);
      assert.equal(source.slice(...error.range), unsupported);
      continue;
    }
    assert.equal(result.status, 'exact');
    const voice = parseScore(result.documents[0].text).parts[0].staves[0].voices[0];
    assert.equal(voice.measures[0].fragment, true);
    assert.deepEqual(voice.spans.map(s => s.ratio).sort(), ['5:4','7:4']);
    const rows = voice.events.map(e => {
      const pitch = e.heads[0].pitch;
      const natural = [0,2,4,5,7,9,11]['CDEFGAB'.indexOf(pitch[0])];
      return [12*(Number(pitch.slice(1))+1) + natural, rounded(e.at), rounded(e.duration)];
    });
    assert.deepEqual(rows,golden);
    if (process.argv.includes('--native') && mode === 'strict') verifyNative(source);
  }
  console.log(filename + (unsupported ? ' matched its located diagnostic' : ' matched eight native pitches, onsets and durations'));
}
