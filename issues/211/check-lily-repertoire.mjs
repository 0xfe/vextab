// Compare the actual VexTab player’s literal event stream with independent MIDI observations.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { importLilyPond } from '../../importer/dist/lilypond.js';
import { parseScore } from 'vextab/parse';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
mkdirSync(join(root,'build'),{recursive:true});
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
  for (const name of ['joplin-first','sor-opening','chord-mode']) {
    const guitar = name === 'sor-opening', source = readFileSync(join(fixtures,name+'.ly'),'utf8');
    const result = importLilyPond(source,{targetProfile:'expressive',mode:'partial',guitar});
    assert.equal(result.status,name==='chord-mode'?'exact':'partial',JSON.stringify(result.diagnostics));
    const text = result.documents[0].text, model = parseScore(text), score = projectScoreV2(model);
    const visits = measureVisits(score, true);
    assert.equal(visits.length,{'sor-opening':8,'joplin-first':33,'chord-mode':3}[name]);
    // At 60 BPM one whole note is 4 seconds. The stored reference uses 1,536 ticks per whole.
    const events = scorePerformance(score,60,undefined,visits).events;
    const ticks = seconds => Math.round(384 * seconds);
    const observations = events => events.flatMap(event => event.notes.map(note =>
      [ticks(event.time),note.pitch,ticks(event.time + note.duration)].join('\t'))).sort();
    const rows=observations(events);
    const native = guitar ? ['upperVoice','lowerVoice','middleVoice'].flatMap(v=>reference('sor-'+v)).sort() : reference(name);
    assert.deepEqual(rows,native,name+' pitch, attack or release differs');
    if (guitar) {
      const voices=model.parts[0].staves[0].voices;
      assert.equal(voices.length,3);
      for (const [i,name] of ['upperVoice','lowerVoice','middleVoice'].entries()) {
        const ids=new Set(voices[i].events.map(event=>event.id));
        assert.deepEqual(observations(events.filter(event=>ids.has(event.source))),reference('sor-'+name),name);
      }
      assert.match(text,/3\/2\[.*finger 2/);
      assert.match(text,/write E#5/);
      assert.match(text,/label "Allegretto\."/);
      assert.match(text,/beamStart/);
    } else if (name==='joplin-first') {
      // The edition's MIDI score requests an explicitly unfolded copy of the same written strain.
      const unfolded=importLilyPond(source,{targetProfile:'expressive',mode:'partial',score:'midi'});
      assert.equal(unfolded.status,'partial',JSON.stringify(unfolded.diagnostics));
      const plain=projectScoreV2(parseScore(unfolded.documents[0].text));
      const order=measureVisits(plain,true);
      assert.equal(plain.measures.length,33);
      assert.deepEqual(observations(scorePerformance(plain,60,undefined,order).events),native);
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

