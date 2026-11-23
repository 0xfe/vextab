// Join named expressive endpoints after a voice has expanded its patterns and tuplets.
import type { ScoreEvent, ScoreVoice, SpanEndpoint, TextRange, ExpansionFrame } from './model.js';
import type { Fail } from './reader.mts';

/** Scoped and named beams have the same short-note, single-measure contract. */
export function validateBeam(events: ScoreEvent[], first: number, last: number, range: TextRange, trace: ExpansionFrame[], fail: Fail) {
  if (first >= last || events[first].bar !== events[last].bar) fail('syntax', 'Beam short notes within one bar', range, trace);
  for (let i = first; i <= last; i++) {
    const [n, d] = events[i].writtenDuration.split('/').map(Number);
    if (n * 4 >= d) fail('syntax', 'Beam short notes within one bar', range, trace);
  }
}

/** Names are local to a voice and may be reused once the preceding span closes. */
export function resolveSpanEndpoints(voice: ScoreVoice, fail: Fail): void {
  const open = new Map<string, { mark: SpanEndpoint; index: number }>();
  let openBeam = false;
  voice.events.forEach((event, index) => {
    for (const mark of event.marks) {
      if (mark.kind !== 'spanEndpoint') continue;
      const key = mark.span + '-' + mark.name;
      if (mark.edge === 'start') {
        if (open.has(key)) fail('syntax', 'Duplicate span start ' + mark.name, mark.range, event.trace);
        if (mark.span === 'beam' && openBeam) fail('syntax', 'A note may belong to only one beam', mark.range, event.trace);
        open.set(key, { mark, index });
        if (mark.span === 'beam') openBeam = true;
        continue;
      }
      const start = open.get(key);
      if (!start || index === start.index) fail('syntax', 'Expected an earlier start for ' + mark.name, mark.range, event.trace);
      open.delete(key);
      const first = voice.events[start.index].id, last = event.id, name = mark.name;
      const range: TextRange = start.mark.range;
      if (mark.span === 'hairpin') {
        voice.spans.push({ kind: start.mark.hairpin!, first, last, range, name, niente: start.mark.niente });
      } else {
        if (mark.span === 'beam') {
          validateBeam(voice.events, start.index, index, mark.range, event.trace, fail);
          openBeam = false;
        }
        voice.spans.push({ kind: mark.span, first, last, range, name, side: start.mark.side, strings: [] });
      }
    }
  });
  for (const { mark, index } of open.values())
    fail('syntax', 'Missing end for ' + mark.name, mark.range, voice.events[index].trace);
}
