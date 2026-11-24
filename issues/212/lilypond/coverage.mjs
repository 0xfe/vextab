// Bounded M5 feature probes. An out-of-profile probe must return a located unsupported error and zero documents.
import assert from 'node:assert/strict';
import {importLilyPond} from '../../../importer/dist/lilypond.js';
const ly=String.raw;
const groups=[
  ['form',[
    ['exact',ly`{ \repeat volta 2 { c'1 } \alternative { { d'1 } { e'1 } } }`],
    ['exact',ly`{ \repeat volta 2 { c'1~ } \alternative { { c'1 } { c'1 } } }`],
    ['exact',ly`{ \partial 4 c'4 \repeat volta 2 { c'1 } \alternative { { d'1 } { e'2. } } }`],
    ['failed',ly`{ \repeat volta 2 { c'1 } \alternative { { d'1 } } }`],
    ['out-of-profile',ly`{ \repeat segno 2 { c'1 } }`],
  ]],
  ['historical literals',[
    ['exact',ly`\include "deutsch.ly" { h'1 }`],
    ['exact',ly`{ c'1 \barNumberCheck #2 d'1 }`],
    ['partial',ly`#(set-global-staff-size 20) { c'1 }`],
    ['partial',ly`{ c'1 \break d'1 }`],
    ['partial',ly`{ b4\rest c'2. }`],
    ['failed',ly`{ c'1 \barNumberCheck #3 d'1 }`],
    ['out-of-profile',ly`#(staff-size-from-file) { c'1 }`],
  ]],
  ['declaration',[
    ['exact',ly`\version "2.14.2" { c'1 }`],
    ['exact',ly`\version "2.16.1" { c'1 }`],
    ['out-of-profile',ly`\version "2.10.0" { c'1 }`],
  ]],
  ['invalid input and limits',[
    ['failed',ly`{ <c' e'`],['failed',ly`\include "missing.ly" { c'1 }`],
    ['failed',ly`{ \repeat unfold 33 { c'1 } }`],
  ]],
];
for(const [feature,cases] of groups){
  const counts={exact:0,partial:0,failed:0,'out-of-profile':0};
  for(const [expected,source] of cases){
    const r=importLilyPond(source,{mode:'partial',targetProfile:'expressive',finalFragment:true});
    assert.equal(r.status,expected==='out-of-profile'?'failed':expected,source);
    if(r.status==='failed'){
      assert.equal(r.documents.length,0);assert.ok(r.diagnostics.at(-1).range[1]>r.diagnostics.at(-1).range[0]);
      if(expected==='out-of-profile') assert.equal(r.diagnostics.at(-1).code,'unsupported');
    }
    if(r.status==='partial') assert.ok(r.diagnostics.length);
    counts[expected]++;
  }
  console.log(feature,cases.length,counts);
}

