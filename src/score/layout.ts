// Project the shared score into fresh VexFlow objects for each screen or publication view.
import { position, staveRow, printedGeometry, scoreSurfaces, type Geometry } from '../playback/geometry';
import { lyrics } from './verses';
import { editionSettings, type EditionOptions } from './editions';
import { locations, projectScoreV2 } from './grammar2/project';
import type { ScoreV2 } from './grammar2/model';
import { attachHeadMarks } from './head-marks';
import { TextLanes } from './text-lanes';
import { drumKit } from './drums';
import { attachOpenSlide, describeOpenSlide } from './open-slide';
import { inkStyle, setFretPaper } from './color';
import { drawPrepared, spansForInset, type PartDrawingOptions } from './publication-draw';
import { conductorSpec, instrumentComposition, instrumentLabel, selectedPart, type PartSelector } from './conductor';
import { drawHeading } from './score-details';
import { drawSwingMark } from './swing-mark';
import { scoreFont } from './engraving';
import {
  AlternatingTremolo, Ornament, TextDynamics, Clef, Fraction, Accidental, Annotation, Stroke, Vibrato, Articulation, Modifier, TabSlide, Barline, StaveNote, TabNote, TabTie, Factory, FrettedInstrument, Publication, ScoreNavigation, SVGContext, CanvasContext,
  type Beam, type StemmableNote, type ContinuousSpan, type EasyScoreComposition, type EasyScoreCompositionSpec, type EasyScoreContent,
  type EasyScoreVoiceSpec, type NotationIdentity, type PublicationOptions, type RenderContext, type ScoreHitRegion,
} from 'vexflow';
import { describePrebend, makePrebend } from './music';
import { leadMarks, drawFrames, alignPianoChords, alignVerseBaselines } from './lead';
import type { Attack, Measure, MeasureVoice, ParsedScore, PianoHand, ScoreSpan } from './model';
import { ScoreError, type SourceRange } from './source';

type Staff = 'notation' | 'tab' | PianoHand;
export type Part = 'score' | Staff;

/** Different views may coexist in one document. Keep DOM IDs unique and musical IDs stable. */
let nextView = 0;
function projections(parsed: ParsedScore, part: Part): Staff[] {
  const initial = parsed.measures[0].state;
  const choices: Staff[] = initial.piano ? ['right', 'left']
    : (['notation', 'tab'] as const).filter(s => initial[s]);
  const staves = choices.filter(s => part === 'score' || part === s || (initial.piano && part === 'notation'));
  if (!staves.length) throw new ScoreError('fixed-layout', `No ${part} staff in this score`, initial.declaration);
  for (const m of parsed.measures) {
    if (m.state.piano !== initial.piano || (['notation', 'tab'] as const).some(s =>
        (part === 'score' || part === s) && m.state[s] !== initial[s]) ||
        (staves.includes('tab') && m.state.strings !== initial.strings)) {
      throw new ScoreError('fixed-layout', 'A flow score must keep its staff configuration', m.state.declaration);
    }
  }
  return staves;
}

/** Guitar projects the same voices twice. Piano assigns each voice to one physical stave. */
function voicesFor(measure: Measure, staff: Staff): MeasureVoice[] {
  return measure.state.piano ? measure.voices.filter(voice => voice.hand === staff) : measure.voices;
}

/** Resolve geometry or a publication ID only against the source revision that produced it. */
class Sources {
  readonly ids: Record<string, string> = Object.create(null);
  private readonly ranges = new Map<string, SourceRange>();
  private readonly prefix = 'vt' + (++nextView) + '-';
  constructor(private readonly revision: string) {}
  id = (staff: Staff, event: string) => this.prefix + staff + '-' + event;
  project(staff: Staff, id: string, range: SourceRange, occurrence?: string): string {
    const projected = this.id(staff, occurrence ? id + '-' + occurrence : id);
    this.ids[projected] = id;
    this.ranges.set(id, range);
    return projected;
  }
  rangeFor = (id: string, currentSource: string): SourceRange | undefined =>
    currentSource === this.revision ? this.ranges.get(this.ids[id] ?? id) : undefined;
  sourceFor = (projection: string): string | undefined => this.ids[projection];
}

/** Ask the instrument for string identities, dead heads and a selected-string bend.
 * The compiler owns written spelling, including explicit pitch overrides and the key. */
function guitarNotation(event: Attack, instrument: FrettedInstrument) {
  const physical = event.heads.flatMap((h, index) => h.position ? [{ ...h.position, displayKey: h.written, index }] : []);
  const labels: NotationIdentity[] = [];
  if (event.bend) {
    const pitched = physical.map(p => ({ str: p.str, fret: Number(p.fret) }));
    labels.push(...instrument.attack(physical, event.base).note.notation);
    const contours = event.heads.some(h => h.bend)
      ? event.heads.flatMap(h => h.bend && !h.tiedBendStart ? [h.bend] : []) : [event.bend.spec];
    for (const contour of contours) {
      labels.push(...instrument.bentAttack(pitched, event.base, contour).note.notation.filter(mark => mark.bend));
    }
  } else if (physical.length) {
    for (const mark of instrument.attack(physical, event.base).note.notation) {
      labels.push({ ...mark, index: physical[mark.index].index });
    }
  }
  event.heads.forEach((h, index) => {
    if (h.openSlide) labels.push({ kind: 'technique', id: 'open-slide', index, label: describeOpenSlide(h.openSlide, h.position.str) });
    if (h.prebend) labels.push({ kind: 'technique', id: 'pre-bend', index, label: describePrebend(h.prebend, h.position.str) });
    if (!h.position && h.sounding === null) labels.push({ kind: 'unpitched', id: 'slash', label: 'Rhythm slash', index });
  });
  return labels;
}

/** Hands on the same physical stave need independent stem directions, including through their rests. */
function handsShareStave(measure: Measure) {
  if (!measure.state.piano) return false;
  const owners = new Map<PianoHand, PianoHand>();
  for (const voice of measure.voices) for (const event of voice.events) {
    if (!voice.hand || event.silent) continue;
    const staff = event.displayHand ?? voice.hand;
    if (owners.has(staff) && owners.get(staff) !== voice.hand) return true;
    owners.set(staff, voice.hand);
  }
  return false;
}

