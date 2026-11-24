// Public synchronous MusicXML entry point. Plain XML consumers do not load archive handling.
import { musicXMLReader } from './musicxml-reader.js';
import { convert } from './score.js';
import { feedTree } from './xml.js';
import type { ImportResult, MusicXMLOptions } from './types.js';
export type {
  ImportedDocument,
  ImportDiagnostic,
  ImportOptions,
  MusicXMLOptions,
  ImportResult,
  TextRange,
} from './types.js';

/** Convert text or UTF-8/UTF-16 XML bytes into editable VexTab. */
export function importMusicXML(source: string | Uint8Array, options: MusicXMLOptions = {}): ImportResult {
  return convert(options, 'score.musicxml', (input) => {
    const reader = musicXMLReader(source.length, typeof source === 'string', input, options);
    feedTree(reader.tree, source);
    return reader.finish();
  });
}
