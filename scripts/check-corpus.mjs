// Compile authored scores from the guide, examples, website listings and standalone score files.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseScore } from '../dist/score.cjs';

const decode = source => source.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
let count = 0;

/** Report the source file as well as the compiler's line inside the example. */
function check(source, id) {
  try { parseScore(source.trim()); }
  catch (error) { throw new Error(id + ': ' + error.message); }
  count++;
}

/** Walk maintained content so newly added lessons are checked without editing a manifest. */
async function files(dir, extensions) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path, extensions));
    else if (extensions.some(ext => path.endsWith(ext))) result.push(path);
  }
  return result;
}

for (const path of await files('guide/scores', ['.vextab'])) check(await readFile(path, 'utf8'), path);
const directories = ['guide', 'doc', 'demos', 'static'];
const pages = (await Promise.all(directories.map(dir => files(dir, ['.html', '.md'])))).flat();
pages.push('README.md', 'tests/playground.html', ...await files('docs', ['.md']));
for (const path of pages) {
  const source = decode(await readFile(path, 'utf8'));
  // Release reports and the proposal explicitly quote v1. Their v2 fences remain executable.
  for (const match of source.matchAll(/^```vextab2\s*\n([\s\S]*?)^```/gm)) check(match[1], path);
  if (/^docs\/(?:vt5-|grammarv2\.md)/.test(path)) continue;
  assert.doesNotMatch(source, /\btabstave\b|(?:^|\\n)\s*(?:stave(?:\s|$)|notes\s|options\s+\w+=)/m, path + ' contains a v1 declaration');

  // Also inspect escaped HTML listings after decoding, so copied embeds pass the same parser.
  for (const match of source.matchAll(/<(div|pre|textarea)\b([^>]*?)>([^<>]+)<\/\1>/g)) {
    const [, , attributes, body] = match;
    if (/(?:\bdata-score\b|class="(?:vex-tabdiv|vextab-auto)"|id="(?:score|example|blah)")/.test(attributes) && body.trim()) {
      check(body, path + ' embed');
    }
  }
  for (const match of source.matchAll(/(?:const source\s*=\s*|host\.textContent\s*=\s*|parseScore\(\s*)(['"`])((?:(?!\1)[\s\S])*?)\1/g)) {
    check(match[2].replaceAll('\\n', '\n'), path + ' code sample');
  }
}
console.log(count + ' authored scores compiled in grammar v2.');
