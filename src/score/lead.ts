// Describe measured chord and lyric marks, and draw the score's low-to-high chord-frame key.
import { describePrebend } from './music';
import { scoreFont } from './engraving';
import { FretDiagram, type EasyScoreMeasureSpec, type RenderContext, type ScoreHitRegion } from 'vexflow';
import type { Measure, ParsedScore } from './model';
import { ScoreError, type SourceRange } from './source';

type Register = (id: string, range: SourceRange) => string;

/** Use note IDs so Publication can recreate the same marks in a fresh composition. */
export function leadMarks(measure: Measure, staff: 'notation' | 'tab', noteId: (id: string) => string,
  labelPrebends: boolean): Pick<EasyScoreMeasureSpec, 'chords' | 'verses'> {
  const chords: EasyScoreMeasureSpec['chords'][number][] = [];
  const verses: EasyScoreMeasureSpec['verses'][number][] = [];
  for (const voice of measure.voices) {
    const syllables: EasyScoreMeasureSpec['verses'][number][number][] = [];
    for (const [i, event] of voice.events.entries()) {
      const note = noteId(event.id);
      // Publication accepts plain descriptors and cannot serialize a native pre-bend arrow.
      // The part names its string and release alongside any chord symbol at the same onset.
      const labels = event.chord ? [event.chord.text] : [];
      if (labelPrebends) for (const head of event.heads) {
        if (head.prebend) labels.push(describePrebend(head.prebend, head.position.str));
      }
      if (labels.length) chords.push({ note, text: labels.join(' · ') });
      if (!event.lyric) continue;
      const { text, hyphen, extend, range } = event.lyric;
      if (staff === 'tab') throw new ScoreError('fixed-layout', 'This lyric needs a notation staff', range);
      syllables.push({ note, text, hyphenAfter: hyphen, extendTo: extend ? noteId(voice.events[i + extend].id) : undefined });
    }
    if (syllables.length) verses.push(syllables);
  }
  return { chords, verses };
}

/** Draw native diagrams in source order above the music, wrapping the key with the score. */
export function drawFrames(score: ParsedScore, width: number, ctx: RenderContext, register: Register) {
  const regions: ScoreHitRegion[] = [];
  let x = 10, y = 6, bottom = 0, right = 0;
  ctx.save();
  ctx.setFont(scoreFont, 12);
  for (const measure of score.measures) for (const voice of measure.voices) for (const event of voice.events) {
    if (!event.frame) continue;
    const { spec, range } = event.frame;
    const id = register('frame' + range.start, range);
    const diagram = new FretDiagram(spec).setAttribute('id', id);
    const bounds = diagram.getBoundingBox();
    const cellWidth = Math.max(bounds.w, 12 + ctx.measureText(event.chord.text).width);
    if (x > 10 && x + cellWidth > width - 10) { x = 10; y = bottom + 8; }
    ctx.fillText(event.chord.text, x + 12, y + 12);
    diagram.setX(x).setY(y + 16).setContext(ctx).draw();
    regions.push({ id, kind: 'event', source: 'frame' + range.start, x, y, w: cellWidth, h: bounds.h + 16 });
    bottom = y + 16 + bounds.h;
    right = Math.max(right, x + cellWidth + 10);
    x += cellWidth + 12;
  }
  ctx.restore();
  return { height: bottom, width: right, regions };
}
