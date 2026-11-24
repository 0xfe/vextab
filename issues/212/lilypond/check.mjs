// Compare complete, unmodified editions through the public parser, written projection and literal player.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {parseScore} from 'vextab/parse';
import {importLilyPond} from '../../../importer/dist/lilypond.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const here=fileURLToPath(new URL('.',import.meta.url));
const editions=[
  {name:'sor',voices:['upperVoice','lowerVoice','middleVoice'],written:48,played:80,tempo:100},
  {name:'bwv999',voices:['melody','bass'],written:43,played:43,tempo:80},
  {name:'bwv846',folder:'../complex-lilypond',voices:['soprane','tenor','alt','bass'],written:27,played:27,tempo:66},
  {name:'maple',voices:['top','bottom'],written:85,played:145,tempo:120},
];
const fraction=s=>s.split('/').map(Number).reduce((a,b)=>a/b);
mkdirSync(join(root,'build'),{recursive:true});
const dir=mkdtempSync(join(root,'build','m5-lily-'));

function literalPlayer(){
  const path=join(dir,'player.cjs');
  buildSync({stdin:{contents:[
    "export {projectScoreV2} from './src/score/grammar2/project';",
    "export {scorePerformance} from './src/playback/performance';",
    "export {measureVisits} from './src/playback/visits';",
  ].join('\n'),resolveDir:root},bundle:true,format:'cjs',platform:'node',alias:{vexflow:'vexflow/core'},
  loader:{'.jison':'text'},outfile:path});
  return createRequire(import.meta.url)(path);
}

/** Source guitar pitches in treble_8 sound an octave below the printed score. */
function spelling(key,guitar){
  const m=/^([a-g])(bb|##|b|#|n)?\/(-?\d+)$/.exec(key);
  assert.ok(m,'unexpected written head '+key);
  return ['cdefgab'.indexOf(m[1]),({'bb':-2,'b':-1,'':0,n:0,'#':1,'##':2})[m[2]??''],Number(m[3])-(guitar?1:0)].join(',');
}

/** Compare sorted multisets, reporting the first difference without a multi-page assertion dump. */
function sameRows(actual,expected,description){
  actual.sort(); expected.sort();
  const index=actual.findIndex((v,i)=>v!==expected[i]);
  assert.equal(index,-1,description+' at row '+index+' actual='+actual[index]+' expected='+expected[index]);
  assert.equal(actual.length,expected.length,description+' row count');
}

try {
  const {projectScoreV2,measureVisits,scorePerformance}=literalPlayer();
  for (const {name,folder='.',voices,written,played,tempo} of editions) {
    const source=readFileSync(join(here,folder,name+'.ly'),'utf8');
    const reference=readFileSync(join(here,folder,name+'.tsv'),'utf8').trim().split('\n');
    const guitar=name==='sor' || name==='bwv999';
    for(const selection of ['print','midi']){
      const options={guitar,score:selection,targetProfile:'expressive',finalFragment:true,filename:name+'.ly'};
      const strict=importLilyPond(source,options);
      assert.equal(strict.status,'failed');
      assert.equal(strict.documents.length,0);
      const result=importLilyPond(source,{...options,mode:'partial'});
      assert.equal(result.status,'partial',JSON.stringify(result.diagnostics.at(-1)));
      assert.ok(result.diagnostics.every(d=>d.file===name+'.ly' && d.range[0]<d.range[1] && d.severity==='warning'));
      const {text}=result.documents[0], model=parseScore(text), projection=projectScoreV2(model);
      const expanded=name==='maple' && selection==='midi';
      const part=model.parts[0];
      assert.equal(projection.measures.length,expanded?played:written);
      const order=measureVisits(projection,true);
      assert.equal(order.length,played);
      const targets=part.staves.flatMap(stave=>stave.voices.map(voice=>({stave,voice})));
      assert.equal(targets.length,voices.length);
      const attacks=new Map(projection.measures.flatMap(m=>m.voices.flatMap(v=>v.events.map(e=>[e.id,e]))));
      const midiTempo=name!=='maple' && selection==='midi'?tempo:undefined;
      assert.equal(model.playback?.tempos?.[1],midiTempo);
      const {events,duration}=scorePerformance(projection,120,undefined,order);
      const fullTicks=order.reduce((sum,index)=>sum+1536*fraction(targets[0].voice.measures[index-1].span),0);
      // MIDI tempo output blocks change BPM but leave the ticks of each note intact.
      const ticks=t=>Math.round(t*(midiTempo ?? 120)*384/60);
      assert.equal(ticks(duration),fullTicks,name+' total performance duration');
      const playedRows=[],writtenRows=[];
      for(const [v,{stave,voice}] of targets.entries()){
        const name=voices[v];
        const ids=new Set(voice.events.map(e=>e.id));
        for(const event of events) if(ids.has(event.source)) for(const head of event.notes)
          playedRows.push([name,'P',ticks(event.time),head.pitch,ticks(event.time+head.duration)].join('\t'));
        let clock=0;
        for(const measure of voice.measures){
          for(const e of voice.events.slice(measure.start,measure.end)){
            if(e.kind==='skip')continue;
            const staff=guitar?'solo':(e.marks.find(m=>m.kind==='onStaff')?.hand??stave.name)==='upper'?'up':'down';
            const row=[name,expanded?'U':'W',clock+1536*fraction(e.at),1536*fraction(e.duration),staff];
            const keys=attacks.get(e.id).heads.map(h=>spelling(h.written,guitar));
            for(const key of e.kind==='rest'?['rest']:keys)writtenRows.push([...row,key].join('\t'));
          }
          clock+=1536*fraction(measure.span);
        }
      }
      sameRows(playedRows,reference.filter(line=>line.split('\t')[1]==='P'),name+'/'+selection+' performance');
      sameRows(writtenRows,reference.filter(line=>line.split('\t')[1]===(expanded?'U':'W')),name+'/'+selection+' written');
      console.log(name+'/'+selection+' '+projection.measures.length+' written bars, '+order.length+' played bars, '+
        playedRows.length+' played heads; '+result.diagnostics.length+' located warnings.');
    }
  }
} finally {rmSync(dir,{recursive:true,force:true});}

