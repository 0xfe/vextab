// Describe measured chord and lyric marks, and draw the score's low-to-high chord-frame key.
import { lyrics } from './verses';
import { describeOpenSlide } from './open-slide';
import { describePrebend } from './music';
import { scoreFont } from './engraving';
import { Annotation, FretDiagram, type EasyScoreComposition, type EasyScoreMeasureSpec, type RenderContext, type ScoreHitRegion } from 'vexflow';
import type { Measure, ParsedScore } from './model';
import { ScoreError, type SourceRange } from './source';

type Register = (id: string, range: SourceRange, event: string) => string;

/** Use note IDs so Publication can recreate the same marks in a fresh composition. */
export function leadMarks(measure: Measure, staff: 'notation' | 'tab', noteId: (id: string) => string,
  labelTechniques: boolean, publication = false): Pick<EasyScoreMeasureSpec, 'chords' | 'verses'> {
  const chords: EasyScoreMeasureSpec['chords'][number][] = [];
  const verses: EasyScoreMeasureSpec['verses'][number][] = [];
  for (const voice of measure.voices) {
    const lanes = new Map<string, EasyScoreMeasureSpec['verses'][number][number][]>();
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
      if (event.harmony && labels.length === 1) chords.push({ note, harmony: event.harmony });
      else if (labels.length) chords.push({ note, text: labels.join(' · ') });
      for (const lyric of lyrics(event)) {
        const { text, hyphen, extend, range, verse, elideWith, crossConnector } = lyric;
        if (staff === 'tab') throw new ScoreError('fixed-layout', 'This lyric needs a notation staff', range);
        const lane = verse ?? '';
        if (!lanes.has(lane)) lanes.set(lane, []);
        lanes.get(lane).push({ note, text, elideWith, hyphenAfter: hyphen && !crossConnector,
          extendTo: extend && !crossConnector ? noteId(voice.events[i + extend].id) : undefined });
      }
    }
    for (const lane of [...lanes.keys()].sort()) verses.push(lanes.get(lane));
  }
  return { chords, verses };
}