/** Both projections use the written duration, including dots before tuplet scaling. */
function voiceSpec(voice: MeasureVoice, measure: Measure, staff: Staff, sources: Sources, index: number, voiceCount: number,
  sharedPianoStaff: boolean): EasyScoreVoiceSpec {
  let direction = voice.stem;
  if (!direction && voiceCount > 1) direction = index === 0 ? 'up' : 'down';
  if (!direction && sharedPianoStaff) direction = voice.hand === 'right' ? 'up' : 'down';
  const stemDirection = direction ? (direction === 'up' ? 1 : -1) : staff === 'tab' ? voice.tabDirection : undefined;
  const instrument = new FrettedInstrument(measure.state.tuning, measure.state.capo);
  const clef = staff === 'left' ? 'bass' : measure.state.clef;
  let pairStem: number;
  const notes: EasyScoreContent[] = voice.events.map(event => {
    const id = sources.project(staff, event.id, event.range);
    const destination = measure.state.piano ? event.displayHand : undefined;
    const rhythm = { duration: event.base, dots: event.dots, stemDirection };
    if (!event.heads.length) {
      // Rest positions count up from the bottom of the written staff, including shorter tab staves.
      const offset = staff === 'tab' ? 5 - measure.state.strings : 0;
      const restLine = event.restLine === undefined ? undefined : event.restLine + offset;
      return { id, ...(destination && { stave: destination }), note: { ...rhythm, keys: ['r/4'], clef: 'treble', type: 'r', restLine } };
    }
    if (event.heads[0].drum) {
      const hit = (measure.state.kit ?? drumKit).note(event.heads.map(head => head.drum), event.base, direction);
      return { id, note: { ...hit, dots: event.dots } };
    }
    const notation = guitarNotation(event, instrument);
    const keys = event.heads.map(h => h.position?.fret === 'X' ? h.written + '/X' : h.written);
    if (staff === 'tab') {
      return { id, tab: { ...rhythm, keys, notation, positions: event.heads.map(h => ({ ...h.position! })) }, drawStem: voice.tabStems && !['w', '1'].includes(event.base) };
    }
    const writtenClef = destination === 'left' ? 'bass' : destination === 'right' ? 'treble' : clef;
    const note = { ...rhythm, keys, notation, clef: writtenClef, type: event.slash ? 's' : 'n', autoStem: !direction };
    if (event.tremolo) {
      // Decide once before layout. An automatic second endpoint can otherwise flip across the middle line.
      if (pairStem === undefined) {
        pairStem = stemDirection ?? new StaveNote({ ...note, autoStem: true }).getStemDirection();
        note.stemDirection = pairStem;
      } else {
        note.stemDirection = pairStem;
        pairStem = undefined;
      }
      note.autoStem = false;
    }
    return { id, ...(destination && { stave: destination }), note: event.tremolo ? AlternatingTremolo.endpoint(note, event.tremolo) : note,
      ...(event.grace && { grace: { side: event.grace.side, slur: true, beam: event.grace.pitches.length > 1,
        notes: event.grace.pitches.map(key => ({ keys: [key], duration: '16', clef: writtenClef })) } }) };
  });
  return {
    notes, stem: direction ?? 'auto',
    // The native auto-beamer reads divided tremolo ticks as shorter beamable notes.
    // Explicit beams in this voice/bar own their stems alongside the alternating strokes.
    autoBeam: !voice.events.some(e => e.continuousBeam || e.tremolo) && !voice.beamGroups?.length && voice.beams && (staff !== 'tab' || voice.tabStems) && {
      groups: voice.beatGroups?.map(n => new Fraction(n, Number(measure.state.meter.split('/')[1]))),
      stemDirection, beamRests: voice.beamRests, showStemlets: voice.stemlets, beamMiddleOnly: voice.middleRests },
    tuplets: voice.tuplets.map(t => ({ start: t.start, count: t.count, options: { numNotes: t.numNotes, notesOccupied: t.notesOccupied } })),
  };
}

/** Omit ordinary barlines so continuous layout can install its repeat boundaries. */
function writtenEndBar(measure: Measure) {
  const type = measure.voices[0].closing?.type;
  if (type === 'end') return Barline.type.END;
  if (type === 'double') return Barline.type.DOUBLE;
}

