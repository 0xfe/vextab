// Describe measured chord and lyric marks, and draw the score's low-to-high chord-frame key.
import { lyrics } from './verses';
import { describeOpenSlide } from './open-slide';
import { describePrebend } from './music';
import { Fraction, type EasyScoreMeasureSpec } from 'vexflow';
import type { Measure, ParsedScore } from './model';
import { ScoreError, type SourceRange } from './source';

/** VexTab supplies each verse as an ordered sequence of syllables. */
type VerseSyllable = Extract<EasyScoreMeasureSpec['verses'][number], readonly unknown[]>[number];

type Register = (id: string, range: SourceRange, event: string) => string;

/** Use note IDs so Publication can recreate the same marks in a fresh composition. */
export function leadMarks(measure: Measure, staff: 'notation' | 'tab', noteId: (id: string) => string,
  labelTechniques: boolean, publication = false, guitarChordLane = false, extensions = new Map<number, string>()): Pick<EasyScoreMeasureSpec, 'chords' | 'verses'> {
  const chords: EasyScoreMeasureSpec['chords'][number][] = [];
  const verses: EasyScoreMeasureSpec['verses'][number][] = [];
  for (const voice of measure.voices) {
    const lanes = new Map<string, VerseSyllable[]>();
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
          if ('direction' in gesture) {
            // Piano parts and polyphonic guitar already print the stroke itself.
            if (!measure.state.piano && !guitarChordLane) labels.push(gesture.kind + ' ' + gesture.direction);
          }
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
        lanes.get(lane).push({ note, text, elideWith, hyphenAfter: hyphen,
          extendTo: extend ? noteId(crossConnector ? extensions.get(range.start) : voice.events[i + extend].id) : undefined });
      }
    }
    for (const lane of [...lanes.keys()].sort()) verses.push({ id: lane, syllables: lanes.get(lane) });
  }
  return { chords, verses };
}

/** Order chord grips by their first written beat, including when the bass introduces a grip. */
function framedAttacks(measure: Measure) {
  return measure.voices.flatMap(voice => voice.events.filter(event => event.frame))
    .map(event => ({ event, beat: new Fraction().parse(event.onset).value() }))
    .sort((a, b) => a.beat - b.beat);
}

/** Preserve written occurrence order while VexFlow lays out the labelled frames. */
export function openingFrames(score: ParsedScore, register: Register) {
  return score.measures.flatMap(measure => framedAttacks(measure).map(({ event }) => {
    const { spec, range } = event.frame;
    const source = 'frame' + range.start;
    return { id: register(source, range, event.id), source, diagram: { ...spec, label: event.chord.text } };
  }));
}
