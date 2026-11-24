// Compare the two remaining fugue tie diagnostics with stock VexFlow, without the importer or VexTab.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('build/importer-fidelity');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 680, height: 520 } });
  await page.setContent('<style>body,svg{background:white}body{margin:12px;font:14px system-ui}p{margin:0}</style><main></main>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  const result = await page.evaluate(() => {
    const VF = window.VexFlow;
    /** Explicit opposite stems reproduce two independent voices on the same physical stave. */
    function voice(pitches, direction, clef) {
      return {
        stem: direction === 1 ? 'up' : 'down', autoBeam: {},
        notes: pitches.map(([key, duration], i) => ({
          id: (direction === 1 ? 'upper' : 'lower') + i,
          note: { keys: [key === 'rest' ? 'b/4' : key], type: key === 'rest' ? 'r' : 'n',
            duration, stemDirection: direction, autoStem: false, clef },
        })),
      };
    }
    /** Change just the obstacle pitch between a source reading and its comparison. */
    function draw(label, clef, time, upper, lower, from, to, side) {
      const heading = document.createElement('p'), surface = document.createElement('div');
      heading.textContent = label;
      document.querySelector('main').append(heading, surface);
      const factory = new VF.Factory({ renderer: { elementId: null } }).setContext(new VF.SVGContext(surface));
      factory.getContext().resize(650, 98);
      const score = factory.EasyScore().compose({
        sheet: { width: 605, x: 12, y: 8 }, accidentals: 'key-aware', stemPolicy: 'active-voices',
        staves: [{ id: 'staff', clef, time, measures: [{ voices: [voice(upper, 1, clef), voice(lower, -1, clef)] }] }],
        continuous: { spans: [{ kind: 'tie', id: 'tie', from, to, fromHead: 0, toHead: 0, side }] },
      });
      factory.draw();
      return score.sheet.getContinuousLayout().diagnostics.map(d => d.code);
    }
    const results = [];
    for (const pitch of ['f#/5', 'f/5']) {
      const upper = [['g/5','q'], [pitch,'q'], ...['g/5','f/5','e/5','d/5','c/5','d/5','c/5','b/4'].map(key => [key,'16'])];
      const lower = [['a/4','8'], ['d/5','8'], ...['d/5','e/5','d/5','c/5'].map(key => [key,'16']),
        ['b/4','8'], ['rest','8'], ['rest','8'], ['d/4','8']];
      results.push(draw('Tenor D5 tie with ' + pitch + ' in the soprano', 'treble', '4/4', upper, lower, 'lower1', 'lower2', 'below'));
    }
    for (const pitch of ['g/3','e/3']) {
      results.push(draw('Alto G3 tie with ' + pitch + ' in the bass', 'bass', '2/4', [['g/3','q'], ['g/3','q']],
        [[pitch,'q'], ['c/3','q']], 'upper0', 'upper1', 'above'));
    }
    return results;
  });
  assert.deepEqual(result, [['CurveCollision'], [], ['CurveCollision'], []]);
  await page.screenshot({ path: resolve(output, 'native-ties.png'), fullPage: true });
  console.log('Stock VexFlow reproduced both source cases. Both comparison passages were clear.');
} finally {
  await browser.close();
}
