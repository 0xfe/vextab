// Historical source forms and the bounded failure cases that protect repeat navigation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {importLilyPond as read} from 'vextab-import/lilypond';

const ly=String.raw;
const expressive={targetProfile:'expressive'};

test('historical language includes and numbered bar checks retain scoped meaning',()=>{
  const source=ly`\include "deutsch.ly" { h'1 | \barNumberCheck #2 b'1 }`;
  const result=read(source,expressive);
  assert.equal(result.status,'exact');
  assert.match(result.documents[0].text,/B4 \|[\s\S]*Bb4/);
  const mismatch=source.replace('#2','#4');
  const failure=read(mismatch,expressive).diagnostics.at(-1);
  assert.equal(failure.code,'timing');
  assert.equal(mismatch.slice(...failure.range),'4');
  const overriding=read(ly`\include "deutsch.ly" { b'1 }`,{...expressive,includes:{'deutsch.ly':ly`\language "english"`}});
  assert.match(overriding.documents[0].text,/B4/);
});

test('only literal historical staff size can be omitted',()=>{
  const source=ly`#(set-global-staff-size 20) { c'1 }`;
  const r=read(source,{...expressive,mode:'partial'});
  assert.equal(r.status,'partial');
  assert.equal(source.slice(...r.diagnostics[0].range),'#(set-global-staff-size 20)');
  for (const expr of ['#(set-global-staff-size (custom))','#(set-global-staff-size 20 extra)','#(run 20)'])
    assert.equal(read(expr+" { c'1 }",{...expressive,mode:'partial'}).status,'failed');
});

test('head-specific ties split across alternate endings while unfolded heads keep one destination',()=>{
  const body=ly`{ \repeat volta 2 { <c'~ e'>1 } \alternative { { <c' g'>1 } { <c' f'>1 } } }`;
  const r=read(body,expressive);
  assert.equal(r.status,'exact');
  assert.equal(r.target.minimumVersion,'6.5.0');
  assert.equal((r.documents[0].text.match(/tieStart/g)??[]).length,2);
  assert.equal((r.documents[0].text.match(/tieEnd/g)??[]).length,2);
  const u=read(ly`\unfoldRepeats `+body,expressive);
  assert.equal(u.status,'exact');
  assert.equal((u.documents[0].text.match(/tieStart/g)??[]).length,2);
  assert.equal((u.documents[0].text.match(/tieEnd/g)??[]).length,2);
  assert.equal(u.target.minimumVersion,'6.4.0');
  assert.doesNotMatch(u.documents[0].text,/volta/);
});

