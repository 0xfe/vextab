// Translate one v2 instrument into the measured score used by engraving, printing, navigation and playback.
import { Fraction, FrettedInstrument, KeyManager, Music, Tuning } from 'vexflow';
import type { Attack, Head, Measure, MeasureVoice, ParsedScore, StaffState } from '../model';
import { midiPitch, soundingGuitarPitch, spellFret } from '../music';
import { drumKit } from '../drums';
import { ScoreError, type SourceRange } from '../source';
import type { ScoreV2, Head as WrittenHead, ScoreVoice, ScoreEvent, TextRange } from './model';

/** Index the original revision once. CRLF and non-BMP characters keep their DOM selection offsets. */
function locations(source: string) {
  const lines = [0];
  const breaks = /\r\n|\r|\n/g;
  while (breaks.exec(source)) lines.push(breaks.lastIndex);
  return ([start, end]: TextRange): SourceRange => {
    let low = 0, high = lines.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lines[middle] <= start) low = middle;
      else high = middle;
    }
    return { start, end, line: low + 1, column: start - lines[low] };
  };
}

/** Dotted durations reduce to numerators 3 or 7. VexFlow takes the undotted denominator separately. */
function writtenRhythm(fraction: string) {
  const [n, d] = fraction.split('/').map(Number);
  const dots = [1, 3, 7].indexOf(n);
  const denominator = d / 2 ** dots;
  return { base: ({ 1: 'w', 2: 'h', 4: 'q' })[denominator] ?? String(denominator), dots };
}

/** A score object represents one parsed revision. Retain its projection for mounted player geometry. */
const projections = new WeakMap<ScoreV2, Map<number, ParsedScore>>();

