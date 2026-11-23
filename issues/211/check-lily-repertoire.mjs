// Compare the actual VexTab player’s literal event stream with independent MIDI observations.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { importLilyPond } from '../../importer/dist/lilypond.js';
import { parseScore } from 'vextab/parse';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const work = mkdtempSync(join(root, 'build', 'lily-repertoire-'));
const require = createRequire(import.meta.url);

/** Bundle the existing player projection and traversal for Node without a DOM or audio device. */
function player() {
  const file = join(work, 'player.cjs');
  buildSync({
    stdin: { contents: [
      "export {projectScoreV2} from './src/score/grammar2/project.ts';",
      "export {measureVisits} from './src/playback/visits.ts';",
      "export {scorePerformance} from './src/playback/performance.ts';"
    ].join('\n'), resolveDir: root },
    bundle: true, format: 'cjs', platform: 'node', alias:{vexflow:'vexflow/core'}, loader:{'.jison':'text'}, outfile: file
  });
  return require(file);
}

function reference(name) {
  return readFileSync(join(fixtures, name + '.tsv'), 'utf8').trimEnd().split('\n').sort();
}

try {
  const {projectScoreV2, measureVisits, scorePerformance} = player();
  for (const name of ['joplin-first','sor-opening']) {
    const guitar = name === 'sor-opening', source = readFileSync(join(fixtures,name+'.ly'),'utf8');
    const result = importLilyPond(source,{targetProfile:'expressive',mode:'partial',guitar});
    assert.equal(result.status,'partial',JSON.stringify(result.diagnostics));
    const text = result.documents[0].text, model = parseScore(text), score = projectScoreV2(model);
    const visits = measureVisits(score, true);
    assert.equal(visits.length,guitar ? 8 : 33);
    // At 60 BPM one whole note is 4 seconds. The stored reference uses 1,536 ticks per whole.
    const events = scorePerformance(score,60,undefined,visits).events;
    const ticks = seconds => Math.round(384 * seconds);
    const rows = events.flatMap(event => event.notes.map(note =>
      [ticks(event.time),note.pitch,ticks(event.time + note.duration)].join('\t'))).sort();
    const native = guitar ? ['upperVoice','lowerVoice','middleVoice'].flatMap(v=>reference('sor-'+v)).sort() : reference(name);
    assert.deepEqual(rows,native,name+' pitch, attack or release differs');
    if (guitar) {
      assert.equal(model.parts[0].staves[0].voices.length,3);
      assert.match(text,/3\/2\[.*finger 2/);
      assert.match(text,/write E#5/);
      assert.match(text,/beamStart/);
    } else {
      assert.match(text,/onStaff lower/);
      assert.match(text,/slurStart/);
      assert.match(text,/showSign/);
      assert.match(text,/crescendoStart/);
    }
    console.log(name+' matched '+rows.length+' independent MIDI attacks and releases.');
  }
} finally {
  rmSync(work,{recursive:true,force:true});
}

