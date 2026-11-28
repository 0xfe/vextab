// Project the shared score into fresh VexFlow objects for each screen or publication view.
import { staveRow, printedGeometry, scoreSurfaces, type PrintAnchor, type Geometry } from '../playback/geometry';
import { writtenPlaybackOverlay, type PlaybackOverlay } from '../playback/written-overlay';
import { scoreLayoutMap, screenClientPoint, type ScoreLayoutMap } from './layout-map';
import { lyrics } from './verses';
import { editionSettings, type EditionOptions } from './editions';
import { locations, projectScoreV2 } from './grammar2/project';
import type { ScoreV2 } from './grammar2/model';
import { attachHeadMarks, typedFingering } from './head-marks';
import { pianoTextLanes, TextLanes } from './text-lanes';
import { drumKit } from './drums';
import { attachOpenSlide, describeOpenSlide } from './open-slide';
import { inkStyle, setFretPaper } from './color';
import { conductorSpec, instrumentComposition, instrumentLabel, selectedPart, type PartSelector } from './conductor';
import { drawHeading, ossiaNotes } from './score-details';
import { headingWeight, scoreMusicFont, scoreTextFont, withScoreFonts } from './engraving';
import VexFlow, {
  AlternatingTremolo, GraceNoteGroup, GraceTabNote, Ornament, TextDynamics, Clef, FretDiagram, Registry, Fraction, Annotation, Stroke, Vibrato, Articulation, Modifier, TabSlide, Barline, StaveNote, TabNote, TabTie, Factory, FrettedInstrument, Publication, ScoreNavigation, SVGContext, CanvasContext,
  type Note, type CompositionMark, type ContinuousSpan, type EasyScoreComposition, type EasyScoreCompositionSpec, type EasyScoreContent,
  type EasyScoreVoiceSpec, type NotationIdentity, type PublicationOptions, type ScoreHitRegion, type ScoreReadingEvent,
} from 'vexflow';
import { describePrebend, makePrebend } from './music';
import { leadMarks, openingFrames } from './lead';
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

/** An authored beam crossing piano staves needs opposite stems to reach the shared beam. */
function crossStaffBeamStems(voice: MeasureVoice) {
  const stems = new Map<Attack, number>();
  if (!voice.hand) return stems;
  for (const group of voice.beamGroups ?? []) {
    const members = voice.events.slice(group.start, group.end + 1);
    const hands = members.map(event => event.displayHand ?? voice.hand);
    if (hands.some(hand => hand !== hands[0])) {
      members.forEach((event, i) => stems.set(event, hands[i] === 'right' ? -1 : 1));
    }
  }
  return stems;
}