/** Lower a single instrument into its reusable performance and engraving model. */
export function projectScoreV2(score: ScoreV2, index = 0): ParsedScore {
  if (!Number.isInteger(index) || !score.parts[index]) throw new RangeError('No instrument at partIndex ' + index);
  let parts = projections.get(score);
  if (!parts) projections.set(score, parts = new Map());
  const prior = parts.get(index);
  if (prior) return prior;
  const part = score.parts[index], locate = locations(score.source);
  const declaration = locate(part.range);
  const tuning = new Tuning(part.tuning ?? 'standard'), manager = new KeyManager(part.key ?? 'C'), music = new Music();
  const capo = part.capo ?? 0;
  const hasUnassignedPitch = part.staves.some(staff => staff.voices.some(voice =>
    voice.events.some(event => event.heads.some(head => 'pitch' in head))));
  if (hasUnassignedPitch && (part.view === 'tab' || part.view === 'both')) {
    throw new ScoreError('measure', 'A tab view needs a string and fret for every pitch', declaration);
  }
  const tuningName = part.tuning ?? 'standard';
  const state: StaffState = {
    declaration, timeRange: locate(score.meterRange ?? part.range), meter: score.meter, showTime: !!score.meterRange,
    tab: part.kind === 'guitar' && part.view !== 'notation' && !hasUnassignedPitch, notation: part.view !== 'tab', piano: part.kind === 'piano',
    tuning: tuningName, strings: (Tuning.names[tuningName] ?? tuningName).split(',').length, capo, key: part.key ?? 'C',
    clef: part.kind === 'drums' ? 'percussion' : part.clef ?? 'treble', pickup: score.pickup, fragment: false,
  };
  const measures: Measure[] = [];
  const projected: ParsedScore = { source: score.source, measures, ties: [], spans: [], measureNumbers: false };
  const fullBar = new Fraction().parse(score.meter).simplify().toString();

  /** Keep the displayed spelling, sounding pitch and physical position distinct. */
  function projectHead(head: WrittenHead): Head {
    const range = locate(head.range);
    const marks: Head['marks'] = [];
    let result: Head;
    if ('drum' in head) result = { drum: head.drum, written: drumKit.note([head.drum], 'q').keys[0], sounding: null, range };
    else if ('pitch' in head) {
      const letter = head.pitch[0].toLowerCase(), sign = head.pitch.slice(1, -1);
      manager.reset();
      const spelling = sign ? letter + (sign === 'n' ? '' : sign) : manager.getAccidental(letter).note;
      const written = spelling + '/' + head.pitch.slice(-1);
      result = { written, sounding: written, accidental: sign || undefined, range };
    } else {
      if (head.string > state.strings) throw new ScoreError('measure', 'String outside the tuning', range);
      const position = { str: head.string, fret: head.fret === 'x' ? 'X' as const : head.fret };
      const bend = head.marks.find(m => m.kind === 'prebend');
      const fret = (bend?.semitones ?? 0) + (typeof head.fret === 'number' ? head.fret : 0) + capo;
      const [name, octave] = spellFret(tuning, manager, music, String(fret), head.string);
      result = { position, written: name + '/' + octave, sounding: head.fret === 'x' ? null : soundingGuitarPitch(tuning, fret, head.string), range };
    }
    for (const mark of head.marks) {
      if (mark.kind === 'prebend') result.prebend = { semitones: mark.semitones, release: mark.release };
      if (mark.kind === 'slideIn' || mark.kind === 'slideOut') result.openSlide = { edge: mark.kind === 'slideIn' ? 'in' : 'out', side: mark.side };
      if (mark.kind === 'finger') marks.push({ finger: String(mark.value), position: mark.side });
    }
    if ('hammerFrom' in head && head.hammerFrom) result.hammer = true;
    if (marks.length) result.marks = marks;
    if (result.sounding && midiPitch(result.sounding) === undefined) throw new ScoreError('measure', 'Pitch outside MIDI range', range);
    return result;
  }

  /** Place one expanded event on the measure clock and resolve its annotations. */
  function attack(event: ScoreEvent): Attack {
    const heads = event.heads.map(projectHead);
    const result: Attack = { id: event.id, range: locate(event.range), heads, slash: false,
      onset: event.at, duration: event.duration, ...writtenRhythm(event.writtenDuration) };
    if (event.rhythmRange) result.rhythmRange = locate(event.rhythmRange);
    if (event.kind === 'skip') result.silent = result.range;
    event.heads.forEach((h, i) => {
      for (const mark of h.marks) if (mark.kind === 'bend' && 'string' in h) {
        const range = locate(mark.range), positions = heads.map(head => head.position);
        if (result.bend || heads[i].prebend || positions.some(p => !p || typeof p.fret !== 'number'))
          throw new ScoreError('measure', 'A bend needs a pitched chord and one contour', range);
        const spec = { string: h.string, semitones: mark.semitones, rise: mark.rise, release: mark.release, hold: mark.hold };
        try { new FrettedInstrument(state.tuning, capo).bentAttack(positions as { str: number; fret: number }[], result.base, spec); }
        catch (e) { throw new ScoreError('measure', e.message, range); }
        result.bend = { spec, range };
      }
    });
    for (const mark of event.marks) {
      if (mark.kind === 'lyric') result.lyric = { text: mark.text, extend: mark.extend, hyphen: mark.hyphen, range: locate(mark.range) };
      if (mark.kind === 'symbol') result.chord = { text: mark.text, range: locate(mark.range) };
      if (mark.kind === 'accent') (heads[0].marks ??= []).push({ position: 'above' });
    }
    return result;
  }

  /** Build one measure voice at a time. Ties follow the preceding attack of this voice. */
  function addVoice(voice: ScoreVoice, hand?: 'right' | 'left') {
    const voices: MeasureVoice[] = [];
    let previous: Attack | undefined;
    function voiceAttack(event: ScoreEvent) {
      const next = attack(event);
      const used = new Set<number>();
      event.heads.forEach((head, i) => {
        const tie = head.marks.find(m => m.kind === 'tie');
        if (!tie) return;
        const range = locate(tie.range), target = next.heads[i];
        const fromHead = previous?.heads.findIndex((h,j) => !used.has(j) && target.sounding && h.written === target.written
          && h.sounding === target.sounding && h.position?.str === target.position?.str) ?? -1;
        if (fromHead < 0) throw new ScoreError('measure', 'Tie needs a matching preceding pitch and string', range);
        used.add(fromHead);
        projected.ties.push({ id: 'tie-' + next.id + '-' + i, from: previous.id, fromHead, to: next.id, toHead: i, range });
      });
      previous = next;
      return next;
    }
    for (const bar of voice.measures) {
      const range = locate(bar.barlineRange);
      const span = bar.number === 1 && score.pickup ? score.pickup : fullBar;
      const value: MeasureVoice = { declaration: locate(voice.range), hand, span, events: voice.events.slice(bar.start, bar.end).map(voiceAttack),
        tuplets: [], beams: true, beamRests: true, stemlets: false, middleRests: false, tabStems: true, tabDirection: 1 };
      const m = measures[bar.number - 1] ??= { number: bar.number, range, state: { ...state, showTime: state.showTime && bar.number === 1 },
        span, newRow: false, voices: [] };
      m.voices.push(value);
      voices.push(value);
    }
    for (const v of voices) v.events.forEach((e, i) => {
      if (e.lyric && i + e.lyric.extend >= v.events.length) throw new ScoreError('measure', 'Lyric extender exceeds its bar', e.lyric.range);
    });
    addEndings(voice);
    addSpans(voice, voices);
  }

  /** Endings describe shared bar boundaries even when only one voice declares the repeat. */
  function addEndings(voice: ScoreVoice) {
    for (const repeat of voice.repeats ?? []) {
      const range = locate(repeat.range);
      const first = measures[repeat.first - 1].voices[0];
      first.opening = { type: 'repeat-begin', range };
      repeat.endings.forEach((ending, i) => {
        const voice = measures[ending.last - 1].voices[0];
        if (i < repeat.endings.length - 1) voice.closing = { type: 'repeat-end', range };
        const from = measures[ending.first - 1].voices[0].events[0].id;
        const id = 'ending-' + from;
        const existing = projected.spans.find(s => s.id === id);
        if (existing) {
          if (existing.kind !== 'volta' || existing.lastBar !== ending.last || existing.label !== (i + 1) + '.')
            throw new ScoreError('measure', 'Voices disagree about repeat endings', range);
        } else projected.spans.push({ kind: 'volta', id, label: (i + 1) + '.', firstBar: ending.first, lastBar: ending.last,
          from, to: voice.events[voice.events.length - 1].id, range });
      });
    }
  }

  /** Split cross-bar tuplets for the measure engraver and retain the head endpoints of hammers. */
  function addSpans(voice: ScoreVoice, voices: MeasureVoice[]) {
    const indices = new Map(voice.events.map((event, i) => [event.id, i]));
    for (const mark of voice.spans) {
      const range = locate(mark.range);
      if (mark.kind === 'hammer') {
        projected.spans.push({ kind: 'hammer', id: 'hammer-' + mark.to.event + '-' + mark.to.head, range,
          from: mark.from.event, to: mark.to.event, fromHead: mark.from.head, toHead: mark.to.head });
      } else {
        const first = indices.get(mark.first), last = indices.get(mark.last);
        const [numNotes, notesOccupied] = mark.ratio.split(':').map(Number);
        for (let i = first; i <= last;) {
          const bar = voice.measures[voice.events[i].bar - 1];
          const end = Math.min(bar.end, last + 1);
          voices[bar.number - 1].tuplets.push({ start: i - bar.start, count: end - i, numNotes, notesOccupied, range });
          i = end;
        }
      }
    }
  }
  for (const staff of part.staves) for (const voice of staff.voices) {
    addVoice(voice, staff.name === 'upper' ? 'right' : staff.name === 'lower' ? 'left' : undefined);
  }
  parts.set(index, projected);
  return projected;
}
