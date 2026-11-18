// Copy freshly built browser distributions to the historical release paths.
import { copyFile } from 'node:fs/promises';

for (const entry of ['div', 'main', 'playground', 'tests']) {
  for (const suffix of ['dev.js', 'prod.js', 'prod.js.map']) {
    const file = entry + '.' + suffix;
    await copyFile('dist/' + file, 'releases/' + file);
  }
}
await copyFile('dist/vextab-div.js', 'releases/vextab-div.js');