/** Retain declarative descriptors only. Every independently composed part gets fresh native objects. */
function project(parsed: ParsedScore, part: Part, width: number, publication = false) {
  const staves = projections(parsed, part);
  if (!staves.includes('tab')) {
    for (const m of parsed.measures) for (const v of m.voices) {
      const bend = v.events.find(e => e.bend)?.bend;
      if (bend) throw new ScoreError('fixed-layout', 'A timed bend contour needs a tab staff', bend.range);
    }
  }
  const sources = new Sources(parsed.source);
  const eventId = sources.id;
  const textLanes = new TextLanes();
  const spans: ContinuousSpan[] = [];
  // VexFlow can draw a tab ending between two TabNotes or two rendered rests.
  // A volta spans bar boundaries, so any compatible anchor in each boundary bar is sufficient.
  const rests = new Set(parsed.measures.flatMap(m => m.voices.flatMap(v => v.events.filter(e => !e.heads.length).map(e => e.id))));
  const mixedEndings: ScoreSpan[] = [];
  const spec: EasyScoreCompositionSpec = {
    accidentals: 'key-aware', graceAccidentals: 'ordered', sheet: { width, x: 10, y: parsed.layout?.top ?? 14, rowGap: parsed.layout?.rowGap ?? 36,
      ...(parsed.layout?.spacing && { measurePadding: 18, measureGap: 0 }) },
    system: { ...(parsed.layout?.spacing && { details: { spacing: { mode: parsed.layout.spacing } } }),
      spaceBetweenStaves: parsed.layout?.staffDistance ?? 9 },
    staves: staves.map(staff => ({
      id: staff, kind: staff === 'tab' ? 'tab' : 'stave',
      // Native instrument labels reserve horizontal room for the brace on every printed system.
      ...(staff === 'right' && { name: 'R.H.', shortName: 'R.H.' }),
      ...(staff === 'left' && { name: 'L.H.', shortName: 'L.H.' }),
      ...instrumentLabel(parsed, staff, staff === staves[0]),
      options: staff === 'tab' ? { numLines: parsed.measures[0].state.strings } : {},
      measures: parsed.measures.map(m => {
        const voices = voicesFor(m, staff);
        const sharedPianoStaff = handsShareStave(m);
        const showMarks = staff === staves[0] || m.state.piano;
        const clef = staff === 'tab' ? 'tab' : staff === 'left' ? 'bass' : m.state.clef;
        return {
          clef, key: m.state.key, time: m.state.meterSign ?? m.state.meter, span: m.span === '0/1' ? '1/1' : m.span,
          showTimeSignature: m.state.showTime && !(staff === 'tab' && staves.includes('notation')),
          endBarline: writtenEndBar(m),
          ...(showMarks && leadMarks({ ...m, voices }, staff === 'tab' ? 'tab' : 'notation',
            id => eventId(staff, id), publication || !staves.includes('tab'), publication)),
          voices: [
            ...voices.map((v, index) => v.events.length ? voiceSpec(v, m, staff, sources, index, voices.length, sharedPianoStaff)
              : { notes: [textLanes.anchor(eventId(staff, 'blank-' + m.number + '-' + index), null)] }),
            ...(staff === staves[0] ? m.text ?? [] : []).map(lane => ({
              notes: lane.map(cell => {
                for (const at of cell.boundaries ?? []) sources.project(staff, cell.id + '-at-' + at.range.start, at.range);
                return textLanes.anchor(sources.project(staff, cell.id, cell.range), cell);
              }),
            })),
          ],
        };
      }),
    })),
    continuous: {
      courtesy: false, measureNumbers: parsed.measureNumbers, spans,
      groups: staves.length === 2 ? [{
        first: staves[0], last: staves[1], type: parsed.measures[0].state.piano ? 'brace' : 'bracket',
        barlines: !!parsed.measures[0].state.piano,
      }] : [],
      boundaries: parsed.measures.map(m => ({
        measure: m.number, rehearsal: m.voices[0].rehearsal, breakBefore: m.newRow && m.number > 1 ? 'force' : undefined,
        repeatStart: ['repeat-begin', 'repeat-both'].includes(m.voices[0].opening?.type),
        repeatEnd: ['repeat-end', 'repeat-both'].includes(m.voices[0].closing?.type),
      })),
    },
  };
  for (const tie of parsed.ties) {
    for (const staff of staves) {
      const from = eventId(staff, tie.from);
      if (!sources.ids[from]) continue;
      spans.push({ kind: 'tie', id: sources.project(staff, tie.id, tie.range), from,
        to: eventId(staff, tie.to),
        ...(staff === 'tab' && tie.bend && { bend: tie.bend, string: tie.string }), fromHead: tie.fromHead, toHead: tie.toHead });
    }
  }
  for (const mark of parsed.spans ?? []) {
    if (mark.kind === 'tremolo') continue; // The paired native element uses final stem positions.
    if (mark.kind === 'continuousBeam' || mark.kind === 'crescendo' || mark.kind === 'diminuendo' || mark.kind === 'lyric' || mark.kind === 'hyphen') {
      for (const staff of staves) {
        const from = eventId(staff, mark.from), to = eventId(staff, mark.to);
        if (!sources.ids[from] || !sources.ids[to] || staff === 'tab') continue;
        spans.push({ kind: mark.kind === 'continuousBeam' ? 'beam' : mark.kind, from, to,
          ...('niente' in mark && { niente: mark.niente }), ...('lane' in mark && { syllableId: eventId(staff, 'lyric' + mark.range.start + '-' + mark.from) }),
          id: sources.project(staff, mark.id, mark.range) });
      }
      continue;
    }
    if ('fromHead' in mark) {
      for (const staff of staves) {
        if (staff === 'tab') continue; // Native tab ties require equal frets. Draw the guitar gesture after layout.
        const from = eventId(staff, mark.from);
        if (!sources.ids[from]) continue;
        spans.push({ kind: mark.kind === 'glissando' ? 'glissando' : 'tie', id: sources.project(staff, mark.id, mark.range), from, to: eventId(staff, mark.to),
          fromHead: mark.fromHead, toHead: mark.toHead });
      }
      continue;
    }
    if (mark.kind === 'slur') {
      for (const staff of staves) {
        const from = eventId(staff, mark.from);
        if (sources.ids[from]) spans.push({ kind: 'slur', id: sources.project(staff, mark.id, mark.range), from, to: eventId(staff, mark.to) });
      }
      continue;
    }
    if (mark.kind === 'palmMute' && !staves.includes('tab')) {
      throw new ScoreError('fixed-layout', 'A string-specific palm mute needs a tab staff', mark.range);
    }
    if (mark.kind !== 'palmMute' && mark.kind !== 'volta') continue;
    const staff = mark.kind === 'palmMute' ? 'tab' : staves[0];
    const id = sources.project(staff, mark.id, mark.range);
    const endpoints = { id, from: eventId(staff, mark.from), to: eventId(staff, mark.to) };
    if (mark.kind === 'palmMute') spans.push({ ...endpoints, kind: mark.kind, strings: mark.strings });
    else if (staff === 'tab' && rests.has(mark.from) !== rests.has(mark.to)) {
      const first = parsed.measures[mark.firstBar - 1].voices.flatMap(v => v.events);
      const last = parsed.measures[mark.lastBar - 1].voices.flatMap(v => v.events);
      const to = last.find(e => rests.has(e.id) === rests.has(mark.from));
      const from = first.find(e => rests.has(e.id) === rests.has(mark.to));
      if (to || from) spans.push({ ...endpoints, kind: 'volta', text: mark.label,
        from: to ? endpoints.from : eventId(staff, from.id), to: to ? eventId(staff, to.id) : endpoints.to });
      else mixedEndings.push(mark);
    }
    else spans.push({ ...endpoints, kind: mark.kind, text: mark.label });
  }
  if (staves.includes('left') && staves.includes('right')) {
    const pairs: { id: string; upper: string; lower: string }[] = [];
    for (const measure of parsed.measures) {
      const named = new Map<string, { upper?: string; lower?: string }>();
      for (const voice of measure.voices) for (const event of voice.events) if (event.sharedStem) {
        const name = event.sharedStem + ':' + event.onset;
        const pair = named.get(name) ?? {};
        const side = voice.hand === 'right' ? 'upper' : 'lower';
        if (pair[side]) throw new ScoreError('measure', 'Duplicate shared stem endpoint', event.range);
        pair[side] = eventId(voice.hand, event.id);
        named.set(name, pair);
      }
      for (const pair of named.values()) {
        if (!pair.upper || !pair.lower) throw new ScoreError('measure', 'Shared stems need simultaneous notes on both staves', measure.range);
        pairs.push({ id: pair.upper + '-shared', upper: pair.upper, lower: pair.lower });
      }
    }
    spec.continuous.splitChords = pairs;
  }
  return { spec, staves, sources, eventId, mixedEndings, textLanes };
}
type Projection = ReturnType<typeof project>;

