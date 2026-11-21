// Describe measured chord and lyric marks, and draw the score's low-to-high chord-frame key.
import { describeOpenSlide } from './open-slide';
import { describePrebend } from './music';
import { scoreFont } from './engraving';
import { Annotation, FretDiagram, type EasyScoreComposition, type EasyScoreMeasureSpec, type RenderContext, type ScoreHitRegion } from 'vexflow';
import type { Measure, ParsedScore } from './model';
import { ScoreError, type SourceRange } from './source';

type Register = (id: string, range: SourceRange) => string;

/** Use note IDs so Publication can recreate the same marks in a fresh composition. */
export function leadMarks(measure: Measure, staff: 'notation' | 'tab', noteId: (id: string) => string,
  labelTechniques: boolean, publication = false): Pick<EasyScoreMeasureSpec, 'chords' | 'verses'> {
  const chords: EasyScoreMeasureSpec['chords'][number][] = [];
  const verses: EasyScoreMeasureSpec['verses'][number][] = [];
  for (const voice of measure.voices) {
    const syllables: EasyScoreMeasureSpec['verses'][number][number][] = [];
    for (const [i, event] of voice.events.entries()) {
      const note = noteId(event.id);
      // Publication accepts plain descriptors. String techniques travel as playing instructions.
      // The part names its string and release alongside any chord symbol at the same onset.
      const labels = event.chord ? [event.chord.text] : [];
      if (labelTechniques) for (const head of event.heads) {
        if ((head.connection || head.hammer) && staff === 'tab') {
          labels.push(head.connection === 'pull' ? 'P' : head.connection === 'slide' ? 'Slide' : 'H');
        }
        if (head.openSlide && staff === 'notation') labels.push(describeOpenSlide(head.openSlide, head.position.str));
        if (head.prebend) labels.push(describePrebend(head.prebend, head.position.str));
      }
      if (publication) {
        for (const gesture of event.gestures ?? []) {
          if ('direction' in gesture) labels.push(gesture.kind + ' ' + gesture.direction);
          else labels.push(gesture.kind === 'tap' ? 'T' : gesture.wide ? 'Wide vibrato' : 'Vibrato');
        }
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

/** Fit a voice's native verse to the lowest required baseline across its final system.
 * Re-run the native phrase solver so the syllables, hyphens and extenders move together. */
export function alignVerseBaselines<Staff extends string>(score: ParsedScore, composition: EasyScoreComposition,
  staves: Staff[], eventId: (staff: Staff, id: string) => string) {
  for (const row of composition.sheet.getContinuousLayout().rows) {
    const lanes = new Map<Staff, Map<number, Annotation[]>>();
    const measures = new Set<number>();
    for (const number of row.measures) {
      const m = score.measures[number - 1];
      for (const [vi, voice] of m.voices.entries()) for (const event of voice.events) {
        if (!event.lyric) continue;
        const staff = voice.hand ? staves.find(s => s === voice.hand) : staves[0];
        if (!staff) continue;
        const note = composition.getNote(eventId(staff, event.id));
        const mark = note.getModifiers().find((mod): mod is Annotation => mod instanceof Annotation &&
          mod.phraseManaged && mod.getVerticalJustification() === Annotation.VerticalJustify.BOTTOM);
        if (!mark) continue;
        const voices = lanes.get(staff) ?? new Map<number, Annotation[]>();
        const syllables = voices.get(vi) ?? [];
        syllables.push(mark);
        voices.set(vi, syllables);
        lanes.set(staff, voices);
        measures.add(number);
      }
    }
    if (measures.size < 2) continue;
    const pinned: Annotation[] = [];
    for (const voices of lanes.values()) {
      let bottom = -Infinity;
      for (const [, syllables] of [...voices].sort(([a], [b]) => a - b)) {
        const ink = syllables.map(mark => mark.getTextInk(0, 0));
        const baseline = Math.max(...syllables.map(mark => mark.computeY().y), bottom - Math.min(...ink.map(box => box.y)));
        for (const mark of syllables) mark.setTextBaseline(baseline);
        pinned.push(...syllables);
        bottom = baseline + Math.max(...ink.map(box => box.y + box.h)) + syllables[0].getNote().getStave().space(0.35);
      }
    }
    for (const n of measures) {
      composition.systems[n - 1].getPhraseLayout().format(composition.staves[n - 1], composition.voices[n - 1].flat());
    }
    // Retained native objects may later be formatted at a different width. Preserve the computed
    // layout baseline for this draw, and release the absolute pin for the next formatting pass.
    for (const mark of pinned) mark.setTextBaseline(undefined);
  }
}
