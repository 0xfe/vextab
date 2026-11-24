// Identify repeated marks that would overwrite one field in the engraving model.
import type { TextRange } from './model.js';

/** Projection stores one value for each of these slots. Diagnose a second spelling at its source. */
const singletonSlots = new Map<string, string>([
  ...['sustain', 'gliss', 'release', 'dynamic','sharedStem','onStaff','pedal','ossia','grace','ornament','lyric', 'symbol', 'frame', 'line', 'ink', 'write', 'prebend', 'bend', 'text'].map(kind => [kind, kind] as const),
  ['diagram', 'frame'], ['slideIn', 'open slide'], ['slideOut', 'open slide'], ['showSign', 'accidental'], ['courtesy', 'accidental'],
  ['hammer', 'connection'], ['pull', 'connection'], ['slide', 'connection'],
]);

/** Return the second mark so parser and saved-model callers can locate the same ambiguity. */
export function duplicateMark(marks: readonly { kind: string; range: TextRange }[]) {
  if (marks.length < 2) return;
  const used = new Set<string>();
  for (const mark of marks) {
    const slot = mark.kind === 'pedal' && 'action' in mark ? 'pedal ' + mark.action : mark.kind === 'lyric' && 'verse' in mark ? 'verse ' + mark.verse : mark.kind === 'harmony' ? 'symbol' : singletonSlots.get(mark.kind);
    if (!slot) continue;
    if (used.has(slot)) return { reason: 'Only one ' + slot + ' may be written here', range: mark.range };
    used.add(slot);
  }
}