/** A timed space breaks its own beam. Keep native metric groups and visible rest stemlets elsewhere. */
function splitSilentBeams(factory: Factory, beams: Set<Beam>, silent: Set<string>): void {
  for (const beam of beams) {
    beam.setRendered();
    let group: StemmableNote[] = [];
    const finish = () => {
      if (group.length > 1) factory.Beam({ notes: group }).renderOptions.showStemlets = beam.renderOptions.showStemlets;
      group = [];
    };
    for (const note of beam.getNotes()) {
      note.setBeam(undefined);
      if (silent.has(note.getAttribute('id'))) finish();
      else group.push(note);
    }
    finish();
  }
}

/* Attach playable guitar gestures and literal text before measuring their clearance. */
function attachPerformanceMarks(note: StaveNote | TabNote, event: Attack, tab: boolean) {
  for (const label of event.labels ?? []) {
    const annotation = new Annotation(label.text).setVerticalJustification(label.position === 'below' ? Annotation.VerticalJustify.BOTTOM : Annotation.VerticalJustify.TOP);
    annotation.setFont(label.family ?? scoreFont, label.size ?? 12, label.style === 'bold' ? 'bold' : undefined, label.style === 'italic' ? 'italic' : undefined);
    if (label.ink) annotation.setStyle(inkStyle(label.ink));
    note.addModifier(annotation, 0);
  }
  for (const gesture of event.gestures ?? []) {
    if (gesture.kind === 'tap') {
      if (tab) note.addModifier(new Annotation('T'), 0);
    } else if (gesture.kind === 'vibrato') {
      if (tab) note.addModifier(new Vibrato().setVibratoWidth(gesture.wide ? 28 : 18), 0);
    } else if (gesture.kind === 'stroke') {
      note.addModifier(new Articulation(gesture.direction === 'up' ? 'a|' : 'am').setPosition(Modifier.Position.BELOW), 0);
    } else if ('direction' in gesture) {
      const type = (gesture.kind === 'rasgueado' ? 'RASGUEADO' : gesture.kind.toUpperCase()) + '_' + gesture.direction.toUpperCase();
      note.addModifier(new Stroke(Stroke.Type[type]), 0);
    }
  }
}

/** Native alternating tremolos use a pair of prepared stems and draw after their final layout. */
function tremoloPairs(score: ParsedScore, view: Projection, composition: EasyScoreComposition) {
  return (score.spans ?? []).flatMap(span => span.kind === 'tremolo' ? view.staves.flatMap(staff => {
    const id = view.eventId(staff, span.from);
    if (staff === 'tab' || !view.sources.ids[id]) return [];
    return [{ first: composition.getNote(id) as StaveNote, last: composition.getNote(view.eventId(staff, span.to)) as StaveNote,
      strokes: span.strokes }];
  }) : []);
}

/** Decorate the fresh native objects of this part before the formatter measures their ink. */
function prepareScreen(parsed: ParsedScore, view: Projection, composition: EasyScoreComposition, factory: Factory) {
  const silent = new Set<string>();
  const split = new Set<Beam>();
  for (const m of parsed.measures) {
    for (const staff of view.staves) {
      const staveColor = m.state.color;
      if (staveColor) {
        const index = view.staves.indexOf(staff);
        composition.staves[m.number - 1][index].setStyle(inkStyle(staveColor));
        for (const voice of composition.voices[m.number - 1][index]) voice.setStyle(inkStyle(staveColor));
      }
      for (const voice of voicesFor(m, staff)) {
        if (staff === 'tab' && !voice.tabStems) continue;
        for (const group of voice.beamGroups ?? []) {
          const notes = voice.events.slice(group.start, group.end + 1).map(e => composition.getNote(view.eventId(staff, e.id)));
          factory.Beam({ notes: notes as StemmableNote[], options: { feathered: group.feather } });
        }
      }
      for (const voice of voicesFor(m, staff)) for (const event of voice.events) {
        const note = composition.getNote(view.eventId(staff, event.id));
        if (event.lyric || event.verses?.length) {
          const marks = note.getModifiers().filter((m): m is Annotation => m instanceof Annotation &&
            m.phraseManaged && m.getVerticalJustification() === Annotation.VerticalJustify.BOTTOM);
          const lanes = lyrics(event).sort((a, b) => (a.verse ?? '').localeCompare(b.verse ?? ''));
          marks.forEach((m, i) => {
            const range = lanes[i].range;
            m.setAttribute('id', view.sources.project(staff, 'lyric' + range.start, range, event.id));
          });
        }
        if (event.ornament && staff !== 'tab') note.addModifier(new Ornament(event.ornament.replace('_inverted', 'Inverted')), 0);
        if (event.dynamic && (voice.hand || staff === view.staves[0])) {
          const glyphs = [...event.dynamic].map(letter => TextDynamics.GLYPHS[letter]).join('');
          // A right-hand dynamic on the bass staff sits above the two voices, as in a grand staff.
          const side = voice.hand === 'right' && event.displayHand === 'left' ? Annotation.VerticalJustify.TOP : Annotation.VerticalJustify.BOTTOM;
          note.addModifier(new Annotation(glyphs).setFont('Bravura', 15).setVerticalJustification(side), 0);
        }
        attachPerformanceMarks(note as StaveNote | TabNote, event, staff === 'tab');
        if (event.color) {
          note.setStyle(inkStyle(event.color));
          if (note instanceof StaveNote) note.setLedgerLineStyle(inkStyle(event.color));
        }
        if (staveColor) note.getBeam()?.setStyle(inkStyle(staveColor));
        if (event.silent) {
          note.renderOptions.draw = false;
          silent.add(note.getAttribute('id'));
          const beam = note.getBeam();
          if (beam) split.add(beam);
        }
        event.heads.forEach((head, index) => {
          if (head.marks) attachHeadMarks(note, index, head.marks, staff === 'tab', true);
        });
        if (note instanceof TabNote) {
          event.heads.forEach((head, index) => {
            if (head.openSlide) attachOpenSlide(note, index, head.openSlide);
            if (head.prebend) note.addModifier(makePrebend(head.prebend), index);
          });
        }
        if (staff === 'tab' && !voice.tabStems) {
          // Keep VexFlow's exact tuplet multiplier. Skip the numeral on an unstemmed tab staff.
          for (const tuplet of note.getTupletStack()) tuplet.setRendered();
          if (!event.heads.length) note.renderOptions.draw = false;
        }
        // Native lead descriptors own the engraving. Retain the authored source IDs for diagnostics.
        if (staff === view.staves[0] || m.state.piano) {
          for (const mark of note.getModifiers()) {
            if (!(mark instanceof Annotation)) continue;
            // VexFlow's TAB chord label is an ordinary annotation outside the pitched phrase lane.
            const tabChord = staff === 'tab' && event.chord && mark.getText().split(' · ')[0] === event.chord.text;
            if (!mark.phraseManaged && !tabChord) continue;
            const kind = mark.getVerticalJustification() === Annotation.VerticalJustify.TOP ? 'chord' : 'lyric';
            if (kind === 'chord' && event.chord?.color) mark.setStyle(inkStyle(event.chord.color));
            const range = kind === 'chord' && event.chord?.range;
            if (range) mark.setAttribute('id', view.sources.project(staff, kind + range.start, range, event.id));
          }
        }
        if (staff === 'tab') continue;
        event.heads.forEach((head, i) => {
          if (!head.accidental) return;
          // An authored sign belongs to this voice even if another voice shares its head.
          const modifiers = note.getModifiers();
          const generated = modifiers.findIndex(mark => mark instanceof Accidental && mark.getIndex() === i);
          if (generated >= 0) modifiers.splice(generated, 1);
          const mark = new Accidental(head.accidental);
          note.addModifier(mark, i);
          if (head.cautionary) mark.setAsCautionary();
        });
      }
    }
  }
  splitSilentBeams(factory, split, silent);
}

