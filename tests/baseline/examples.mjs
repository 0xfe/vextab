// Run the project-owned examples in their original pages with one distribution at a time.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Each expectation identifies the musical phrase to review. The runner saves its
// exact tuning, meter and voice declarations in the extracted source alongside it.
const lick = 'In bar two, read the tapped twelfth fret, two pull-offs and a hammer-on on string four.';
const pages = [
  ['doc/tutorial.html', '.vex-tabdiv svg', [
    'Read an empty six-string tab staff.',
    'Read C natural, D and E in octave four, followed by F sharp in octave five.',
    'Match the three attacks on string three and the last attack on string four to the staff.',
    'Read the low sixth string in bass clef, A flat and cut time.',
    'Leave a rest before the first barline in each example.',
    'Distinguish the opening, closing and combined repeat bars from the final bar.',
    'Follow the bend up to fret nine and its release to seven in the second system.',
    'Find the muted downstroke in the second bar and the vibrato on its final note.',
    'Distinguish the opening simultaneous C-major chord from the following arpeggio.',
    'Follow the tap, pull-offs, hammer-on and slide in the first system.',
    'Read the opening slide as a triplet in E-flat tuning, followed later by a dotted eighth.',
    'Read the duration changes within the tapped slide on string four.',
    'Match Fi, Ga and Ro to the three notes in the triplet.',
    'Read the A7#9 label with the opening chord and sweep with the upper strings.',
    'Find each articulation beside its named attack, including Marcato.',
    'Read G Minor and A Major over their respective half-bar spans.',
    'Follow the eight solfège syllables on the rising scale.',
    'Change chord symbols by half bars and keep the second text line distinct.',
    'Read the segno, coda, trill and dynamic in their separate text voices.',
    'Follow the two-bar slash rhythm from G Maj7 to Am.',
    'Read the one-note exercise at double scale.',
    'Read the opening chord symbol with the high-register hammer-on.',
    'Align the rest and low-string hammer-on across the widely separated staves.',
    'Read the first three stemmed tab notes as one triplet. Known tab-only timing defect.',
  ]],
  ['demos/api.html', '#boo svg', ['Play four quarters at frets 5, 7, 8, 7 on string two in A.']],
  ['demos/div-plugin.html', '.vextab-auto svg', ['Find the opening repeat, triplets and segno in the paired score.']],
  ['doc/playground.html', '.vex-tabdiv canvas', [lick]],
  ['doc/playground_svg.html', '.vex-tabdiv svg', [lick]],
];

// Capture the API demo's actual input as it executes its own inline example.
function observeApiSource() {
  const parse = window.vextab.VexTab.prototype.parse;
  window.vextab.VexTab.prototype.parse = function (source) {
    window.exampleSource = source;
    return parse.call(this, source);
  };
}

// Serve only the local example pages, styles and selected bundles. Remote page fonts
// are unnecessary for these checks. VexFlow supplies its own notation fonts.
async function serveExamples(page, dist, candidate) {
  const content = new Map();
  for (const [path] of pages) content.set('/' + path, await readFile(candidate ? path : resolve('tests/baseline/v1', path), 'utf8'));
  for (const path of ['doc/style.css', 'doc/vextab.css']) content.set('/' + path, await readFile(path, 'utf8'));
  for (const [requested, bundle] of [
    ['main.dev.js', 'main.prod.js'], ['div.dev.js', 'div.prod.js'], ['vextab-div.js', 'vextab-div.js'],
  ]) {
    let script = await readFile(resolve(dist, bundle), 'utf8');
    if (!candidate && requested === 'main.dev.js') script += '\n;(' + observeApiSource.toString() + ')();';
    content.set('/dist/' + requested, script);
  }
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://examples.test' || !content.has(url.pathname)) return route.abort();
    const types = { js: 'application/javascript', html: 'text/html', css: 'text/css' };
    return route.fulfill({ body: content.get(url.pathname), contentType: types[url.pathname.split('.').pop()] });
  });
}

// Save every source with its page and example number so a failure is reproducible.
export async function runExamples(browser, dist, verifyInk) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const examples = [];
  try {
    await serveExamples(page, dist, verifyInk);
    for (const [path, selector, original] of pages) {
      const expectations = original.map((text, i) => ({ text, number: String(i + 1) }));
      // The old chord editor combined notation and bent tablature. Each example now has its own view.
      if (verifyInk && path === 'doc/tutorial.html') expectations.splice(9, 0, {
        text: 'Hold the chord while two strings bend independently.', number: '9b',
      });
      const count = expectations.length;
      await page.goto('https://examples.test/' + path);
      await page.locator(selector).nth(count - 1).waitFor({ state: 'attached' });
      await page.evaluate(() => document.fonts.ready);
      if (verifyInk && path === 'doc/tutorial.html') {
        const labels = await page.locator(selector).nth(expectations.findIndex(e => e.number === '15')).evaluate(svg => {
          const { left, right, width } = svg.getBoundingClientRect();
          return { width, clipped: [...svg.querySelectorAll('text')].filter(text => {
            const ink = text.getBoundingClientRect();
            return ink.left < left || ink.right > right;
          }).map(text => text.textContent) };
        });
        assert.equal(labels.width, 650);
        assert.deepEqual(labels.clipped, [], 'Step 11 articulation labels must fit the printed staff');
      }
      const scores = await page.locator(selector).evaluateAll(surfaces => surfaces.map(surface => {
        const host = surface.closest('.vex-tabdiv, .vextab-auto');
        const source = host?.querySelector('textarea')?.value ?? surface.closest('[data-source]')?.dataset.source ?? window.exampleSource;
        const heading = [...document.querySelectorAll('h1,h2')].filter(h =>
          h.compareDocumentPosition(surface) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.textContent;
        let hasInk = !!surface.querySelector('path,text');
        if (surface instanceof HTMLCanvasElement) {
          const pixels = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data;
          hasInk = pixels.some((v, i) => i % 4 === 3 && v > 0 && pixels[i - 3] < 128);
        }
        return { heading, source, backend: surface.tagName.toLowerCase(), hasInk, error: host?.querySelector('.editor-error')?.textContent ?? '' };
      }));
      assert.equal(scores.length, count, path);
      for (const [i, score] of scores.entries()) {
        const id = path + ' example ' + expectations[i].number;
        assert.ok(score.source?.trim(), id + ' is missing its source');
        assert.equal(score.error, '', id);
        assert.ok(score.hasInk, id + ' has no visible score');
        examples.push({ id, expectation: expectations[i].text, ...score });
      }
      assert.deepEqual(errors, [], path);
    }
    return examples;
  } finally {
    await page.close();
  }
}
