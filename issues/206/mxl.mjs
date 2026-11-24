// Extract two checksum-pinned ZIP members in memory. This probe runs only on the M0 corpus.
import { unzipSync, strFromU8 } from 'fflate';
import { SaxesParser } from 'saxes';
import { probe as scan } from './musicxml.mjs';

/** Extract the first declared rootfile without inflating unrelated ZIP members. */
export function probe(bytes) {
  function member(path) {
    const data = unzipSync(bytes, { filter: entry => entry.name === path && entry.originalSize <= 8 * 1024 * 1024 })[path];
    if (!data) throw Error('Missing or oversized fixture member: ' + path);
    return data;
  }
  let root;
  const xml = new SaxesParser();
  xml.on('opentag', tag => {
    if (tag.name === 'rootfile') root ??= tag.attributes['full-path'];
  });
  xml.write(strFromU8(member('META-INF/container.xml'))).close();
  return scan(member(root));
}