/** Draw mixed rest/fret endings that the native tab span cannot yet anchor. */
function drawTabEndings(view: Projection, composition: EasyScoreComposition, ctx: RenderContext, full: EasyScoreComposition) {
  const regions: ScoreHitRegion[] = [];
  for (const mark of view.mixedEndings) {
    if (mark.kind !== 'volta') continue;
    const id = view.eventId('tab', mark.id);
    for (const [i, row] of composition.sheet.getContinuousLayout().rows.entries()) {
      const bars = row.measures.filter(n => n >= mark.firstBar && n <= mark.lastBar);
      if (!bars.length) continue;
      const first = bars[0], last = bars[bars.length - 1];
      const x = composition.staves[first - 1][0].getX() + 1;
      const right = composition.staves[last - 1][0].getNoteEndX();
      const staffOffset = composition.staves[first - 1][0].getY() - full.staves[first - 1][0].getY();
      const y = row.y + staffOffset - 15;
      ctx.save();
      ctx.openGroup('tab-ending', id + '-' + i);
      ctx.fillRect(x, y, right - x, 1);
      if (first === mark.firstBar) {
        ctx.fillRect(x, y, 1, 12);
        ctx.setFont(scoreFont, 11).fillText(mark.label, x + 4, y + 12);
      }
      if (last === mark.lastBar) ctx.fillRect(right - 1, y, 1, 12);
      ctx.closeGroup();
      ctx.restore();
      regions.push({ id, kind: 'span', source: mark.id, row: i, x, y, w: right - x, h: 14 });
    }
  }
  return regions;
}

/** Attach alternating tremolos and guitar connections after their native stem and string positions settle. */
function drawPairedMarks(parsed: ParsedScore, view: Projection, composition: EasyScoreComposition, ctx: RenderContext) {
  for (const { first, last, strokes } of tremoloPairs(parsed, view, composition)) {
    new AlternatingTremolo(first, last, strokes).setContext(ctx).draw();
  }
  if (view.staves.includes('tab')) for (const span of parsed.spans) {
    if (!('fromHead' in span)) continue;
    const from = composition.getNote(view.eventId('tab', span.from)) as TabNote;
    const to = composition.getNote(view.eventId('tab', span.to)) as TabNote;
    const indexes = { firstIndexes: [span.fromHead], lastIndexes: [span.toHead] };
    const up = Number(to.getPositions()[span.toHead].fret) > Number(from.getPositions()[span.fromHead].fret);
    const draw = (firstNote?: TabNote, lastNote?: TabNote) => {
      const ends = { firstNote, lastNote, ...indexes };
      const mark = span.kind === 'slide' || span.kind === 'glissando' ? new TabSlide(ends, up ? TabSlide.SLIDE_UP : TabSlide.SLIDE_DOWN)
        : !firstNote ? new TabTie(ends)
          : span.kind === 'pull' ? TabTie.createPulloff(ends) : TabTie.createHammeron(ends);
      mark.setContext(ctx).draw();
    };
    if (from.getStave().getY() === to.getStave().getY()) draw(from, to);
    else { draw(from); draw(undefined, to); }
  }
}

/** Anchor front matter to the first system after the formatter has placed its staff. */
function drawScoreHeading(parsed: ParsedScore, composition: EasyScoreComposition, ctx: RenderContext) {
  const row = composition.sheet.getRows()[0];
  if (!row) return;
  const swing = parsed.playback?.swing === 'eighths';
  const staffTop = composition.staves[0][0].getYForLine(0);
  if (parsed.layout?.heading) drawHeading(ctx, parsed.layout.heading, row.x, row.width, staffTop - (swing ? 40 : 0));
  if (swing) drawSwingMark(ctx, row.x + 6, row.y - 5);
}

/** Invisible timed events still advance the reader's clock but have no pointer target. */
function hiddenNotes(parsed: ParsedScore, view: Projection) {
  const hidden = new Set(parsed.measures.flatMap(m => m.voices.filter(v => !v.tabStems)
    .flatMap(v => v.events.filter(e => !e.heads.length).map(e => view.eventId('tab', e.id)))));
  for (const m of parsed.measures) for (const v of m.voices) for (const e of v.events) {
    if (e.silent) for (const staff of view.staves) hidden.add(view.eventId(staff, e.id));
  }
  return hidden;
}

type ScreenOptions = { width?: number; renderer?: 'svg' | 'canvas' };