test('a final ending may complement the opening pickup only on explicit fragment import',()=>{
  const body=ly`{ \partial 4 c'4 \repeat volta 2 { c'1 } \alternative { { d'1 } { e'2. } } }`;
  assert.equal(read(body,expressive).status,'failed');
  const options={...expressive,finalFragment:true};
  const result=read(body,options);
  assert.equal(result.status,'exact');
  assert.match(result.documents[0].text,/ending 2 \{ fragment \{/);
  assert.equal(read(body.slice(0,-1)+" f'1 }",options).status,'failed');
  assert.equal(read(body.replace("e'2.","e'2"),options).status,'failed');
});

test('located physical constraint conflicts retain both source marks only in partial mode',()=>{
  const source=ly`{ b1-0\4 }`;
  const options={...expressive,guitar:true};
  assert.equal(read(source,options).status,'failed');
  const result=read(source,{...options,mode:'partial'});
  assert.equal(result.status,'partial');
  assert.match(result.diagnostics[0].message,/finger zero conflicts/);
  assert.match(result.documents[0].text,/9\/4\[write B4, finger 0 left\]/);
});


test('anonymous piano staves follow source order and only named staves are change targets',()=>{
  const twoHands=ly`\new PianoStaff << \new Staff { c''1 } \new Staff { c1 } >>`;
  const result=read(twoHands,expressive);
  assert.equal(result.status,'exact');
  assert.match(result.documents[0].text,/piano \w+ \{[\s\S]*upper \{[\s\S]*C5[\s\S]*lower \{[\s\S]*C3/);
  const mixed=ly`\new PianoStaff << \new Staff { c''2 \change Staff = "left" c'2 } \new Staff = "left" { c1 } >>`;
  const change=read(mixed,expressive);
  assert.equal(change.status,'exact');
  assert.match(change.documents[0].text,/C4\[onStaff lower\]/);
  const unknown=mixed.replace('= "left" c', '= "upper" c');
  for(const mode of ['strict','partial']){
    const failure=read(unknown,{...expressive,mode});
    assert.equal(failure.status,'failed');
    assert.match(failure.diagnostics.at(-1).message,/Unknown display staff upper/);
  }
});

test('historical upper ornament scripts have located loss diagnostics and preserve note length',()=>{
  const source=ly`{ b'2.^\downmordent c''8_\prall d''8 }`;
  assert.equal(read(source,expressive).status,'failed');
  const result=read(source,{...expressive,mode:'partial'});
  assert.equal(result.status,'partial');
  assert.deepEqual(result.diagnostics.map(d=>source.slice(...d.range)),[ly`^\downmordent`,ly`_\prall`]);
  assert.match(result.documents[0].text,/:h\. B4 :8 C5 D5/);
});

test('stem, tie and slur directions change independently and reset on their source commands',()=>{
  const source=ly`{ \voiceOne c'8(~ \stemDown c'8)~ \tieNeutral c'8~ \stemNeutral c'8 \slurDown d'8( e'8) \oneVoice f'8( g'8) }`;
  assert.equal(read(source,expressive).status,'failed');
  const r=read(source,{...expressive,mode:'partial'});
  assert.equal(r.target.minimumVersion,'6.6.0');
  assert.deepEqual(r.diagnostics.map(d=>source.slice(...d.range)),[ly`\voiceOne`,ly`\oneVoice`]);
  assert.deepEqual(r.documents[0].text.match(/stem (?:up|down)/g),['stem up','stem down','stem down']);
  for(const [mark,expected] of [['tieStart',['above','above',undefined]],['slurStart',['above','below',undefined]]]){
    const pattern=new RegExp(mark+' \\w+(?: (above|below))?','g');
    assert.deepEqual([...r.documents[0].text.matchAll(pattern)].map(m=>m[1]),expected);
  }
  const scoped=read(ly`\new Staff { \stemDown c'4 \new Voice { d'8 \stemUp e'8 } f'4 r4 }`,expressive);
  assert.equal(scoped.status,'exact');
  assert.match(scoped.documents[0].text,/:q C4\[stem down\] :8 D4 E4\[stem up\] :q F4\[stem down\] rest/);
  assert.match(read(ly`{ \stemDown c'1 r1 }`,expressive).documents[0].text,/C4\[stem down\] \|\s+:w rest \|/);
});

test('polyphonic overrides belong to their branch and regular slur commands leave phrasing slurs alone',()=>{
  const source=ly`\new Staff << \new Voice { \voiceThree \slurDown c'4\(( d'4) e'2\) } \new Voice { \voiceFour f'2~ f'2 } >>`;
  const result=read(source,{...expressive,mode:'partial'});
  assert.equal(result.status,'partial');
  const text=result.documents[0].text;
  assert.match(text,/stem up, slurStart slur1 above, slurStart slur2 below/);
  assert.match(text,/tieStart tie\d+ below, stem down/);
  assert.equal((text.match(/stem up/g)??[]).length,3);
  assert.equal((text.match(/stem down/g)??[]).length,2);
});

test('ties keep the outgoing side at each written and unfolded ending, on its source head only',()=>{
  for(const tied of ["<c'~ e'>1","<c' e'>1~"]){
    const source=ly`{ \tieDown \repeat volta 2 { `+tied+ly` } \alternative { { \tieUp <c' g'>1 } { \tieNeutral <c' f'>1 } } }`;
    for(const variant of [source,ly`\unfoldRepeats `+source]){
      const r=read(variant,expressive);
      assert.equal(r.status,'exact');
      assert.equal(r.target.minimumVersion,'6.6.0');
      assert.equal((r.documents[0].text.match(/tieStart tie\d+ below/g)??[]).length,2);
      assert.doesNotMatch(r.documents[0].text,/tieEnd tie\d+ (?:above|below)|tieStart tie\d+ above/);
    }
  }
});

test('manual beams diagnose unsupported cross-bar members without losing the notes in partial mode',()=>{
  const local=read(ly`{ \time 2/4 c'8[ r8 d'8] e'8 }`,expressive);
  assert.equal(local.status,'exact');
  assert.equal(local.target.minimumVersion,'6.4.0');
  for(const source of [
    ly`{ \time 2/4 c'4. d'8[ | r8 e'8] f'4 }`,
    ly`{ \time 2/4 c'4. d'8[ | \stemDown e'8 \stemUp f'8] g'4 }`,
    ly`\new TabStaff { \time 2/4 c'4. d'8[ | e'8 f'8] g'4 }`,
    ly`\new PianoStaff << \new Staff = "right" { \time 2/4 c'4. d'8[ | \change Staff = "left" e'8 f'8] g'4 } \new Staff = "left" { \time 2/4 c2 c2 } >>`,
  ]){
    assert.equal(read(source,expressive).status,'failed');
    const r=read(source,{...expressive,mode:'partial'});
    assert.equal(r.status,'partial',JSON.stringify(r.diagnostics));
    assert.equal(source.slice(...r.diagnostics[0].range),']');
    assert.match(r.diagnostics[0].message,/Manual beam omitted because/);
    assert.doesNotMatch(r.documents[0].text,/beamStart|beamEnd/);
  }
});


test('neutral polyphony uses pitch-driven stems and the numbered voice separator sets distinct overrides',()=>{
  const parallel=ly`\new Staff << \new Voice { c'2 d'2 } \new Voice { g2 a2 } >>`;
  const plain=read(parallel,expressive);
  assert.equal(plain.status,'exact');
  assert.match(plain.documents[0].text,/layout \{ stemPolicy pitch \}/);
  assert.equal(plain.target.minimumVersion,'6.6.0');
  assert.doesNotMatch(read(ly`{ \stemNeutral c'2 d'2 }`,expressive).documents[0].text,/stemPolicy/);
  const split=ly`{ << { c'2~ c'2 } \\ { g2 \stemNeutral a2 } >> }`;
  const numbered=read(split,expressive);
  assert.equal(numbered.status,'exact');
  const resting=split.replace('g2','r2');
  const omitted=read(resting,{...expressive,mode:'partial'});
  assert.equal(omitted.status,'partial');
  assert.equal(resting.slice(...omitted.diagnostics[0].range),'r2');
  assert.match(numbered.documents[0].text,/stemPolicy pitch/);
  assert.match(numbered.documents[0].text,/C4\[tieStart tie\d+ above, stem up\]/);
  assert.match(numbered.documents[0].text,/G3\[stem down\] A3/);
});
