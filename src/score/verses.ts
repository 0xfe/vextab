// Resolve each sung line on its own voice clock before independent screen and print projection.
import type { Attack, MeasureVoice, ScoreSpan, VerseSyllable } from './model';
import { ScoreError } from './source';

/** The original unnamed verse and each named verse occupy independent lanes. */
export function lyrics(event: Attack): VerseSyllable[] {
  return [...(event.lyric ? [event.lyric] : []), ...(event.verses ?? [])];
}

/** A connector ending in another measure needs native fragments at each system break. */
export function resolveVerseLinks(bars: MeasureVoice[], spans: ScoreSpan[]) {
  const events = bars.flatMap((voice, bar) => voice.events.map(event => ({ event, bar })));
  const following = new Map<string, number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const { event, bar } = events[i];
    for (const lyric of lyrics(event)) {
      const lane = lyric.verse ?? '';
      const end = lyric.hyphen ? following.get(lane) : lyric.extend ? i + lyric.extend : i;
      if (!events[end] || !lyric.text.trim() || (lyric.elideWith !== undefined && !lyric.elideWith.trim()) || !event.heads.length)
        throw new ScoreError('measure', 'Lyric needs a pitched anchor, text and a valid following endpoint', lyric.range);
      if (bar !== events[end].bar) {
        lyric.crossConnector = true;
        spans.push({ kind: lyric.hyphen ? 'hyphen' : 'lyric', lane, from: event.id, to: events[end].event.id,
          id: 'verse-' + lane + '-' + event.id, range: lyric.range });
      }
      following.set(lane, i);
    }
  }
}
