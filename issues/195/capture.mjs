// Measure the public VexTab and native VexFlow paths in an isolated browser page per build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ensemble = 'meter 4/4 staff { times 4 { :8 C4 D4 E4 F4 G4 F4 E4 D4 | } } staff { clef bass times 4 { :w C3 | } }';
const labels = ['C#maj13(#11,b9)/G', 'Dbmaj13(#11,b9)/Gb'];
const harmonySource = 'meter 4/4 staff { :q C4 D4 E4 F4[symbol "' + labels[0] + '"] | C4[symbol "' + labels[1] + '"] D4 E4 F4 | }';

/** Each known defect is a historical expectation tied to immutable VexTab 6.0.0 source. */
async function fixtures(output) {
  const guide = name => readFile(join(output, 'scores', name + '.vextab'), 'utf8');
  return [
    { id: 'two-lyrics', source: 'meter 1/4 staff { C4[lyric "one", lyric "two"] | }', part: 'notation' },
    { id: 'beam', source: 'meter 2/4 staff { beam { :8 C4 D4 E4 F4 } | }', part: 'notation' },
    { id: 'skip', source: 'meter 2/4 staff { :q C4 skip | }', part: 'notation' },
    { id: 'slow-river', source: await guide('slow-river'), part: 'notation' },
    { id: 'bossa', source: await guide('bossa'), part: 'tab' },
    { id: 'guitar-duet', source: await guide('guitar-duet'), part: 'notation' },
  ];
}

/** Keep comparable timings as observations, separate from repeatable geometry assertions. */
async function benchmark(probe) {
  const timings = [];
  for (const [parts, bars] of [[1, 16], [4, 16], [4, 64]]) {
    const bar = ':q C4 D4 E4 F4 | ';
    const source = 'meter 4/4 ' + ('staff { ' + bar.repeat(bars) + '} ').repeat(parts).trimEnd();
    await probe('timedPass', source);
    const samples = [];
    for (let i = 0; i < 5; i++) samples.push(await probe('timedPass', source));
    const medians = Object.fromEntries(Object.keys(samples[0]).map(phase => {
      const sorted = samples.map(s => s[phase]).sort((a, b) => a - b);
      return [phase, sorted[2]];
    }));
    timings.push({ parts, bars, source, samplesMs: samples, medianMs: medians });
  }
  return timings;
}

/** Render both chord representations, including the actual grammar-to-engraving path. */
async function captureHarmony(probe, picture) {
  const results = {};
  for (const kind of ['native', 'literal']) {
    const frames = [];
    for (const width of [800, 190, 800]) {
      frames.push(await probe('harmony', { width, labels, source: harmonySource, native: kind === 'native' }));
    }
    await picture('chords-' + kind);
    results[kind] = frames;
  }
  return results;
}

/** Capture each source on screen and paper, including the drifting verse across three adjacent measures. */
async function captureStudies(page, probe, output, lane) {
  const studies = {};
  for (const fixture of await fixtures(output)) {
    const widths = fixture.id === 'bossa' ? [800, 360, 800] : [560];
    const frames = [];
    for (const width of widths) frames.push(await probe('study', { ...fixture, width }));
    studies[fixture.id] = { ...fixture, widths, frames };
    if (fixture.id === 'slow-river') {
      // Locate the relevant row from its actual notes and words, independent of the browser's font metrics.
      const clip = await page.evaluate(() => {
        const host = document.querySelector('#screen');
        const box = host.getBoundingClientRect();
        const rowWords = [...host.querySelectorAll('text')].filter(el => ['roll', 'to', 'sea'].includes(el.textContent));
        const top = host.querySelectorAll('.vf-stave')[1].getBoundingClientRect().top;
        const bottom = Math.max(...rowWords.map(n => n.getBoundingClientRect().bottom));
        return { x: 0, y: Math.max(0, Math.floor(top - box.top - 53)), width: 560,
          height: Math.ceil(bottom - top + 68) };
      });
      await page.screenshot({ clip, path: join(output, lane + '-verse.png') });
    }
  }
  return studies;
}

/** Save measurements before assertions so an unexpected difference remains inspectable. */
export async function capture(browser, output, lane, expectedVersion) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  const bundle = join(output, lane + '.js');
  try {
    await page.setContent('<style>*{box-sizing:content-box}body,#screen,#paper{background:white;margin:0}#screen{width:fit-content}</style><div id="screen"></div><div id="paper"></div><div id="embed"></div>');
    await page.addScriptTag({ path: bundle });
    await page.addScriptTag({ path: fileURLToPath(new URL('./browser.js', import.meta.url)) });
    // Prime both embedded faces. Capture only after font loading and fallback substitution finish.
    const fonts = await page.evaluate(async () => {
      await window.vextab.Vex.Flow.loadFonts('Bravura', 'Academico');
      await document.fonts.ready;
      return [...document.fonts].map(({ family, status }) => ({ family, status }));
    });
    const build = await page.evaluate(() => window.vextab.Vex.Flow.BUILD);
    assert.equal(build.VERSION, expectedVersion);
    for (const face of ['Bravura', 'Academico']) {
      assert.ok(fonts.some(font => font.family.includes(face) && font.status === 'loaded'), face);
    }
    const probe = (method, input) => page.evaluate(([name, arg]) => window.m0[name](arg), [method, input]);
    const picture = id => page.locator('#screen').screenshot({
      path: join(output, lane + '-' + id + '.png'),
    });
    const music = await probe('ensembleMusic', ensemble);
    const embed = await probe('resizeEmbed', ensemble);
    const views = [];
    for (const width of [800, 360, 800]) {
      const separate = await probe('separateParts', { source: ensemble, width });
      if (width === 360) {
        const height = Math.ceil((await page.locator('#screen').boundingBox()).height);
        await page.screenshot({ clip: { x: 0, y: 0, width, height }, path: join(output, lane + '-separate-parts.png') });
      }
      const native = await probe('nativeEnsemble', width);
      if (width === 360) await picture('conductor');
      views.push({ width, separate, native });
    }
    const studies = await captureStudies(page, probe, output, lane);
    const chords = await captureHarmony(probe, picture);
    const timings = await benchmark(probe);
    const sha256 = createHash('sha256').update(await readFile(bundle)).digest('hex');
    const result = { lane, sha256, build, fonts, ensemble, music, embed, views, studies, harmonySource, labels, chords, timings };
    await writeFile(join(output, lane + '.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    await page.close();
  }
}