/** Draw native diagrams in source order above the music, wrapping the key with the score. */
export function drawFrames(score: ParsedScore, width: number, ctx: RenderContext, register: Register, top = 0) {
  const regions: ScoreHitRegion[] = [];
  let x = 10, y = top + 6, bottom = top, right = 0;
  ctx.save();
  ctx.setFont(scoreFont, 12);
  for (const measure of score.measures) for (const voice of measure.voices) for (const event of voice.events) {
    if (!event.frame) continue;
    const { spec, range } = event.frame;
    const id = register('frame' + range.start, range, event.id);
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
  return { height: bottom - top, width: right, regions };
}

/** Collect related marks from a single instrument so like-named voices on other staves stay independent. */
function verseLanes<Staff extends string>(score: ParsedScore, measures: number[], composition: EasyScoreComposition,
  staves: Staff[], eventId: (staff: Staff, id: string) => string) {
  const lanes = new Map<Staff, Map<string, Annotation[]>>();
  for (const number of measures) {
    for (const [vi, voice] of score.measures[number - 1].voices.entries()) for (const event of voice.events) {
      if (!event.lyric && !event.verses?.length) continue;
      const staff = voice.hand ? staves.find(s => s === voice.hand) : staves[0];
      if (!staff) continue;
      const note = composition.getNote(eventId(staff, event.id));
      const voices = lanes.get(staff) ?? new Map<string, Annotation[]>();
      for (const lyric of lyrics(event)) {
        const lane = lyric.verse ?? '';
        const mark = note.getModifiers().find((m): m is Annotation => m instanceof Annotation &&
          m.getAttribute('id') === eventId(staff, 'lyric' + lyric.range.start + '-' + event.id));
        if (!mark) continue;
        const key = vi + ':' + lane;
        if (!voices.has(key)) voices.set(key, []);
        voices.get(key).push(mark);
      }
      lanes.set(staff, voices);
    }
  }
  return lanes;
}

/** A local part retains its original IDs when placed in a conductor score or publication. */
type LyricInstrument<Staff extends string> = {
  score: ParsedScore; view: { staves: Staff[]; eventId: (staff: Staff, id: string) => string };
};

/** Anchor a native cross-system hyphen to the final ink of the verse on each end. */
function alignHyphens<Staff extends string>(composition: EasyScoreComposition, instruments: LyricInstrument<Staff>[]) {
  const ends = new Map<string, { from: Annotation; to: Annotation }>();
  for (const { score, view } of instruments) {
    const hyphens = score.spans.filter(span => span.kind === 'hyphen');
    if (!hyphens.length) continue;
    const events = new Map(score.measures.flatMap(m => m.voices.flatMap(v =>
      v.events.map(event => [event.id, { event, staff: v.hand ? view.staves.find(s => s === v.hand) : view.staves[0] }] as const))));
    for (const span of hyphens) {
      if (!('lane' in span)) continue;
      const marks = [span.from, span.to].map(id => {
        const owner = events.get(id);
        if (!owner?.staff) return;
        const word = lyrics(owner.event).find(l => (l.verse ?? '') === span.lane);
        if (!word) return;
        const markId = view.eventId(owner.staff, 'lyric' + word.range.start + '-' + id);
        return composition.getNote(view.eventId(owner.staff, id)).getModifiers()
          .find((m): m is Annotation => m instanceof Annotation && m.getAttribute('id') === markId);
      });
      if (marks[0] && marks[1]) ends.set(view.eventId(events.get(span.from).staff, span.id), { from: marks[0], to: marks[1] });
    }
  }
  for (const fragment of composition.sheet.getContinuousLayout().fragments) {
    const pair = ends.get(fragment.id);
    if (!pair || fragment.part === 'middle') continue;
    const word = fragment.part === 'last' ? pair.to : pair.from;
    fragment.y1 = fragment.y2 = word.computeY().y + word.getYShift();
    if (fragment.part !== 'last') {
      const ink = pair.from.getTextInk(pair.from.computeX().x, pair.from.computeY().y);
      fragment.x1 = ink.x + ink.w + fragment.space * 0.35;
    }
    if (fragment.part !== 'first') fragment.x2 = pair.to.getTextInk(pair.to.computeX().x, pair.to.computeY().y).x - fragment.space * 0.2;
  }
}

/** Refit local syllable lanes, then attach continuous hyphens to their final endpoints. */
export function alignVerseBaselines<Staff extends string>(composition: EasyScoreComposition, instruments: LyricInstrument<Staff>[]) {
  for (const row of composition.sheet.getContinuousLayout().rows) {
    if (row.measures.length < 2) continue;
    const pinned: Annotation[] = [];
    for (const { score, view } of instruments) {
      const lanes = verseLanes(score, row.measures, composition, view.staves, view.eventId);
      for (const voices of lanes.values()) {
        let bottom = -Infinity;
        for (const [, syllables] of [...voices].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
          const ink = syllables.map(mark => mark.getTextInk(0, 0));
          const baseline = Math.max(...syllables.map(mark => mark.computeY().y), bottom - Math.min(...ink.map(box => box.y)));
          for (const mark of syllables) mark.setTextBaseline(baseline);
          pinned.push(...syllables);
          bottom = baseline + Math.max(...ink.map(box => box.y + box.h)) + syllables[0].getNote().getStave().space(0.35);
        }
      }
    }
    if (!pinned.length) continue;
    for (const n of row.measures) {
      // A native system owns every instrument's phrase lanes. Formatting a single instrument here
      // would clear the other voices' connector placements and ignore their ink.
      const phrase = composition.systems[n - 1].getPhraseLayout();
      const staves = composition.staves[n - 1];
      // ContinuousLayout has already fitted a common staff gap across the entire row.
      for (const lower of staves.slice(1)) phrase.lockStaffGap(lower);
      phrase.format(staves, composition.voices[n - 1].flat());
    }
    for (const mark of pinned) mark.setTextBaseline(undefined);
  }
  alignHyphens(composition, instruments);
}
