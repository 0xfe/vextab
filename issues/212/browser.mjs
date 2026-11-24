// Open complete source editions, revise a real pitch, play the edit and print every written bar.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const before = process.argv.includes('--before');
const modules = resolve(process.env.IMPORTER_DIST ?? 'importer/dist');
const { importMXL } = await import(pathToFileURL(join(modules, 'mxl.js')));
const { importLilyPond } = await import(pathToFileURL(join(modules, 'lilypond.js')));
const output = resolve('build/importer-m5');
await mkdir(output, { recursive: true });
const cases = [
  {
    name: 'Echigo-Jishi · song from the 1892 collection',
    id: 'echigo',
    bars: 47,
    from: 'A4[',
    to: 'E5[',
    midi: 76,
    run: async () =>
      importMXL(await readFile('issues/212/musicxml/Echigo-Jishi.mxl'), {
        mode: 'partial',
        targetProfile: 'expressive',
      }),
  },
  {
    name: 'Fernando Sor · Op. 35, Study No. 22',
    id: 'sor',
    bars: 48,
    from: '3/2[write D5',
    to: '5/2[write E5',
    midi: 64,
    run: async () =>
      importLilyPond(await readFile('issues/212/lilypond/sor.ly', 'utf8'), {
        mode: 'partial',
        targetProfile: 'expressive',
        score: 'print',
        guitar: true,
      }),
  },
];
const browser = await chromium.launch(
  process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' },
);
try {
  for (const { name, id, bars, from, to, midi, run } of cases) {
    const result = await run();
    const page = await browser.newPage({ viewport: { width: 1120, height: 710 } });
    try {
      await page.setContent(
        '<style>body{margin:20px;background:white;color:#222;font:16px system-ui}h1{font-size:22px}aside{position:absolute;left:-200vw}</style><h1></h1><main></main><aside></aside>',
      );
      await page.locator('h1').evaluate((el, title) => {
        el.textContent = title;
      }, name);
      if (before && !result.documents.length) {
        await page.locator('main').evaluate((el, why) => {
          el.textContent = why;
        }, result.diagnostics.at(-1).message);
      } else {
        assert.ok(result.documents.length, JSON.stringify(result.diagnostics.at(-1)));
        await page.addScriptTag({ path: resolve('dist/main.dev.js') });
        const proof = await page.evaluate(
          async ({ text, from, to, midi, before, id }) => {
            const vt = window.vextab;
            const host = document.querySelector('main');
            host.dataset.editor = 'true';
            host.textContent = text;
            const editor = new vt.Div(host, { player: false });
            const field = host.querySelector('textarea');
            if (!editor.getScore() || !field.value.includes(from))
              throw Error('Opening pitch missing in editor');
            if (!before) {
              field.value = field.value.replace(from, to);
              editor.run();
            }
            const model = editor.getScoreDocument();
            if (!editor.getScore() || model.source !== field.value)
              throw Error('Editor rejected score revision');
            const print = vt.renderEdition(document.querySelector('aside'), model, { partIndex: 0 });
            if (print.diagnostics.length) throw Error(JSON.stringify(print.diagnostics));
            const pages = print.publication.pages;
            const metadata = pages.map((p) => JSON.parse(p.svg.querySelector('metadata').textContent));
            if (id === 'echigo' && !before) {
              // The edition writes ツ twice, on an attack in bar 34 and a rest in bar 36.
              const count = (surface) =>
                [...surface.querySelectorAll('text')].filter((node) => node.textContent === 'ツ').length;
              if (count(host) !== 2 || pages.reduce((n, page) => n + count(page.svg), 0) !== 2)
                throw Error('Rest-anchored lyric missing');
            }
            if (!before) {
              let hear;
              const heard = new Promise((resolve) => {
                hear = resolve;
              });
              const player = new vt.Player(model, {
                partIndex: 0,
                performer: 'robot',
                playback: {
                  open: () => ({
                    currentTime: 0,
                    playNote(note) {
                      if (note.pitch === midi) hear();
                    },
                    stop() {},
                  }),
                },
              });
              // Freeze the public instrument clock on the first beat. A later matching note cannot satisfy the check.
              let timer;
              const playing = player.play();
              try {
                await Promise.race([
                  heard,
                  new Promise((_, reject) => {
                    timer = setTimeout(() => reject(Error('Edited opening pitch did not play')), 1500);
                  }),
                ]);
              } finally {
                clearTimeout(timer);
                player.stop();
                await playing;
                player.dispose();
              }
            }
            field.style.display = 'none';
            return {
              bars: metadata.flatMap((m) => m.measures),
              pages: pages.length,
              parts: model.parts.map((p) => p.measureCount),
              screen: host.querySelectorAll('.vf-notehead').length,
              print: pages.reduce((n, p) => n + p.svg.querySelectorAll('.vf-notehead').length, 0),
              firstKeys: metadata[0].events.find((event) => event.keys?.length)?.keys,
            };
          },
          { text: result.documents[0].text, from, to, midi, before, id },
        );
        assert.deepEqual(proof.parts, [bars]);
        assert.deepEqual(
          proof.bars,
          Array.from({ length: bars }, (_, i) => i + 1),
        );
        assert.ok(proof.screen > 100 && proof.print > 100, JSON.stringify(proof));
        if (!before)
          assert.ok(
            proof.firstKeys.some((key) => key.toLowerCase().startsWith('e/')),
            JSON.stringify(proof.firstKeys),
          );
        console.log(
          name,
          JSON.stringify({ bars, pages: proof.pages, printedHeads: proof.print, firstKeys: proof.firstKeys }),
        );
      }
      await page.screenshot({ path: join(output, id + (before ? '-before' : '-edited') + '.png') });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
