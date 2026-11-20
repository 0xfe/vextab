// Resolve compact note modifiers against stave-local placement defaults.
import type { SourceRange } from './source';

export type MarkPosition = 'left' | 'right' | 'above' | 'below';
export interface HeadMark { finger?: string; position: MarkPosition }
type Fail = (message: string, range: SourceRange) => never;

/** Normalize both terse inline overrides and readable stave options. */
function position(value: string, vertical: boolean, fail: Fail, range: SourceRange): MarkPosition {
  switch (value) {
    case 'a': case 'above': case 'top': return 'above';
    case 'b': case 'below': case 'bottom': return 'below';
    case 'l': case 'left': if (!vertical) return 'left'; break;
    case 'r': case 'right': if (!vertical) return 'right'; break;
  }
  return fail(vertical ? 'Place an accent above or below' : 'Place a fingering left, right, above or below', range);
}

/** Each head owns its finger number. The source range includes the brackets for diagnostics. */
function readMarks(text: string, range: SourceRange, fingering: MarkPosition, accent: MarkPosition, fail: Fail): HeadMark[] {
  return text.slice(1, -1).split(',').map(part => {
    const match = /^(?:f([0-5T])|(>))(?::([a-z]+))?$/.exec(part.trim());
    if (!match) return fail('Expected a finger such as f2 or an accent > with optional placement', range);
    const [, finger, , override] = match;
    return { ...(finger && { finger }), position: override ? position(override, !finger, fail, range) : finger ? fingering : accent };
  });
}

/** Additional voices inherit the stave defaults. A new stave starts with left fingers and upper accents. */
export function resolveShorthand(nodes: any[], fallbackRange: (line: number, column: number) => SourceRange, fail: Fail) {
  let staffFinger: MarkPosition = 'left', staffAccent: MarkPosition = 'above';
  for (const node of nodes) {
    if (node.element === 'options') continue;
    const voice = node.element === 'voice';
    let finger: MarkPosition = voice ? staffFinger : 'left';
    let accent: MarkPosition = voice ? staffAccent : 'above';
    for (const opt of node.options ?? []) {
      if (opt.key === 'fingering') finger = position(opt.value, false, fail, opt.range ?? fallbackRange(opt._l, opt._c));
      if (opt.key === 'accents') accent = position(opt.value, true, fail, opt.range ?? fallbackRange(opt._l, opt._c));
    }
    if (!voice) { staffFinger = finger; staffAccent = accent; }
    for (const attack of node.notes ?? []) {
      for (const head of attack.chord ?? [attack]) {
        if (head.suffix) {
          head.marks = readMarks(head.suffix.text, head.suffix.range, finger, accent, fail);
          delete head.suffix;
        }
      }
    }
  }
}