/** A native part view borrows the conductor's systems and owns just its stave columns. */
type ScreenInstrument = { score: ParsedScore; view: Projection; local: EasyScoreComposition };

/** Resolve courtesy clefs and verse positions after native rows have their final coordinates. */
function finishLayout(composition: EasyScoreComposition, instruments: ScreenInstrument[]) {
  for (const { score, local } of instruments) {
    if (!score.measures[0].state.hideClef) continue;
    for (const row of local.staves) for (const stave of row) {
      for (const clef of stave.getModifiers(undefined, Clef.CATEGORY)) clef.setText('');
    }
  }
  alignVerseBaselines(composition, instruments);
  alignPianoChords(composition, instruments);
}

/** All voices use one row clock, including paired notation/TAB which references one attack twice. */
function playbackGeometry(composition: EasyScoreComposition, instruments: ScreenInstrument[]): Geometry {
  const geometry: Geometry = new Map();
  for (const band of composition.sheet.getContinuousLayout().rows) {
    const row = staveRow(band.measures.flatMap(n => composition.staves[n - 1]));
    for (const { score, view } of instruments) {
      for (const number of band.measures) for (const voice of score.measures[number - 1].voices) {
        for (const attack of voice.events) {
          const stavesForVoice = voice.hand ? [voice.hand] : view.staves;
          const glyphs = stavesForVoice.map(staff => composition.getNote(view.eventId(staff, attack.id)));
          geometry.set(attack.id, position(row, glyphs, attack.heads.map(h => (!!h.sounding || h.midi !== undefined) && !attack.silent)));
        }
      }
    }
  }
  return geometry;
}

/** Independently reflow one selected instrument or one of its existing score/hand/TAB projections. */
export function renderScore(host: HTMLElement, source: ParsedScore | ScoreV2,
  options: ScreenOptions & PartSelector & { part?: Part } = {}) {
  const part = options.part ?? 'score';
  const selected = 'parts' in source ? projectScoreV2(source, selectedPart(source, options)) : source;
  return renderParts(host, [selectVoices(selected, part)], part, options);
}

/** Build one native conductor composition and retain each source instrument for independent extraction. */
export function renderConductor(host: HTMLElement, document: ScoreV2, options: ScreenOptions = {}) {
  return renderParts(host, document.parts.map((_, i) => projectScoreV2(document, i)), 'score', options, true);
}

/** Prepare fresh native objects for the requested surface. Commit the DOM only after successful layout. */
function renderParts(host: HTMLElement, scores: ParsedScore[], part: Part, options: ScreenOptions, conductor = false) {
  const parsed = scores[0];
  const width = options.width ?? parsed.layout?.width ?? (host.clientWidth || 640);
  if (!Number.isFinite(width) || width <= 20) throw new RangeError('Score width must exceed 20 pixels');
  const views = scores.map(score => project(score, part, width - 20));
  const specs = views.map(view => view.spec);
  const spec = conductor ? conductorSpec(scores, specs) : specs[0];
  const surface = document.createElement('div');
  const canvas = options.renderer === 'canvas' ? surface.appendChild(document.createElement('canvas')) : undefined;
  const ctx = canvas ? new CanvasContext(canvas.getContext('2d')) : new SVGContext(surface);
  if (!canvas) setFretPaper(ctx, host);

  function frameKeys() {
    const regions: ScoreHitRegion[] = [];
    let height = 0, extent = 0;
    scores.forEach((score, i) => {
      const view = views[i];
      const key = drawFrames(score, width, ctx, (id, range, event) => view.sources.project(view.staves[0], id, range, event), height);
      height += key.height;
      extent = Math.max(extent, key.width);
      regions.push(...key.regions);
    });
    return { height, extent, regions };
  }
  const frames = frameKeys();
  if (parsed.layout?.heading) spec.sheet.y += 125;
  if (parsed.playback?.swing === 'eighths') spec.sheet.y += 40;
  spec.sheet.y += frames.height + (views.some(view => view.mixedEndings.length) ? 20 : 0);
  const factory = new Factory({ renderer: { elementId: null, width, height: 1 } }).setContext(ctx);
  const easy = factory.EasyScore();
  for (const view of views) easy.addCommitHook(view.textLanes.hook);
  const composition = easy.compose(spec);
  let offset = 0;
  const instruments = views.map((view, i) => {
    const local = views.length === 1 ? composition : instrumentComposition(composition, offset, view.staves.length);
    offset += view.staves.length;
    const score = scores[i];
    prepareScreen(score, view, local, factory);
    return { score, view, local };
  });

  function resize() {
    const rows = composition.sheet.getRows();
    const extent = Math.max(width, frames.extent, ...rows.map(r => r.x + r.width + 10));
    ctx.resize(extent, Math.ceil(composition.sheet.getHeight() + 20));
  }
  if (canvas) {
    composition.sheet.format();
    resize();
    if (frames.height) frameKeys();
  }
  drawPrepared(factory, () => finishLayout(composition, instruments));
  drawScoreHeading(parsed, composition, ctx);
  const labels = views.flatMap(view => [...view.textLanes.regions.values()]);
  const extraRegions = [...labels, ...frames.regions];
  for (const { score, view, local } of instruments) {
    drawPairedMarks(score, view, local, ctx);
    extraRegions.push(...drawTabEndings(view, local, ctx, composition));
  }
  const sources = Object.assign(Object.create(null), ...views.map(view => view.sources.ids));
  // Native stave IDs distinguish projections. Give the reader an instrument and a spoken staff name.
  const staffNames = instruments.flatMap(({ score, view }, i) => view.staves.map(staff => {
    const kind = score.measures[0].state;
    const owner = score.instrument?.name ?? (kind.piano ? 'Piano' : kind.tab ? 'Guitar' : 'Part ' + (i + 1));
    const name = { right: 'right hand', left: 'left hand', tab: 'tablature', notation: 'notation' }[staff];
    return owner + ', ' + name;
  }));
  const readingStaves = conductor ? spec.staves.map((staff, i) => ({ ...staff, name: staffNames[i] })) : spec.staves;
  const navigation = new ScoreNavigation(composition, readingStaves, sources);
  // Keep all fragments of a tie together in written order, including connections crossing systems.
  const tabTies = new Map(instruments.flatMap(({ score, view }) =>
    score.ties.map(t => [view.eventId('tab', t.id), [] as ScoreHitRegion[]] as const)));
  for (const region of navigation.regions) tabTies.get(region.id)?.push(region);
  const tabRegions = [...tabTies.values()].flat();
  const hidden = new Set(instruments.flatMap(({ score, view }) => [...hiddenNotes(score, view)]));

  function hitTest(x: number, y: number): ScoreHitRegion | undefined {
    const contains = (r: ScoreHitRegion) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const label = labels.find(contains);
    if (label) return label;
    const hit = navigation.hitTest(x, y);
    if (hit && !hidden.has(hit.id)) return hit;
    return extraRegions.find(contains);
  }
  if (!canvas) resize();
  else {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', navigation.events.map(event => event.label).join('. '));
  }
  if (parsed.layout?.scale) surface.style.zoom = String(parsed.layout.scale);
  host.replaceChildren(surface);

  function rangeFor(id: string, revision: string) {
    for (const view of views) {
      const range = view.sources.rangeFor(id, revision);
      if (range) return range;
    }
  }
  const diagnostics: { code: string; measures: number[]; range: SourceRange; source?: string }[] =
    composition.sheet.getContinuousLayout().diagnostics.map(d => ({
      ...d, range: (d.source && rangeFor(d.source, parsed.source)) || parsed.measures[d.measures[0] - 1]?.range,
    }));
  for (const m of parsed.measures) {
    if (!scores.some(score => score.measures[m.number - 1].voices.some(v => v.events.some(e => e.chord || e.lyric)))) continue;
    for (const d of composition.systems[m.number - 1].getPhraseLayout().diagnostics) {
      const source = d.sources.find(id => rangeFor(id, parsed.source));
      diagnostics.push({ code: d.code, measures: [m.number], source, range: rangeFor(source, parsed.source) ?? m.range });
    }
  }

  scoreSurfaces.set(canvas ?? (ctx as SVGContext).svg, { score: parsed, ensemble: conductor ? scores : undefined, read: () => playbackGeometry(composition, instruments) });
  return { score: parsed, parts: scores, composition, navigation, hitTest, tabRegions, extraRegions, diagnostics, rangeFor,
    sourceFor: (id: string): string | undefined => sources[id] };
}

