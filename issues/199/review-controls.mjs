// Isolate the M4 review findings using only the published VexFlow browser bundle.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('build/vt6-m4/review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 620 } });
  await page.setContent('<style>body{margin:0;background:white}div{width:520px}</style>' +
    '<div id="sharp"></div><div id="tab"></div><div id="unison"></div><div id="above"></div><div id="below"></div><div id="mixed"></div><div id="moved"></div>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  const results = await page.evaluate(async () => {
    const VF = window.VexFlow;
    await VF.loadFonts('Bravura','Academico');
    await document.fonts.ready;
    function factory(elementId, height = 150) {
      return new VF.Factory({ renderer: { elementId, width: 520, height } });
    }
    const sharp = factory('sharp'), stave = sharp.Stave().addClef('treble');
    const notes = [0, -4].map(offset => sharp.StaveNote({ keys: ['d#/5'], duration: 'q' })
      .addModifier(new VF.FretHandFinger('2').setPosition(VF.Modifier.Position.LEFT).setOffsetX(offset))
      .addModifier(new VF.Accidental('#')));
    VF.Formatter.FormatAndDraw(sharp.getContext(), stave, notes);
    stave.draw();
    let tabError;
    try {
      const f = factory('tab'), staff = f.TabStave();
      const note = f.TabNote({ positions: [{ str: 2, fret: 3 }], duration: 'q' });
      note.addModifier(new VF.FretHandFinger('2'), 0);
      VF.Formatter.FormatAndDraw(f.getContext(), staff, [note]);
    } catch (error) { tabError = String(error); }

    const f = factory('unison');
    const c = f.EasyScore().compose({ accidentals: 'key-aware', continuous: {}, staves: [{
      id: 'staff', time: '1/4', key: 'Bm', measures: [{ voices: ['up','down'].map((stem,i) => ({
        stem, notes: [{ id: 'e' + i, note: { duration: 'q', keys: ['e#/5'] } }],
      })) }],
    }] });
    f.draw();
    const unisonSigns = [0,1].map(i => c.getNote('e'+i).getModifiersByType(VF.Accidental.CATEGORY).length);

    function tabTie(side) {
      const f = factory(side);
      const tab = (id, str, fret, duration) => ({ id, tab: { positions: [{str,fret}], duration }, drawStem: false });
      const c = f.EasyScore().compose({ sheet: {width:480}, staves: [{ id:'g', kind:'tab', time:'3/4',
        measures:[0,1].map(i => ({voices:[
          { notes: [tab('b'+i,5,2,'h'),tab('b-end'+i,5,2,'q')] },
          { notes: Array.from({length:6}, (_,j) => tab('v'+i+'-'+j, j===2 ? 4 : 2, 3,'8')) },
        ]})) }], continuous:{spans:[{kind:'tie',id:'hold',from:'b0',to:'b-end0',side}]} });
      f.draw();
      const fragment=c.sheet.getContinuousLayout().fragments[0];
      return { side, rise:fragment.rise, above:fragment.above, diagnostics:c.sheet.getContinuousLayout().diagnostics };
    }

    function piano(moveRests) {
      const f = factory(moveRests ? 'moved' : 'mixed', 345);
      const upper = ['r/4','ab/2','cb/3','ab/3','r/4','ab/3','cb/4','ab/4'].map((key,i) => {
        const rest = key === 'r/4';
        return { id:'u'+i, ...((moveRests || !rest) && {stave:'lower'}),
          note:{keys:[key],duration:'16',clef:rest?'treble':'bass',type:rest?'r':'n',...(moveRests && rest && {restLine:4})} };
      });
      const lower = ['ab/1','r/4','ab/2','r/4'].map(key => ({
        note:{keys:[key],duration:'8',clef:'bass',type:key==='r/4'?'r':'n',...(moveRests && key==='r/4' && {restLine:0})},
      }));
      const staff=(id,clef,notes,stem) => ({id,clef,key:'Ab',time:'2/4',measures:[{voices:[{
        stem:moveRests?stem:'auto', notes, autoBeam:{beamRests:!moveRests,...(moveRests && {stemDirection:stem==='up'?1:-1})},
      }]}]});
      const comp=f.EasyScore().compose({sheet:{width:480}, accidentals:'key-aware', staves:[staff('upper','treble',upper,'up'),staff('lower','bass',lower,'down')],continuous:{}});
      f.draw();
      return comp.sheet.getContinuousLayout().diagnostics;
    }
    return {tabError,unisonSigns,ties:['above','below'].map(tabTie),piano:[piano(false),piano(true)]};
  });
  for (const id of ['sharp','unison','above','below','mixed','moved']) {
    await page.locator('#'+id).screenshot({path:resolve(output,id+'.png')});
  }
  await writeFile(resolve(output,'native.json'),JSON.stringify(results,null,2));
  console.log(results);
} finally { await browser.close(); }