/** Both projections use the written duration, including dots before tuplet scaling. */
function voiceSpec(voice: MeasureVoice, measure: Measure, staff: Staff, sources: Sources): EasyScoreVoiceSpec {
  const direction = voice.stem;
  const stemDirection = direction ? (direction === 'up' ? 1 : -1) : staff === 'tab' ? voice.tabDirection : undefined;
  const instrument = new FrettedInstrument(measure.state.tuning, measure.state.capo);
  const clef = staff === 'left' ? 'bass' : measure.state.clef;
  const crossingStems = crossStaffBeamStems(voice);
  let pairStem: number;
  const notes: EasyScoreContent[] = voice.events.map(event => {
    const id = sources.project(staff, event.id, event.range);
    event.heads.forEach((head, i) => sources.project(staff, event.id + '-head-' + i, head.range));
    const destination = measure.state.piano ? event.displayHand : undefined;
    const crossingStem = crossingStems.get(event);
    const writtenStem = event.stem === 'up' ? 1 : event.stem === 'down' ? -1 : undefined;
    const rhythm = { duration: event.base, dots: event.dots, stemDirection: writtenStem ?? crossingStem ?? stemDirection,
      headSource: { event: event.id } };
    if (event.silent) return { id, skip: rhythm };
    if (!event.heads.length) {
      // Rest positions count up from the bottom of the written staff, including shorter tab staves.
      const offset = staff === 'tab' ? 5 - measure.state.strings : 0;
      const restLine = event.restLine === undefined ? undefined : event.restLine + offset;
      return { id, ...(destination && { stave: destination }), note: { ...rhythm, keys: ['r/4'], clef: 'treble', type: 'r', restLine } };
    }
    if (event.heads[0].drum) {
      const hit = (measure.state.kit ?? drumKit).note(event.heads.map(head => head.drum), event.base, event.stem ?? direction);
      return { id, note: { ...hit, dots: event.dots, headSource: rhythm.headSource } };
    }
    const notation = guitarNotation(event, instrument);
    const keys = event.heads.map(h => h.position?.fret === 'X' ? h.written + '/X' : h.written);
    if (staff === 'tab') {
      return { id, tab: { ...rhythm, keys, notation, positions: event.heads.map(h => ({ ...h.position! })) }, drawStem: voice.tabStems && !['w', '1'].includes(event.base) };
    }
    let writtenClef = event.writtenClef ?? clef;
    if (destination && destination !== voice.hand) {
      const display = measure.staffState?.[destination];
      writtenClef = display?.clef ?? (destination === 'left' ? 'bass' : 'treble');
      for (const change of display?.changes ?? []) {
        if (new Fraction().parse(change.at).greaterThan(new Fraction().parse(event.onset))) break;
        writtenClef = change.clef ?? writtenClef;
      }
    }
    const heads = event.heads.map((head, i) => {
      const finger = typedFingering(head.marks, event.heads);
      return { key: keys[i], ...(finger && { fingering: { finger: finger.finger, position: finger.position } }),
        ...(head.accidental && { accidental: head.cautionary ? 'cautionary' as const : 'force' as const }) };
    });
    const note = { ...rhythm, heads, notation, clef: writtenClef, type: event.slash ? 's' : 'n', autoStem: rhythm.stemDirection === undefined };
    if (event.tremolo) {
      // Decide once before layout. An automatic second endpoint can otherwise flip across the middle line.
      if (pairStem === undefined) {
        pairStem = rhythm.stemDirection ?? new StaveNote({ ...note, autoStem: true }).getStemDirection();
        note.stemDirection = pairStem;
      } else {
        note.stemDirection = pairStem;
        pairStem = undefined;
      }
      note.autoStem = false;
    }
    return { id, ...(destination && { stave: destination }), note: event.tremolo ? AlternatingTremolo.endpoint(note, event.tremolo) : note,
      ...(event.grace && { grace: { side: event.grace.side, slur: true, beam: event.grace.pitches.length > 1,
        notes: event.grace.pitches.map(key => ({ keys: Array.isArray(key) ? key : [key], duration: event.grace.slash ? '8' : '16', slash: event.grace.slash, clef: writtenClef })) } }) };
  });
  // VexFlow compares every voice's changes and emits glyphs only in the first.
  const visual = new Map<string, { clef?: string; key?: string }>();
  if (staff !== 'tab') for (const change of measure.staffState?.[staff]?.changes ?? []) {
    if (!change.clef && !change.key) continue;
    visual.set(change.at, { ...visual.get(change.at), ...(change.clef && {clef: change.clef}), ...(change.key && {key: change.key}) });
  }
  const withChanges = visual.size ? notes.flatMap((note, i) => {
    const change = visual.get(voice.events[i].onset);
    return change ? [{ change }, note] : [note];
  }) : notes;
  return {
    notes: withChanges, stem: direction ?? 'auto',
    // The native auto-beamer reads divided tremolo ticks as shorter beamable notes.
    // Explicit beams in this voice/bar own their stems alongside the alternating strokes.
    autoBeam: !voice.events.some(e => e.tremolo) && voice.beams && (staff !== 'tab' || voice.tabStems) && {
      groups: voice.beatGroups?.map(n => new Fraction(n, Number(measure.state.meter.split('/')[1]))),
      // A global direction makes the native auto-beamer overwrite per-note exceptions.
      stemDirection: voice.events.some(event => event.stem) ? undefined : stemDirection, flatBeams: voice.flatBeams, beamRests: voice.beamRests, showStemlets: voice.stemlets, beamMiddleOnly: voice.middleRests },
    // The native group resolves one stem side across the middle line and preserves an authored direction.
    beams: staff === 'tab' && !voice.tabStems ? [] : voice.beamGroups?.map(group => ({
      start: group.start, count: group.end - group.start + 1, flatBeams: voice.flatBeams,
      feathered: group.feather, showStemlets: voice.stemlets,
    })),
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
  const heading = parsed.layout?.heading;
  // A traditional heading can place raised lettering and credits on the same line.
  const nativeHeading = heading && (heading.align === 'center' || Object.keys(heading).length === 1) &&
    !Object.values(heading).some(text => /\^\{/.test(text));
  const frames = openingFrames(parsed, (id, range, event) => sources.project(staves[0], id, range, event));
  const blocks: import('vexflow').OpeningBlock[] = [];
  if (nativeHeading) {
    for (const key of ['title', 'dedication', 'composer', 'tempo'] as const) if (heading[key]) blocks.push({
      kind: 'text', runs: heading[key].split(/([♩𝅗𝅥])/u).filter(Boolean).map(text =>
        text === '♩' || text === '𝅗𝅥' ? { text: text === '♩' ? VexFlow.Glyphs.metNoteQuarterUp : VexFlow.Glyphs.metNoteHalfUp,
          font: { family: scoreMusicFont(), weight: 'normal' } } : text),
      align: heading.align ?? (key === 'title' ? 'center' : key === 'composer' ? 'right' : 'left'),
      font: { family: scoreTextFont(), weight: headingWeight(), size: key === 'title' ? 32 : 16 },
    });
  }
  if (frames.length) blocks.push({ kind: 'diagrams', align: heading?.align ?? 'left',
    diagrams: frames.map(f => f.diagram), font: { family: scoreTextFont(), size: 12 } });
  if (parsed.playback?.swing === 'eighths') blocks.push({
    kind: 'text', font: { family: scoreTextFont(), size: 12, weight: headingWeight() },
    runs: ['Swing  ', { notes: ['8', '8'], beam: true }, '  =  ', { notes: ['q', '8'], tuplet: [3, 2] }],
  });
  const textLanes = new TextLanes();
  const extensions = new Map(parsed.spans.filter(span => span.kind === 'lyric').map(span => [span.range.start, span.to]));
  // On polyphonic guitar, one chord lane follows whichever voice carries the harmony.
  const guitarChordLane = parsed.measures[0].state.tab && parsed.measures.some(m => m.voices.length > 1);
  const spans: ContinuousSpan[] = [];
  // VexFlow can draw a tab ending between two TabNotes or two rendered rests.
  // A volta spans bar boundaries, so any compatible anchor in each boundary bar is sufficient.
  const rests = new Set(parsed.measures.flatMap(m => m.voices.flatMap(v => v.events.filter(e => !e.heads.length).map(e => e.id))));
  // A sustained outer notation voice ties away from the other voices on its staff.
  const notationTieSides = new Map<string, 'above' | 'below'>();
  const mixedEndings: ScoreSpan[] = [];
  const spec: EasyScoreCompositionSpec = {
    stemPolicy: parsed.layout?.stemPolicy === 'pitch' ? undefined : 'active-voices',
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
        if (staff !== 'tab' && parsed.ties.length && voices.filter(v => v.events.some(e => e.heads.length)).length > 1) {
          for (const voice of voices) {
            if (!voice.stem) continue;
            for (const event of voice.events) notationTieSides.set(event.id, voice.stem === 'up' ? 'above' : 'below');
          }
        }
        const showMarks = staff === staves[0] || m.state.piano;
        const local = staff === 'tab' ? undefined : m.staffState?.[staff];
        const clef = local?.clef ?? (staff === 'tab' ? 'tab' : staff === 'left' ? 'bass' : m.state.clef);
        return {
          clef, key: local?.key ?? m.state.key, time: m.state.meterSign ?? m.state.meter, span: m.span === '0/1' ? '1/1' : m.span,
          showTimeSignature: m.state.showTime && !(staff === 'tab' && staves.includes('notation')),
          endBarline: writtenEndBar(m),
          ...(showMarks && leadMarks({ ...m, voices }, staff === 'tab' ? 'tab' : 'notation',
            id => eventId(staff, id), publication || !staves.includes('tab'), publication, guitarChordLane, extensions)),
          voices: [
            ...voices.map((v, index) => v.events.length ? voiceSpec(v, m, staff, sources)
              : { notes: [{ id: eventId(staff, 'blank-' + m.number + '-' + index), skip: 'w' }] }),
            ...(m.state.piano && staves.length === 2 ? pianoTextLanes(m.text ?? [], staff === 'left', parsed.layout?.staffDistance ?? 9)
              : staff === staves[0] ? m.text ?? [] : []).flatMap(lane =>
                textLanes.voices(lane, m.number, (id, range) => sources.project(staff, id, range))),
          ],
        };
      }),
    })),
    continuous: {
      inkBounds: (stave, measure) => textLanes.inkBounds(stave, measure),
      verticalSpacing: parsed.measures[0].state.piano || staves.length > 1 ? 'profile' : 'envelope',
      textLanes: 'system',
      opening: { indent: parsed.layout?.firstSystemIndent, blocks },
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
        to: eventId(staff, tie.to), side: staff === 'tab' ? undefined : tie.side ?? notationTieSides.get(tie.from) ?? notationTieSides.get(tie.to),
        ...(staff === 'tab' && tie.bend && { bend: tie.bend, string: tie.string }), fromHead: tie.fromHead, toHead: tie.toHead });
    }
  }
  for (const mark of parsed.spans ?? []) {
    if (mark.kind === 'pedal') {
      for (const staff of staves) {
        const from = eventId(staff, mark.from), to = eventId(staff, mark.to);
        if (staff !== 'tab' && sources.ids[from] && sources.ids[to]) spans.push({
          kind: 'pedal', pedalStyle: 'text', id: sources.project(staff, mark.id, mark.range), from, to,
        });
      }
      continue;
    }
    if (mark.kind === 'lyric' || mark.kind === 'hyphen') continue; // Native verse lanes join these across measures.
    if (mark.kind === 'tremolo') continue; // The paired native element uses final stem positions.
    if (mark.kind === 'continuousBeam' || mark.kind === 'crescendo' || mark.kind === 'diminuendo') {
      for (const staff of staves) {
        const from = eventId(staff, mark.from), to = eventId(staff, mark.to);
        if (!sources.ids[from] || !sources.ids[to] || staff === 'tab') continue;
        spans.push({ kind: mark.kind === 'continuousBeam' ? 'beam' : mark.kind, from, to,
          ...('niente' in mark && { niente: mark.niente }), ...(mark.side && { side: mark.side }),
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
        // A written rest has no fret to anchor a TAB slur. The pitched staff can still phrase over it.
        if (staff === 'tab' && (rests.has(mark.from) || rests.has(mark.to))) continue;
        if (sources.ids[from]) spans.push({ kind: 'slur', side: mark.side ?? (staff === 'tab' ? 'below' : undefined),
          id: sources.project(staff, mark.id, mark.range), from, to: eventId(staff, mark.to) });
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
  const ossias = [];
  for (const measure of parsed.measures) for (const staff of staves) {
    if (staff === 'tab') continue;
    for (const voice of voicesFor(measure, staff)) for (const event of voice.events) {
      const reading = event.ossia;
      if (!reading) continue;
      ossias.push({ id: eventId(staff, event.id + '-ossia'), at: eventId(staff, event.id), label: 'Ossia.',
        notes: ossiaNotes(reading, measure.state.key ?? 'C'),
        beam: reading.notes.length > 1 && reading.duration !== 'q', scale: 0.63 });
    }
  }
  spec.continuous.ossias = ossias;
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
  const view = { spec, nativeHeading, frames, staves, sources, eventId, mixedEndings, textLanes, printAnchors: publication ? new Map<string, PrintAnchor>() : undefined, endingRegions: [] as ScoreHitRegion[] };
  spec.engraving = engraving(parsed, view);
  return view;
}
type Projection = ReturnType<typeof project>;

function attachPerformanceMarks(note: StaveNote | TabNote, event: Attack, tab: boolean) {
  for (const label of event.labels ?? []) {
    const annotation = new Annotation(label.text).setVerticalJustification(label.position === 'below' ? Annotation.VerticalJustify.BOTTOM : Annotation.VerticalJustify.TOP);
    annotation.setFont(label.family ?? scoreTextFont(), label.size ?? 12, label.style === 'bold' ? 'bold' : undefined, label.style === 'italic' ? 'italic' : undefined);
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

/** Attach source-owned modifiers before VexFlow builds voices and measures their ink. */
function prepareAttack(note: Note, event: Attack, staff: Staff, voice: MeasureVoice, primary: boolean) {
  if (event.grace?.positions && note instanceof TabNote) {
    const frets = event.grace.positions.map(positions => new GraceTabNote({ positions, duration: '16' }));
    const group = new GraceNoteGroup(frets).setPosition(event.grace.side === 'before' ? Modifier.Position.LEFT : Modifier.Position.RIGHT);
    note.addModifier(group, 0);
  }
  if (event.grace?.fingerings) {
    const group = note.getModifiers().find((m): m is GraceNoteGroup => m instanceof GraceNoteGroup);
    for (const { attack, head, finger, position } of event.grace.fingerings) {
      if (group) attachHeadMarks(group.getGraceNotes()[attack], head, [{ finger, position }], staff === 'tab', true, true);
    }
  }
  if (event.ornament && staff !== 'tab') note.addModifier(new Ornament(event.ornament.replace('_inverted', 'Inverted')), 0);
  if (event.dynamic && (voice.hand || primary)) {
    const glyphs = [...event.dynamic].map(letter => TextDynamics.GLYPHS[letter]).join('');
    // A right-hand dynamic on the bass staff sits above the two voices, as in a grand staff.
    const side = voice.hand === 'right' && event.displayHand === 'left' ? Annotation.VerticalJustify.TOP : Annotation.VerticalJustify.BOTTOM;
    note.addModifier(new Annotation(glyphs).setFont(scoreMusicFont(), 15).setVerticalJustification(side), 0);
  }
  attachPerformanceMarks(note as StaveNote | TabNote, event, staff === 'tab');
  if (event.color) {
    note.setStyle(inkStyle(event.color));
    if (note instanceof StaveNote) note.setLedgerLineStyle(inkStyle(event.color));
  }
  if (event.silent) note.renderOptions.draw = false;
  event.heads.forEach((head, index) => {
    if (!head.marks) return;
    const built = note instanceof StaveNote && !head.drum ? typedFingering(head.marks, event.heads) : undefined;
    attachHeadMarks(note, index, head.marks.filter(mark => mark !== built), staff === 'tab', true);
  });
  if (note instanceof TabNote) {
    event.heads.forEach((head, index) => {
      if (head.openSlide) attachOpenSlide(note, index, head.openSlide);
      if (head.prebend) note.addModifier(makePrebend(head.prebend), index);
    });
  }
  if (staff === 'tab' && !voice.tabStems && !event.heads.length) note.renderOptions.draw = false;
}

/** Retain authored labels on the annotations created by the native harmony and verse lanes. */
function identifyLabels(note: Note, event: Attack, view: Projection, staff: Staff) {
  const words = lyrics(event).sort((a, b) => (a.verse ?? '').localeCompare(b.verse ?? ''));
  let syllable = 0;
  for (const mark of note.getModifiers()) {
    if (!(mark instanceof Annotation)) continue;
    const chord = event.chord && mark.getText().split(' · ')[0] === event.chord.text;
    const word = mark.phraseManaged && mark.getVerticalJustification() === Annotation.VerticalJustify.BOTTOM && words[syllable++];
    const range = chord ? event.chord.range : word && word.range;
    if (!range) continue;
    if (chord && event.chord.color) mark.setStyle(inkStyle(event.chord.color));
    const source = (chord ? 'chord' : 'lyric') + range.start;
    view.sources.project(staff, source, range, event.id);
    view.sources.ids[mark.getAttribute('id')] = source;
  }
}

/** Place each mixed rest/fret ending on its owning TAB row in screen scores and extracted parts. */
function placeTabEndings(parsed: ParsedScore, view: Projection, composition: EasyScoreComposition,
  notes: Map<string, Note>, add: (mark: CompositionMark) => void) {
  view.endingRegions.length = 0;
  for (const mark of view.mixedEndings) {
    if (mark.kind !== 'volta') continue;
    const id = view.eventId('tab', mark.id);
    const anchor = (bar: number) => notes.get(view.eventId('tab', parsed.measures[bar - 1].voices[0].events[0]?.id));
    for (const [i, row] of composition.sheet.getContinuousLayout().rows.entries()) {
      const bars = row.measures.filter(n => n >= mark.firstBar && n <= mark.lastBar);
      if (!bars.length) continue;
      const first = bars[0], last = bars[bars.length - 1], source = anchor(first), end = anchor(last);
      if (!source || !end) continue;
      const stave = source.checkStave();
      const x = stave.getX() + 1, right = end.checkStave().getNoteEndX();
      const y = row.y + stave.getY() - composition.staves[first - 1][0].getY() - 15;
      const bounds = { x, y, w: right - x, h: 14 };
      view.endingRegions.push({ id, kind: 'span', source: mark.id, row: i, ...bounds });
      add({ source, bounds, draw(ctx) {
        ctx.openGroup('tab-ending', id + '-' + i);
        ctx.fillRect(x, y, right - x, 1);
        if (first === mark.firstBar) {
          ctx.fillRect(x, y, 1, 12);
          ctx.setFont(scoreTextFont(), 11).fillText(mark.label, x + 4, y + 12);
        }
        if (last === mark.lastBar) ctx.fillRect(right - 1, y, 1, 12);
        ctx.closeGroup();
      } });
    }
  }
}

/** Attach alternating tremolos and guitar connections after their native stem and string positions settle. */
function placePairs(parsed: ParsedScore, view: Projection, notes: Map<string, Note>, add: (mark: CompositionMark) => void) {
  for (const span of parsed.spans) for (const staff of view.staves) {
    const first = notes.get(view.eventId(staff, span.from)), last = notes.get(view.eventId(staff, span.to));
    if (!first || !last) continue;
    if (span.kind === 'tremolo' && first instanceof StaveNote && last instanceof StaveNote) {
      const tremolo = new AlternatingTremolo(first, last, span.strokes);
      add({ source: first, bounds: first.getBoundingBox().clone().mergeWith(last.getBoundingBox()), draw: ctx => tremolo.setContext(ctx).draw() });
    }
    if (!('fromHead' in span) || !(first instanceof TabNote) || !(last instanceof TabNote)) continue;
    const up = Number(last.getPositions()[span.toHead].fret) > Number(first.getPositions()[span.fromHead].fret);
    const fragment = (firstNote?: TabNote, lastNote?: TabNote) => {
      const ends = { firstNote, lastNote, firstIndexes: [span.fromHead], lastIndexes: [span.toHead] };
      const mark = span.kind === 'slide' || span.kind === 'glissando' ? new TabSlide(ends, up ? TabSlide.SLIDE_UP : TabSlide.SLIDE_DOWN)
        : !firstNote ? new TabTie(ends) : span.kind === 'pull' ? TabTie.createPulloff(ends) : TabTie.createHammeron(ends);
      if (firstNote && (span.kind === 'hammer' || span.kind === 'pull')) mark.setFont({ ...mark.fontInfo, family: scoreTextFont(), weight: headingWeight() });
      const source = firstNote ?? lastNote;
      add({ source, head: firstNote ? span.fromHead : span.toHead, bounds: mark.getRibbonBounds(), draw: ctx => mark.setContext(ctx).draw() });
    };
    if (first.getStave().getY() === last.getStave().getY()) fragment(first, last);
    else { fragment(first); fragment(undefined, last); }
  }
}

/** Each composition, including a one-bar quotation, receives fresh notes bearing the projected IDs. */
function engraving(parsed: ParsedScore, view: Projection): EasyScoreCompositionSpec['engraving'] {
  const events = new Map<string, { event: Attack; staff: Staff; voice: MeasureVoice; measure: Measure }>();
  for (const measure of parsed.measures) for (const staff of view.staves)
    for (const voice of voicesFor(measure, staff)) for (const event of voice.events)
      events.set(view.eventId(staff, event.id), { event, staff, voice, measure });
  return {
    prepareNote(options, note) {
      const entry = events.get(options.id);
      if (entry) prepareAttack(note, entry.event, entry.staff, entry.voice, entry.staff === view.staves[0]);
      else view.textLanes.prepare(options.id, note);
    },
    place(composition, add) {
      const notes = new Map<string, Note>();
      const rows = new Map<number, ReturnType<typeof staveRow>>();
      if (view.printAnchors) for (const row of composition.sheet.getContinuousLayout().rows) {
        const bounds = staveRow(row.measures.flatMap(n => composition.staves[n - 1]));
        for (const bar of row.measures) rows.set(bar, bounds);
      }
      for (const columns of composition.notes) for (const voices of columns) for (const ticks of voices) for (const tick of ticks) {
        const id = tick.getAttribute('id'), entry = events.get(id);
        const note = tick as Note;
        if (!entry) { view.textLanes.place(note, add, composition); continue; }
        const { measure, voice, staff, event } = entry;
        notes.set(id, note);
        if (view.printAnchors && note.preFormatted && rows.has(measure.number) && (!view.printAnchors.has(event.id) || staff === view.staves[0])) {
          view.printAnchors.set(event.id, { measure: measure.number, x: note.getAbsoluteX(), row: rows.get(measure.number) });
        }
        if (event.silent) note.renderOptions.draw = false;
        const stave = note.checkStave();
        if (measure.state.hideClef) for (const clef of stave.getModifiers(undefined, Clef.CATEGORY)) clef.setText('');
        if (measure.state.color) {
          const style = inkStyle(measure.state.color);
          stave.setStyle(style);
          note.getVoice().setStyle(style);
          note.getBeam()?.setStyle(style);
        }
        if (staff === 'tab' && !voice.tabStems) for (const tuplet of note.getTupletStack()) tuplet.setRendered();
        identifyLabels(note, event, view, staff);
      }
      placePairs(parsed, view, notes, add);
      if (view.mixedEndings.length) placeTabEndings(parsed, view, composition, notes, add);
      // Quoted passages inherit note decoration, but never repeat the source instrument's opening.
      const first = notes.get(view.eventId(view.staves[0], voicesFor(parsed.measures[0], view.staves[0])[0]?.events[0]?.id));
      if (!first) return;
      const row = composition.sheet.getRows()[0];
      const heading = !view.nativeHeading && parsed.layout?.heading;
      if (heading) {
        const top = first.checkStave().getYForLine(0);
        add({ source: first, bounds: { x: row.x, y: top - 150, w: row.width, h: 145 },
          draw: ctx => { drawHeading(ctx, heading, row.x, row.width, heading.align === 'center' ? top - 150 : top); } });
      }

    },
  };
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
type ScreenInstrument = { partIndex: number; score: ParsedScore; view: Projection; local: EasyScoreComposition };

/** Preserve VexTab's keyboard access to authored skips, which native reading order omits. */
class VexTabNavigation extends ScoreNavigation {
  declare readonly events: readonly ScoreReadingEvent[];
  constructor(composition: EasyScoreComposition, readingStaves: EasyScoreCompositionSpec['staves'],
    sources: Record<string, string>, instruments: ScreenInstrument[]) {
    super(composition, readingStaves, sources);
    const skipped: ScoreReadingEvent[] = [];
    let column = 0;
    for (const { score, view } of instruments) for (const staff of view.staves) {
      const stave = readingStaves[column++];
      for (const measure of score.measures) for (const [i, voice] of voicesFor(measure, staff).entries()) {
        for (const event of voice.events) if (event.silent) skipped.push({
          id: view.eventId(staff, event.id), source: event.id, staff: stave.id, measure: measure.number,
          voice: i + 1, onset: event.onset, duration: event.duration,
          label: ['Measure ' + measure.number, stave.name || stave.id, 'voice ' + (i + 1), event.duration + ' rest'].join(', '),
        });
      }
    }
    const staffOrder = new Map(readingStaves.map((staff, i) => [staff.id, i]));
    if (skipped.length) this.events = [...this.events, ...skipped].sort((a, b) => a.measure - b.measure ||
      new Fraction().parse(a.onset).value() - new Fraction().parse(b.onset).value() ||
      staffOrder.get(a.staff) - staffOrder.get(b.staff) || a.voice - b.voice);
  }
}

/** All voices use one row clock, including paired notation/TAB which references one attack twice. */
function playbackGeometry(composition: EasyScoreComposition, instruments: ScreenInstrument[], navigation: ScoreNavigation): Geometry {
  const geometry: Geometry = new Map();
  for (const band of composition.sheet.getContinuousLayout().rows) {
    const row = staveRow(band.measures.flatMap(n => composition.staves[n - 1]));
    for (const { score, view } of instruments) {
      for (const number of band.measures) for (const voice of score.measures[number - 1].voices) {
        for (const attack of voice.events) {
          const stavesForVoice = voice.hand ? [voice.hand] : view.staves;
          const points = navigation.heads.get(attack.id).flatMap(head => {
            if (head.role === 'mark' || head.reference || typeof head.sourceHead !== 'number') return [];
            const pitch = attack.heads[head.sourceHead];
            if (attack.silent || !pitch || (!pitch.sounding && pitch.midi === undefined)) return [];
            const b = head.bounds;
            return [{ x: b.x + b.w / 2, y: b.y + b.h / 2 }];
          });
          const x = points[0]?.x ?? composition.getNote(view.eventId(stavesForVoice[0], attack.id)).getAbsoluteX();
          geometry.set(attack.id, { row, x, heads: points });
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
  const index = 'parts' in source ? selectedPart(source, options) : 0;
  const selected = 'parts' in source ? projectScoreV2(source, index) : source;
  return withScoreFonts(selected.layout?.font, () => renderParts(host, [selectVoices(selected, part)], part, options, false, index));
}

/** Build one native conductor composition and retain each source instrument for independent extraction. */
export function renderConductor(host: HTMLElement, document: ScoreV2, options: ScreenOptions = {}) {
  return withScoreFonts(document.layout?.font, () => renderParts(host, document.parts.map((_, i) => projectScoreV2(document, i)), 'score', options, true));
}

/** Prepare fresh native objects for the requested surface. Commit the DOM only after successful layout. */
function renderParts(host: HTMLElement, scores: ParsedScore[], part: Part, options: ScreenOptions, conductor = false, firstPart = 0) {
  const parsed = scores[0];
  const width = options.width ?? parsed.layout?.width ?? (host.clientWidth || 640);
  if (!Number.isFinite(width) || width <= 20) throw new RangeError('Score width must exceed 20 pixels');
  const views = scores.map(score => project(score, part, width - 20));
  const specs = views.map(view => view.spec);
  const spec = conductor ? conductorSpec(scores, specs) : specs[0];
  const surface = document.createElement('div');
  const canvas = options.renderer === 'canvas' ? surface.appendChild(document.createElement('canvas')) : undefined;
  const ctx = canvas ? new CanvasContext(canvas.getContext('2d')) : new SVGContext(surface);
  if (canvas) surface.style.position = 'relative';
  else setFretPaper(ctx, host);

  if (parsed.layout?.heading && !views[0].nativeHeading) spec.sheet.y += 125;
  if (views.some(view => view.mixedEndings.length)) spec.sheet.y += 20;
  const factory = new Factory({ renderer: { elementId: null, width, height: 1 } }).setContext(ctx);
  const easy = factory.EasyScore();
  if (canvas) {
    // Resizing clears a bitmap. Size it after native layout and before painting, in the same pass as SVG.
    const place = spec.engraving.place;
    spec.engraving = { ...spec.engraving, place(score, add) {
      let bottom = 0;
      for (const mark of score.sheet.getContinuousLayout().detailMarks) bottom = Math.max(bottom, mark.bounds.y + mark.bounds.h);
      place(score, mark => {
        bottom = Math.max(bottom, mark.bounds.y + mark.bounds.h);
        add(mark);
      });
      resize(score.sheet, bottom);
    } };
  }
  const composition = easy.compose(spec);
  let offset = 0;
  const instruments = views.map((view, i) => {
    const local = views.length === 1 ? composition : instrumentComposition(composition, offset, view.staves.length);
    offset += view.staves.length;
    const score = scores[i];
    return { partIndex: firstPart + i, score, view, local };
  });

  function resize(sheet: EasyScoreComposition['sheet'], markBottom = 0) {
    const extent = Math.max(width, ...sheet.getRows().map(r => r.x + r.width + 10));
    ctx.resize(extent, Math.ceil(Math.max(sheet.getHeight(), markBottom) + 20));
  }

  const frameRegions: ScoreHitRegion[] = [];
  const frames = views.flatMap(view => view.frames.map(frame => ({ frame, sources: view.sources })));
  if (frames.length) {
    // Both SVG and Canvas draw the same native FretDiagrams. Read their final geometry.
    const previous = Registry.getDefaultRegistry(), registry = previous ?? new Registry();
    if (!previous) Registry.enableDefaultRegistry(registry);
    try {
      factory.draw();
      const rendered = registry.getElementsByType(FretDiagram.CATEGORY).filter(el => el.isRendered() && el.getContext() === ctx);
      rendered.forEach((el, i) => {
        const { frame, sources } = frames[i], { x, y, w, h } = el.getBoundingBox();
        sources.ids[el.getAttribute('id')] = frame.source;
        frameRegions.push({ id: frame.id, source: frame.source, kind: 'event', x, y, w, h });
      });
    } finally {
      if (!previous) Registry.disableDefaultRegistry();
    }
  } else factory.draw();
  const labels = views.flatMap(view => [...view.textLanes.regions.values()]);
  const extraRegions = [...labels, ...frameRegions, ...views.flatMap(view => view.endingRegions)];
  const sources = Object.assign(Object.create(null), ...views.map(view => view.sources.ids));
  // Native stave IDs distinguish projections. Give the reader an instrument and a spoken staff name.
  const staffNames = instruments.flatMap(({ score, view }, i) => view.staves.map(staff => {
    const kind = score.measures[0].state;
    const owner = score.instrument?.name ?? (kind.piano ? 'Piano' : kind.tab ? 'Guitar' : 'Part ' + (i + 1));
    const name = { right: 'right hand', left: 'left hand', tab: 'tablature', notation: 'notation' }[staff];
    return owner + ', ' + name;
  }));
  const readingStaves = conductor ? spec.staves.map((staff, i) => ({ ...staff, name: staffNames[i] })) : spec.staves;
  const navigation = new VexTabNavigation(composition, readingStaves, sources, instruments);
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
    const head = navigation.heads.hitTest(x, y);
    if (head && typeof head.sourceHead === 'number' && head.role !== 'mark') {
      return { id: head.sourceEvent + '-head-' + head.sourceHead, source: head.sourceEvent, kind: 'event', ...head.bounds };
    }
    const hit = navigation.hitTest(x, y);
    if (hit && !hidden.has(hit.id)) return hit;
    return extraRegions.find(contains);
  }
  if (!canvas) resize(composition.sheet);
  else {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', navigation.events.map(event => event.label).join('. '));
  }
  // Scale the engraved surface in its own coordinates. Playback buttons retain their normal target size.
  const scale = parsed.layout?.scale ?? 1;
  if (scale !== 1) {
    const music = canvas ?? (ctx as SVGContext).svg;
    music.style.zoom = String(scale);
    if (!canvas) surface.style.width = (parseFloat(music.style.width) * scale) + 'px';
  }
  host.replaceChildren(surface);

  function headRangeFor(event: string, head: number, revision: string) {
    return rangeFor(event + '-head-' + head, revision);
  }

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

  const music = canvas ?? (ctx as SVGContext).svg;
  const clientPoint = screenClientPoint(music);
  let layoutMap: ScoreLayoutMap;
  const readGeometry = () => withScoreFonts(parsed.layout?.font, () => playbackGeometry(composition, instruments, navigation));
  // Share a single written-time index between navigation and transport overlays on this render.
  function getLayoutMap(): ScoreLayoutMap {
    return layoutMap ??= withScoreFonts(parsed.layout?.font, () => scoreLayoutMap(composition, instruments, navigation.heads, readingStaves, clientPoint));
  }
  scoreSurfaces.set(music, { score: parsed, ensemble: conductor ? scores : undefined, read: readGeometry });
  return { score: parsed, parts: scores, composition, navigation, hitTest, tabRegions, extraRegions, diagnostics, rangeFor, headRangeFor,
    get layoutMap(): ScoreLayoutMap { return getLayoutMap(); },
    /** Mount the guide's playback bar and sounding-head glows for an external clock. */
    createPlaybackOverlay(): PlaybackOverlay { return writtenPlaybackOverlay(surface, music, getLayoutMap(), scores, readGeometry()); },
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

/** Rebuild an independent part with the same descriptors and native decorations as the screen. */
export function renderScorePart(host: HTMLElement, source: ParsedScore | ScoreV2, part: Staff,
  options: EditionOptions & PartSelector & { voice?: number } = {}) {
  const { voice, partId, partIndex, ...paper } = options;
  return withScoreFonts(source.layout?.font, () => 'parts' in source
    ? publishEdition(host, source, selectedPart(source, { partId, partIndex }), paper, part, voice)
    : publish(host, [selectVoices(source, part, voice)], [part], paper));
}

/** Print a complete conductor edition or an independent named instrument with its authored cues. */
export function renderEdition(host: HTMLElement, document: ScoreV2, target: 'conductor' | PartSelector = 'conductor', options: EditionOptions = {}) {
  return withScoreFonts(document.layout?.font, () =>
    publishEdition(host, document, target === 'conductor' ? target : selectedPart(document, target), options, 'score'));
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
  if (!context?.conductor) spec.continuous.opening = views[0].spec.continuous.opening;
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
  const { noteHooks, ...settings }: PublicationOptions = paper;
  if (noteHooks?.length) {
    // EasyScore's string ghost runs commit hooks. Its equivalent typed skip has no construction hook.
    for (const stave of spec.staves) for (const measure of stave.measures) for (const voice of measure.voices) {
      if (typeof voice.notes === 'string') continue;
      voice.notes = voice.notes.map(item => {
        if (typeof item !== 'object' || !('skip' in item) || typeof item.skip === 'string') return item;
        return 'B4/' + item.skip.duration + '/g' + '.'.repeat(item.skip.dots ?? 0) + '[id="' + item.id + '"]';
      });
    }
    const prepare = spec.engraving.prepareNote;
    spec.engraving = { ...spec.engraving, prepareNote(options, note, builder) {
      prepare(options, note, builder);
      for (const hook of noteHooks) hook(options, note, builder);
    } };
  }
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
  const frameOwners = (context?.conductor ? views : views.slice(0, 1))
    .flatMap(view => view.frames.map(frame => ({ frame, sources: view.sources })));
  if (frameOwners.length) {
    const diagrams = publication.pages.flatMap(page => [...page.svg.querySelectorAll('.vf-score-opening .vf-fret-diagram')]);
    diagrams.forEach((diagram, index) => {
      const nativeId = diagram.getAttribute('data-vf-id')?.replace(/^vf-/, '');
      if (nativeId && frameOwners[index]) frameOwners[index].sources.ids[nativeId] = frameOwners[index].frame.source;
    });
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
  for (const score of performing) for (const m of score.measures) for (const voice of m.voices)
    for (const event of voice.events) attacks.set(event.id, event);
  const anchors = new Map((context?.conductor ? views : views.slice(0, 1)).flatMap(v => [...v.printAnchors]));
  for (const page of publication.pages) scoreSurfaces.set(page.svg, { score: parsed, ensemble: context?.conductor ? scores : undefined, read: () => printedGeometry(publication, attacks, anchors, (settings.staffSize ?? 7) / 40) });
  return { publication, diagnostics, score: parsed, rangeFor,
    headRangeFor: (event: string, head: number, revision: string) => rangeFor(event + '-head-' + head, revision),
    sourceFor: (id: string) => views.map(v => v.sources.sourceFor(id)).find(Boolean) };
}