/** Independent hands and parts retain their boundaries, source IDs and shared endings. */
function selectVoices(score: ParsedScore, part: Part, number?: number): ParsedScore {
  const hand = part === 'right' || part === 'left' ? part : undefined;
  if (!hand && number === undefined) return score;
  if (hand && !score.measures[0].state.piano) throw new ScoreError('measure', 'A hand part needs a piano score', score.measures[0].range);
  if (!hand && score.measures[0].state.piano && number !== undefined) {
    throw new ScoreError('measure', 'Choose a hand before selecting its voice', score.measures[0].range);
  }
  const events = new Set<string>();
  const measures = score.measures.map(m => {
    let voices = hand ? voicesFor(m, hand) : m.voices;
    if (number !== undefined) {
      const voice = voices[number - 1];
      if (!Number.isInteger(number) || !voice) throw new ScoreError('measure', 'Missing voice ' + number + ' in bar ' + m.number, m.range);
      voices = [{ ...voice, stem: undefined }];
    }
    for (const voice of voices) for (const event of voice.events) events.add(event.id);
    return { ...m, voices: voices.map((v,i) => ({ ...v, rehearsal: i ? v.rehearsal : m.voices[0].rehearsal,
      events: hand ? v.events.map(e => e.displayHand ? { ...e, displayHand: undefined } : e) : v.events })) };
  });
  const ties = score.ties.filter(t => events.has(t.from) && events.has(t.to));
  const spans = (score.spans ?? []).filter(s => s.kind === 'volta' || events.has(s.from)).map(s => {
    if (s.kind !== 'volta') return s;
    const end = measures[s.lastBar - 1].voices[0].events;
    return { ...s, from: measures[s.firstBar - 1].voices[0].events[0].id, to: end[end.length - 1].id };
  });
  return { ...score, measures, ties, spans };
}

/** Prepare every native publication and cue before VexFlow measures its ink and breaks pages. */
function publicationDrawing(scores: ParsedScore[], views: Projection[], source: EasyScoreCompositionSpec,
  hooks: PublicationOptions['noteHooks']): PartDrawingOptions['drawComposition'] {
  const owners = new Map<string, { index: number; staff: Staff }>();
  let offset = 0;
  views.forEach((view, index) => {
    for (const staff of view.staves) owners.set(source.staves[offset++].id, { index, staff });
  });
  return (spec, composition, factory, builder, insetMeasure) => {
    const instruments: ScreenInstrument[] = [];
    const ctx = factory.getContext() as SVGContext;
    let start = 0;
    while (start < spec.staves.length) {
      const { index } = owners.get(spec.staves[start].id);
      const staves: Staff[] = [];
      while (start + staves.length < spec.staves.length) {
        const owner = owners.get(spec.staves[start + staves.length].id);
        if (owner.index !== index) break;
        staves.push(owner.staff);
      }
      const local = instrumentComposition(composition, start, staves.length);
      start += staves.length;
      const parsed = scores[index], view = views[index];
      let selected = parsed;
      if (insetMeasure !== undefined) {
        const measure = parsed.measures[insetMeasure - 1];
        const ids = new Set(measure.voices.flatMap(voice => voice.events.map(e => e.id)));
        selected = { ...parsed, measures: [{ ...measure, number: 1 }], ties: [],
          spans: parsed.spans.filter(span => ids.has(span.from) && ids.has(span.to)) };
      }
      const partView = { ...view, staves, mixedEndings: insetMeasure === undefined ? view.mixedEndings : [] };
      prepareScreen(selected, partView, local, factory);
      if (hooks?.length) {
        for (const measure of selected.measures) for (const staff of staves) {
          for (const voice of voicesFor(measure, staff)) for (const event of voice.events) {
            const id = view.eventId(staff, event.id);
            const note = local.getNote(id) as StemmableNote;
            for (const hook of hooks) hook({ id, clef: staff === 'tab' ? 'tab' : staff === 'left' ? 'bass' : measure.state.clef, stem: voice.stem ?? 'auto' }, note, builder);
          }
        }
      }
      instruments.push({ score: selected, view: partView, local });
    }
    drawPrepared(factory, () => finishLayout(composition, instruments));
    if (insetMeasure === undefined) drawScoreHeading(scores[0], composition, ctx);
    for (const { score, view, local } of instruments) {
      drawPairedMarks(score, view, local, ctx);
      drawTabEndings(view, local, ctx, composition);
      if (!score.measures.some(m => m.voices.some(v => v.events.some(e => e.frame)))) continue;
      const top = Math.min(0, ctx.svg.getBBox().y);
      const key = ctx.openGroup('chord-frames');
      drawFrames(score, spec.sheet.width, ctx, (id, range, event) => view.sources.project(view.staves[0], id, range, event));
      ctx.closeGroup();
      const box = key.getBBox();
      key.setAttribute('transform', 'translate(0,' + (top - box.y - box.height - 8) + ')');
    }
  };
}

