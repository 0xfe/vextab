// Check real control positions through viewport scroll, clipped embeds, keyboard input and disposal.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Incoming carousel slides cross a clipped stage while their layout sizes stay constant. */
async function checkSlidingSheet(page) {
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="stage"><div id="slide"><div id="score"></div></div></div>';
    document.querySelector('#stage').style.cssText = 'width:480px;overflow:hidden;margin:0 auto';
    document.querySelector('#slide').style.cssText = 'width:440px;margin:0 auto';
    const host = document.querySelector('#score');
    host.dataset.width = '440';
    host.textContent = 'play { controls always } staff { :w C4 | }';
    window.embedded = new window.VexTabDiv.Div(host);
    window.scrollTo(0, 0);
  });
  // The panel belongs in the middle of the intersection between the slide and the stage.
  const centered = () => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const sheet = document.querySelector('.vextab-sheet').getBoundingClientRect();
    const panel = document.querySelector('.vextab-control-panel').getBoundingClientRect();
    const left = Math.max(sheet.left, stage.left), right = Math.min(sheet.right, stage.right);
    return Math.abs(panel.left + panel.right - left - right) < 3;
  };
  // Revisit the same sheet from both directions, including an interrupted slide.
  for (const direction of [1, -1]) {
    await page.evaluate(async direction => {
      const slide = document.querySelector('#slide');
      const animation = window.slideAnimation = slide.animate([
        { transform: 'translateX(' + direction * 110 + '%)' }, { transform: 'translateX(0)' },
      ], { duration: 300, easing: 'linear' });
      await animation.ready;
      // Hold a known clipped position so the assertion does not race the compositor.
      animation.pause();
      animation.currentTime = 170;
    }, direction);
    await page.waitForFunction(centered);
    await page.evaluate(async direction => {
      const animation = window.slideAnimation;
      if (direction < 0) animation.cancel();
      else {
        animation.play();
        await animation.finished;
      }
    }, direction);
    await page.waitForFunction(centered);
  }
  await page.evaluate(() => window.embedded.dispose());
}

