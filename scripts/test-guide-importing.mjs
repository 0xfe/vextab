// Exercise the optional live readers and the editable imported scores in the offline guide.
import assert from 'node:assert/strict';

/** The website serves independent ESM converters. The checkout guide carries the worked outputs. */
export async function testGuideImporting(page, url, live = false) {
  const calls = [];
  const track = request => { if (new URL(request.url()).pathname.includes('/runtime/import/')) calls.push(request.url()); };
  page.on('request', track);
  try {
    await page.goto(url + '#importing');
    const index = page.locator('#index');
    const links = index.locator('.chapter-list a');
    assert.deepEqual(await links.evaluateAll(items => items.map(a => a.hash)),
      ['lilypond','musicxml','integration','limitations','gallery'].map(id => '#importing/' + id));
    for (const [name,format] of [['LilyPond','lilypond'],['MusicXML','musicxml']]) {
      await page.goto(url + '#importing/' + format);
      const input = page.getByRole('textbox', {name:name + ' source',exact:true});
      const output = index.locator('.chapter-example textarea');
      await index.locator('.chapter-example svg').waitFor();
      assert.equal(await page.locator('header a[aria-current]').innerText(), 'Importing');
      assert.equal(await index.locator('.editor-error').textContent(), '');
      const example = await output.inputValue();
      const original = await input.inputValue();
      assert.equal(calls.filter(s => s.endsWith('/' + format + '.mjs')).length,0,'reader is deferred');
      if (!live) {
        assert.ok(await input.evaluate(element => element.readOnly));
        assert.equal(await index.getByRole('link',{name:'Open the live converter'}).getAttribute('href'),
          'https://vexflow.com/vextab/guide/#importing/' + format);
        // Editing the generated score remains available without a source module.
        const edited = example.replace(format === 'lilypond' ? 'F4' : 'A4', 'B4');
        await output.fill(edited);
        await output.press('Control+Enter');
        assert.equal(await index.locator('.editor-error').textContent(), '');
        await index.getByRole('button',{name:'Reset example'}).click();
        continue;
      }
      const convert = index.getByRole('button',{name:'Convert to VexTab'});
      const status = index.locator('.import-example [role=status]');
      await convert.click();
      await page.waitForFunction(() => document.querySelector('.import-example [role=status]').textContent.startsWith('Exact'));
      assert.equal((await output.inputValue()).trim(),example.trim(),'worked output agrees with the public converter');
      assert.equal(calls.filter(s => s.endsWith('/' + format + '.mjs')).length,1);
      assert.ok(!calls.some(s => /\/mxl\.m?js$/.test(s)));
      const next = format === 'lilypond' ? original.replace('f2','g2') : original.replace('<step>A</step>','<step>B</step>');
      await input.fill(next);
      await convert.click();
      await page.waitForFunction(() => document.querySelector('.import-example [role=status]').textContent.startsWith('Exact'));
      const text = await output.inputValue();
      assert.ok(text.includes(format === 'lilypond' ? ':h G4' : ':8 B4'));
      if (format === 'lilypond') {
        await input.fill(next.replace('| g2', '| \\break g2'));
        await convert.click();
        await page.waitForFunction(() => document.querySelector('.import-example [role=status]').textContent.startsWith('Conversion failed'));
        assert.equal(await output.inputValue(),text);
        await index.getByRole('button',{name:'Select source'}).click();
        assert.equal(await input.evaluate(el => el.value.slice(el.selectionStart,el.selectionEnd)), '\\break');
        await index.getByLabel('Conversion mode').selectOption('partial');
        await convert.click();
        await page.waitForFunction(() => document.querySelector('.import-example [role=status]').textContent.startsWith('Partial'));
        assert.match(await status.innerText(), /Review the warnings/);
      }
    }
    for (const id of ['integration','limitations','gallery']) {
      await page.goto(url + '#importing/' + id);
      await page.locator('#main[data-route="#importing/' + id + '"]').waitFor();
      assert.equal(await page.locator('#contents a[aria-current]').getAttribute('href'), '#importing/' + id);
    }
    assert.equal(await page.getByRole('link',{name:'Open the score gallery'}).getAttribute('href'),
      live ? 'gallery/index.html' : 'https://vexflow.com/vextab/guide/gallery/index.html');
  } finally { page.off('request',track); }
}
