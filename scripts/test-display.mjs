// Exercise the packaged display at device scale two and the original cold-load triplet.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Compare the numeral's actual font ink with the filled beam at the same horizontal positions. */
function tripletClearances() {
  const score = document.querySelector('#score svg');
  const canvas = document.createElement('canvas').getContext('2d');
  const beams = [...score.querySelectorAll('.vf-beam path')].filter(path => /z$/i.test(path.getAttribute('d')));
  return [...score.querySelectorAll('.vf-tuplet text')].map(label => {
    const style = getComputedStyle(label);
    canvas.font = style.fontSize + ' ' + style.fontFamily;
    const ink = canvas.measureText(label.textContent);
    const x = label.x.baseVal[0].value;
    const y = label.y.baseVal[0].value;
    let gap = Infinity;
    for (const beam of beams) {
      const bounds = beam.getBBox();
      const left = Math.max(bounds.x, x - ink.actualBoundingBoxLeft);
      const right = Math.min(bounds.x + bounds.width, x + ink.actualBoundingBoxRight);
      for (let column = left; column <= right; column++) {
        for (let row = bounds.y; row <= bounds.y + bounds.height; row += 0.5) {
          if (beam.isPointInFill(new DOMPoint(column, row))) {
            gap = Math.min(gap, Math.max(y - ink.actualBoundingBoxAscent - row, row - y - ink.actualBoundingBoxDescent));
          }
        }
      }
    }
    return gap;
  });
}

export async function testDisplay(browser, dist, engine) {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  try {
    await page.goto(pathToFileURL(resolve(dist, 'guide/triplets.html')).href);
    const score = page.locator('#score svg');
    await score.waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (engine === 'chromium') {
      const cold = await page.evaluate(tripletClearances);
      assert.equal(cold.length, 2);
      assert.ok(cold.every(gap => Number.isFinite(gap) && gap >= 2), 'Numeral to beam clearance: ' + cold);
      const editor = page.locator('#score textarea');
      const original = await editor.inputValue();
      await editor.evaluate((input, updated) => {
        const host = input.closest('#score');
        host.addEventListener('vextab-render', () => host.dataset.edited = 'yes', { once:true });
        input.value = updated;
        input.dispatchEvent(new Event('input', { bubbles:true }));
      }, original + ' ');
      await page.locator('#score[data-edited="yes"]').waitFor();
      assert.deepEqual(await page.evaluate(tripletClearances), cold);
    }
    await page.goto('about:blank');
    await page.setContent('<div class="vex-tabdiv" width="400">tabstave\nnotes :q 0/1 12/2</div>');
    await page.addScriptTag({ path: resolve(dist, 'vextab-div.js') });
    const canvas = page.locator('.vex-tabdiv canvas');
    await canvas.waitFor();
    const size = await canvas.evaluate(n => [n.width, n.height, n.clientWidth, n.clientHeight, devicePixelRatio]);
    assert.equal(size[4], 2);
    assert.equal(size[0], size[2] * 2);
    assert.equal(size[1], size[3] * 2);
  } finally { await page.close(); }
}