/** Both control styles follow the visible music and remain operable during scroll and resize. */
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
        const panel = score.querySelector('.vextab-control-panel').getBoundingClientRect();
        const left = Math.max(svg.left, clip.left, 0), right = Math.min(svg.right, clip.right, innerWidth);
        return Math.abs(panel.left + panel.right - left - right) < 3 &&
          Math.abs(Math.min(svg.bottom, clip.bottom, innerHeight) - panel.bottom - 12) < 2;
      });
    }
    // A tap on the sheet restores faded controls even on a touch-only device.
    const preview = sheet.locator('.vextab-sheet-controls');
    await page.waitForFunction(() => !document.querySelector('#score .vextab-sheet-controls').hasAttribute('data-visible'));
    await page.touchscreen.tap(500, 225);
    await page.waitForFunction(() => document.querySelector('#score .vextab-sheet-controls').hasAttribute('data-visible'));
    assert.equal(await preview.getAttribute('data-visibility'), 'hover');
    assert.equal(await preview.getAttribute('data-size'), 'large');
    const source = page.locator('#score textarea');
    await source.fill((await source.inputValue()).replace('play {', 'play { controlSize auto'));
    await source.press('Control+Enter');
    await sheet.evaluate(el => el.scrollIntoView({ block: 'start' }));
    // Height alone cannot shrink the controls while the wide piano systems still scroll sideways.
    const scoreHeight = (await sheet.boundingBox()).height;
    const tall = Math.ceil(scoreHeight / .70);
    await page.setViewportSize({ width: 1024, height: tall });
    assert.equal(await preview.getAttribute('data-size'), 'large');
    await page.setViewportSize({ width: 1440, height: tall });
    await sheet.locator('[data-size="mini"]').waitFor({ state: 'attached' });
    await page.setViewportSize({ width: 1024, height: 600 });
    await sheet.locator('[data-size="large"]').waitFor({ state: 'attached' });
    // The nested scrollport clips both axes. The Canvas is much larger than its viewing area.
    await page.goto('about:blank');
    await page.setContent('<style>body { margin: 0; height: 1500px } #clip { margin: 80px 0 0 40px; border: 4px solid; width: 300px; height: 200px; overflow: auto } #score { width: 700px }</style>'
      + '<div id="clip"><div id="score" data-renderer="canvas" data-width="700" data-playback-controls="always" data-playback-size="large" data-playback-position="top-right" data-playback-inset="16"></div></div>');
    await page.addScriptTag({ path: resolve(dist, 'vextab-div.js') });
    await page.evaluate(() => {
      const host = document.querySelector('#score');
      host.textContent = 'play { controls off controlSize mini } staff { :w C4 | times 12 { break system C4 | } }';
      // Hold the playback clock on a chosen system while the scroll animation runs in real time.
      window.scoreClock = 0;
      window.embedded = new window.VexTabDiv.Div(host, { playback: { open: () => ({
        get currentTime() { return window.scoreClock; }, playNote() {}, stop() {},
      }) } });
    });
    const rightPlacement = () => {
      const c = document.querySelector('#clip'), rect = c.getBoundingClientRect();
      const panel = c.querySelector('[data-size="large"] .vextab-control-panel')?.getBoundingClientRect();
      return panel && Math.abs(panel.right - rect.left - c.clientLeft - c.clientWidth + 16) < 2 &&
        Math.abs(panel.top - Math.max(0,rect.top + c.clientTop) - 16) < 2;
    };
    await page.waitForFunction(rightPlacement);
    await page.locator('#clip').evaluate(el => el.scrollTo(180, 320));
    await page.waitForFunction(rightPlacement);
    const tempo = page.getByRole('button', { name: 'Adjust tempo' });
    await tempo.tap();
    const step = page.getByRole('button', { name: 'Increase tempo' });
    assert.ok(await step.isVisible());
    // Compare settled layout after the tempo buttons slide into place.
    await step.evaluate(el => Promise.all(el.parentElement.getAnimations().map(animation => animation.finished)));
    const bounds = await step.boundingBox(), clip = await page.locator('#clip').boundingBox();
    assert.ok(bounds.x >= clip.x && bounds.x + bounds.width <= clip.x + clip.width);
    const panel = await page.locator('.vextab-control-panel').boundingBox();
    assert.ok(bounds.y >= panel.y && bounds.y + bounds.height <= panel.y + panel.height);
    assert.ok(bounds.y + bounds.height <= (await tempo.boundingBox()).y + 26, 'adjustments sit above the BPM');
    await step.focus();
    await page.keyboard.press('Escape');
    assert.ok(await tempo.evaluate(el => document.activeElement === el));
    const follow = page.getByRole('button', { name: 'Auto-scroll' });
    assert.equal(await follow.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForSelector('.vextab-playback-ink line', { state: 'attached' });
    const visibleRow = () => {
      const bar = document.querySelector('.vextab-playback-ink line').getBoundingClientRect();
      const clip = document.querySelector('#clip').getBoundingClientRect();
      return bar.top >= clip.top && bar.bottom <= clip.bottom;
    };
    await page.waitForFunction(visibleRow);
    const firstScroll = await page.locator('#clip').evaluate(el => el.scrollTop);
    await page.evaluate(() => { window.scoreClock = 8; });
    await page.waitForFunction(first => document.querySelector('#clip').scrollTop > first + 40, firstScroll);
    await page.waitForFunction(visibleRow);
    await follow.press('Space');
    assert.equal(await follow.getAttribute('aria-pressed'), 'false');
    const pausedScroll = await page.locator('#clip').evaluate(el => el.scrollTop);
    await page.evaluate(() => { window.scoreClock = 16; });
    await page.waitForFunction(() => Number(document.querySelector('.vextab-playback-ink line').getAttribute('y1')) > 500);
    assert.equal(await page.locator('#clip').evaluate(el => el.scrollTop), pausedScroll);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.evaluate(() => window.embedded.dispose());
    assert.equal(await page.locator('.vextab-sheet-controls').count(), 0);
    await checkSlidingSheet(page);
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
        host.textContent = 'play { controls off controlSize large } staff { :w C4 | }';
        editors.push(new Div(host, { playbackControls: { size: 'mini', visibility: 'always', position: vertical + '-' + horizontal, inset: 10 } }));
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
