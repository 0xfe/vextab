// Attach measured chord and lyric marks, and draw the score's low-to-high chord-frame key.
import { scoreFont } from './engraving';
import { Annotation, FretDiagram, StaveNote, type EasyScoreComposition, type RenderContext, type ScoreHitRegion } from 'vexflow';
import type { Measure, ParsedScore } from './model';
import { ScoreError, type SourceRange } from './source';

type Register = (id: string, range: SourceRange) => string;

/** A verse belongs to one voice. The native phrase layout also considers ink from the other voices. */
export function attachLeadMarks(measure: Measure, composition: EasyScoreComposition, staff: number,
  noteId: (id: string) => string, register: Register): void {
  const index = measure.number - 1;
  const stave = composition.staves[index][staff];
  for (const voice of measure.voices) {
    const symbols: Annotation[] = [];
    for (const event of voice.events) {
      if (!event.chord) continue;
      const chord = new Annotation(event.chord.text).setFont(scoreFont, 12, 'bold').setVerticalJustification('top');
      chord.setAttribute('id', register('chord' + event.chord.range.start, event.chord.range));
      const anchor = composition.getNote(noteId(event.id));
      anchor.addModifier(chord, 0);
      if (anchor instanceof StaveNote) symbols.push(chord);
    }
    if (symbols.length) composition.systems[index].getPhraseLayout().addLane(stave, symbols, { side: 'above' });
    const syllables = voice.events.flatMap((event, i) => {
      if (!event.lyric) return [];
      const note = composition.getNote(noteId(event.id));
      if (!(note instanceof StaveNote)) throw new ScoreError('fixed-layout', 'This lyric needs a notation staff', event.lyric.range);
      const { text, hyphen, extend, range } = event.lyric;
      const end = extend && composition.getNote(noteId(voice.events[i + extend].id)) as StaveNote;
      return [{ note, text, hyphenAfter: hyphen, extendTo: end || undefined, range }];
    });
    if (syllables.length) {
      const marks = composition.systems[index].getPhraseLayout().addVerse(stave, syllables);
      marks.forEach((mark, i) => mark.setAttribute('id', register('lyric' + syllables[i].range.start, syllables[i].range)));
    }
  }
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
