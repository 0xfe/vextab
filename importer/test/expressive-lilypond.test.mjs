// Exercise the public expressive profile using source notation, including strict failures with source ranges.
import assert from 'node:assert/strict';
import test from 'node:test';
import { importLilyPond } from 'vextab-import/lilypond';

const ly=String.raw;
function convert(source,options={}) {
  const result=importLilyPond(source,{targetProfile:'expressive',...options});
  assert.equal(result.status,'exact',JSON.stringify(result.diagnostics));
  const text=result.documents[0].text;
  return {text};
}

test('named parallel lyric and harmony lanes attach to measured attacks, including melismas',()=>{
  const source=ly`verse = \lyricmode { Sing __ a -- gain }
    chart = \chordmode { c2:maj7/e g:7 }
    \score { << \new Lyrics = "one" \lyricsto "singer" \verse
      \new Voice = "singer" { c'4( d') e' f' }
      \new ChordNames \chart >> }`;
  const {text}=convert(source);
  assert.match(text,/C4\[verse \w+ "Sing" extend=1, harmony C "maj7" bass E/);
  assert.match(text,/E4\[verse \w+ "a" hyphen, harmony G "7"/);
  assert.match(text,/F4\[verse \w+ "gain"/);
  const two=convert(ly`{ c'2 d' } \addlyrics { Oui non } \addlyrics { Yes no }`).text;
  assert.match(two,/C4\[verse verse1 "Oui", verse verse2 "Yes"/);
});

test('default kit preserves GM keys, manual beams, written line and simultaneous hits',()=>{
  const {text}=convert(ly`\new DrumStaff \drummode { <bd hh>8[ hh] sn4 q2 }`);
  assert.match(text,/drums \{/);
  assert.match(text,/"bassdrum" line 1.5 head normal stem \w+ midi 36/);
  assert.match(text,/"hihat" line 4.5 head cross stem \w+ midi 42/);
  assert.match(text,/"snare" line 3.5 head normal stem \w+ midi 38/);
  assert.match(text,/\(hit1 hit2\)\[beamStart \w+\] hit2\[beamEnd \w+\]/);
});

test('guitar resolves literal and built-in tunings, capo, physical strings, fingering and a connected slide',()=>{
  const music=ly`{ fis,2-2\6\glissando g,2\6 }`;
  const {text}=convert(ly`\new TabStaff \with { stringTunings = #guitar-drop-d-tuning } `+music,{guitar:{capo:2}});
  assert.match(text,/tuning \(E5 B4 G4 D4 A3 D3\)\n  capo 2/);
  assert.match(text,/2\/6\[.*finger 2 left/);
  assert.match(text,/3\/6\[.*slide/);
  const open=convert(ly`\new TabStaff { \set TabStaff.stringTunings = \stringTuning <d, g, d g b d'> d,1\6 }`);
  assert.match(open.text,/tuning \(D5 B4 G4 D4 G3 D3\)/);
  assert.match(open.text,/0\/6\[write D3\]/);
});

test('before and after grace preserve their principal and selected time fraction',()=>{
  const {text}=convert(ly`{ \acciaccatura d'8 c'4 \afterGrace 2/3 d'2 { e'8 } f'4 }`);
  assert.match(text,/C4\[grace before slashed \(D4\)\]/);
  assert.match(text,/D4\[grace after steal=1\/3 \(E4\)\]/);
});

test('partial chord ties, crossing slurs and a pedal release remain separate',()=>{
  const {text}=convert(ly`{ <c'~ e'>4(\sustainOn <c' g'>\( f') d'\)\sustainOff }`);
  assert.match(text,/C4\[tieStart (\w+)\] E4/);
  assert.match(text,/C4\[tieEnd (\w+)\] G4/);
  assert.equal([...text.matchAll(/slurStart/g)].length,2);
  assert.match(text,/pedal up onset/);
});

test('expanded repeat copies have fresh span and tie identities',()=>{
  const {text}=convert(ly`\unfoldRepeats { \repeat volta 2 { c'4( d') e'~ e' } }`);
  const ids=[...text.matchAll(/(?:tieStart|slurStart) (\w+)/g)].map(m=>m[1]);
  assert.equal(ids.length,4);
  assert.equal(new Set(ids).size,4);
});

test('unrepresentable strings, drum keys and protected tuning expressions identify their source',()=>{
  for (const [source,word] of [
    [ly`\new TabStaff { c,1\1 }`,'c,'],
    [ly`\drummode { unknown1 }`,'unknown'],
    [ly`\new TabStaff \with { stringTunings = #(build-tuning) } { c1 }`,'{ stringTunings'],
    [ly`\score { << \new Voice = "solo" { c'1 } \new Lyrics \lyricsto "absent" { Hi } >> }`,'\\new']
  ]) {
    for (const mode of ['strict','partial']) {
      const r=importLilyPond(source,{targetProfile:'expressive',mode});
      assert.equal(r.status,'failed',JSON.stringify(r));
      assert.ok(source.slice(...r.diagnostics.at(-1).range).startsWith(word));
    }
  }
});


test('addlyrics follows the immediate staff and preserves bare Unicode syllables',()=>{
  const source=ly`<< \new Staff = "one" { c'1 } \addlyrics { été }
    \new Staff = "two" { d'1 } \addlyrics { sì } >>`;
  const {text}=convert(source);
  assert.match(text,/C4\[verse \w+ "été"\]/);
  assert.match(text,/D4\[verse \w+ "sì"\]/);
});

test('open and closed hi-hat preserve their pitches in partial mode and locate the playing symbols',()=>{
  const source=ly`\drummode { hho2 hhc }`;
  const result=importLilyPond(source,{targetProfile:'expressive',mode:'partial'});
  assert.equal(result.status,'partial');
  assert.deepEqual(result.diagnostics.map(d=>source.slice(...d.range)),['hho','hhc']);
  const text=result.documents[0].text;
  assert.match(text,/"openhihat".*midi 46/);
  assert.match(text,/"closedhihat".*midi 42/);
});