/** Rebuild an independent part with the same descriptors and native decorations as the screen. */
export function renderScorePart(host: HTMLElement, source: ParsedScore | ScoreV2, part: Staff,
  options: EditionOptions & PartSelector & { voice?: number } = {}) {
  const { voice, partId, partIndex, ...paper } = options;
  if ('parts' in source) return publishEdition(host, source, selectedPart(source, { partId, partIndex }), paper, part, voice);
  return publish(host, [selectVoices(source, part, voice)], [part], paper, undefined);
}

/** Print a complete conductor edition or an independent named instrument with its authored cues. */
export function renderEdition(host: HTMLElement, document: ScoreV2, target: 'conductor' | PartSelector = 'conductor', options: EditionOptions = {}) {
  return publishEdition(host, document, target === 'conductor' ? target : selectedPart(document, target), options, 'score');
}

/** Include only the requested music and the staves supplying cue references. */
function publishEdition(host: HTMLElement, document: ScoreV2, target: number | 'conductor', overrides: EditionOptions, part: Part, voice?: number) {
  const conductor = target === 'conductor';
  const edition = editionSettings(document, target, overrides);
  const donors = overrides.regions === undefined ? edition.cues.map(c => selectedPart(document, { partId: c.part })) : [];
  const indices = conductor ? document.parts.map((_, i) => i) : [...new Set([target, ...donors])];
  const scores = indices.map((id, i) => {
    const parsed = projectScoreV2(document, id);
    return i === 0 && !conductor ? selectVoices(parsed, part, voice) : parsed;
  });
  const parts = scores.map((_, i) => i === 0 ? part : 'score' as Part);
  return publish(host, scores, parts, edition.settings, { conductor, donors: donors.map(id => indices.indexOf(id)), edition, document });
}

/** Draw, paginate and map each native diagnostic back to the requesting source revision. */
function publish(host: HTMLElement, scores: ParsedScore[], parts: Part[], options: EditionOptions, context?: {
  conductor: boolean; donors: number[]; edition: ReturnType<typeof editionSettings>; document: ScoreV2;
}) {
  const parsed = scores[0];
  const views = scores.map((score, i) => project(score, parts[i], 600, true));
  const spec = views.length > 1 ? conductorSpec(scores, views.map(v => v.spec)) : views[0].spec;
  if (!context?.conductor) spec.continuous.boundaries = views[0].spec.continuous.boundaries;
  const { compressRests, ...paper } = options;
  if (compressRests) {
    // An empty boundary prevents VexFlow from grouping adjacent plain rests. Retain
    // real score changes and pickups, including the first bar after a requested turn.
    const turns = new Set([...(paper.preferredTurns ?? []), ...(paper.forbiddenTurns ?? [])].map(n => n + 1));
    spec.continuous.compressRests = true;
    spec.continuous.boundaries = spec.continuous.boundaries.flatMap(b => {
      if (turns.has(b.measure) || parsed.measures[b.measure - 1].state.fragment)
        return [{ ...b, keepRest: true }];
      return b.rehearsal || b.breakBefore || b.repeatStart || b.repeatEnd ? [b] : [];
    });
  }
  const settings: PartDrawingOptions = { ...paper, noteHooks: [...views.map(v => v.textLanes.hook), ...(paper.noteHooks ?? [])],
    insetSpans: inset => spansForInset(inset, spec.continuous.spans),
    drawComposition: publicationDrawing(scores, views, spec, paper.noteHooks) };
  if (context && !context.conductor) settings.staves = spec.staves.slice(0, views[0].staves.length).map(s => s.id);
  if (context?.donors.length) settings.regions = context.edition.cues.map((cue, i) => {
    const start = views.slice(0, context.donors[i]).reduce((n, v) => n + v.staves.length, 0);
    return { kind: 'cue', staff: spec.staves[start].id, label: cue.label, measure: cue.measure };
  });
  const locate = locations(parsed.source);
  let publication: ReturnType<Publication['render']>;
  try {
    publication = new Publication(spec).render(host, settings);
  } catch (error) {
    if (context?.edition.range && error.code === 'BadPublication')
      throw new ScoreError('fixed-layout', error.message, locate(context.edition.range));
    throw error;
  }
  const rangeFor = (id: string, revision: string) => views.map(v => v.sources.rangeFor(id, revision)).find(Boolean);
  const diagnostics = publication.diagnostics.map(d => {
    const measure = d.measures[0];
    const anchor = d.code === 'ForbiddenTurn' && context?.edition.anchors.find(a => a.field === 'forbiddenTurns' && a.measure === measure);
    const cue = d.detail.startsWith('cue exceeds') && context?.edition.cues.find(c => c.measure === measure);
    const directive = anchor || cue;
    const source = d.code === 'ExcludedAnchor' ? d.detail : d.detail.split(' ')[1];
    const range = directive ? locate(directive.range) : rangeFor(source, parsed.source) ||
      (d.code === 'TextOverflow' && context?.edition.range && locate(context.edition.range)) ||
      parsed.measures[measure - 1]?.range;
    return { ...d, range };
  });
  const attacks = new Map<string, Attack>();
  const performing = context?.conductor ? scores : [parsed];
  for (const [i, score] of performing.entries()) for (const m of score.measures) for (const voice of m.voices)
    for (const event of voice.events) for (const staff of views[i].staves) attacks.set('vf-' + views[i].eventId(staff, event.id), event);
  for (const page of publication.pages) scoreSurfaces.set(page.svg, { score: parsed, ensemble: context?.conductor ? scores : undefined, read: () => printedGeometry(publication, attacks) });
  return { publication, diagnostics, score: parsed, rangeFor,
    sourceFor: (id: string) => views.map(v => v.sources.sourceFor(id)).find(Boolean) };
}
