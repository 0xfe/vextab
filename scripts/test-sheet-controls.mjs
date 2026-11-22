// Check real control positions through viewport scroll, clipped embeds, keyboard input and disposal.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The default pair stays centered at the bottom of the visible music when the page scrolls. */
export async function testSheetControls(browser, dist) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 }, hasTouch: true });
  try {
    await page.goto(pathToFileURL(resolve(dist, 'guide/index.html')).href + '#lesson/chopin-ballade-no3');
    const sheet = page.locator('#score .vextab-sheet');
    await sheet.waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const offset of [80, 250]) {
      await sheet.evaluate((el, offset) => window.scrollTo(0, scrollY + el.getBoundingClientRect().top + offset), offset);
      await page.waitForFunction(() => {
        const score = document.querySelector('#score .vextab-sheet');
        const svg = score.querySelector('svg').getBoundingClientRect(), clip = score.closest('.vex-canvas').getBoundingClientRect();
        const play = score.querySelector('.vextab-play').getBoundingClientRect();
        const tempo = score.querySelector('.vextab-metronome').getBoundingClientRect();
        const mid = (Math.max(svg.left, clip.left, 0) + Math.min(svg.right, clip.right, innerWidth)) / 2;
        return Math.abs((play.left + tempo.right) / 2 - mid) < 2 && Math.abs(play.bottom - Math.min(innerHeight, svg.bottom) + 12) < 2;
      });
    }
    // A tap on the sheet restores faded controls even on a touch-only device.
    const preview = sheet.locator('.vextab-sheet-controls');
    await page.waitForFunction(() => !document.querySelector('#score .vextab-sheet-controls').hasAttribute('data-visible'));
    await page.touchscreen.tap(500, 225);
    await page.waitForFunction(() => document.querySelector('#score .vextab-sheet-controls').hasAttribute('data-visible'));
    assert.equal(await preview.getAttribute('data-visibility'), 'hover');
    // The nested scrollport clips both axes. The Canvas is much larger than its viewing area.
    await page.goto('about:blank');
    await page.setContent('<style>body { margin: 0; height: 1500px } #clip { margin: 80px 0 0 40px; border: 4px solid; width: 300px; height: 200px; overflow: auto } #score { width: 700px }</style>'
      + '<div id="clip"><div id="score" data-renderer="canvas" data-width="700" data-playback-controls="always" data-playback-position="top-right" data-playback-inset="16"></div></div>');
    await page.addScriptTag({ path: resolve(dist, 'vextab-div.js') });
    await page.evaluate(() => {
      const host = document.querySelector('#score');
      host.textContent = 'play { controls off } staff { :w C4 | times 12 { break system C4 | } }';
      window.embedded = new window.VexTabDiv.Div(host);
    });
    const rightPlacement = () => {
      const c = document.querySelector('#clip'), rect = c.getBoundingClientRect();
      const metro = c.querySelector('.vextab-metronome').getBoundingClientRect();
      return Math.abs(metro.right - rect.left - c.clientLeft - c.clientWidth + 16) < 2 &&
        Math.abs(metro.top - Math.max(0,rect.top + c.clientTop) - 16) < 2;
    };
    await page.waitForFunction(rightPlacement);
    await page.locator('#clip').evaluate(el => el.scrollTo(180, 320));
    await page.waitForFunction(rightPlacement);
    const tempo = page.getByRole('button', { name: 'Adjust tempo' });
    await tempo.tap();
    const step = page.getByRole('button', { name: 'Increase tempo' });
    assert.ok(await step.isVisible());
    const bounds = await step.boundingBox(), clip = await page.locator('#clip').boundingBox();
    assert.ok(bounds.x >= clip.x && bounds.x + bounds.width <= clip.x + clip.width);
    assert.ok(bounds.y > (await tempo.boundingBox()).y);
    await step.focus();
    await page.keyboard.press('Escape');
    assert.ok(await tempo.evaluate(el => document.activeElement === el));
    await page.evaluate(() => window.embedded.dispose());
    assert.equal(await page.locator('.vextab-sheet-controls').count(), 0);
    // A toolbar and several small, differently placed controls can coexist on the same page.
    const results = await page.evaluate(() => {
      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0;display:grid;grid-template-columns:repeat(3,220px);gap:8px';
      const { Div, Player, parseScore } = window.VexTabDiv;
      const editors = [];
      const corners = [];
      for (const vertical of ['top', 'bottom']) for (const horizontal of ['left', 'center', 'right']) {
        const host = document.body.appendChild(document.createElement('div'));
        host.dataset.width = '200';
        host.style.zoom = '.9';
        host.textContent = 'play { controls off } staff { :w C4 | }';
        editors.push(new Div(host, { playbackControls: { visibility: 'always', position: vertical + '-' + horizontal, inset: 10 } }));
        const box = host.querySelector('.vextab-sheet').getBoundingClientRect();
        const play = host.querySelector('.vextab-play').getBoundingClientRect(), metro = host.querySelector('.vextab-metronome').getBoundingClientRect();
        const dy = vertical === 'top' ? play.top - box.top : box.bottom - play.bottom;
        const dx = horizontal === 'left' ? play.left - box.left : horizontal === 'right' ? box.right - metro.right :
          Math.abs(play.left + metro.right - box.left - box.right) / 2;
        corners.push(Math.abs(dy - 9) < 2 && Math.abs(dx - (horizontal === 'center' ? 0 : 9)) < 2);
      }
      const disabled = document.body.appendChild(document.createElement('div'));
      const source = 'play { controls always } staff { :w C4 | }';
      disabled.textContent = source;
      editors.push(new Div(disabled, { player: false }));
      const toolbar = document.body.appendChild(document.createElement('div'));
      const player = new Player(parseScore(source), { controls: toolbar });
      player.render();
      const manual = toolbar.querySelectorAll('button').length, hidden = disabled.querySelectorAll('button').length;
      player.dispose();
      editors.forEach(editor => editor.dispose());
      return { corners, manual, hidden, leftover: document.querySelectorAll('.vextab-sheet-controls, .vextab-playback-controls').length };
    });
    assert.deepEqual(results, { corners: Array(6).fill(true), manual: 1, hidden: 0, leftover: 0 });
  } finally { await page.close(); }
}
