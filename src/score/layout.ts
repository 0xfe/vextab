// Project the shared score into fresh VexFlow objects for each screen or publication view.
import { inkStyle } from './color';
import { colorPublication } from './publication-color';
import { scoreFont } from './engraving';
import {
  Accidental, Annotation, Barline, StaveNote, Factory, FrettedInstrument, Publication, ScoreNavigation, SVGContext,
  type Beam, type StemmableNote, type ContinuousSpan, type EasyScoreComposition, type EasyScoreCompositionSpec, type EasyScoreContent,
  type EasyScoreVoiceSpec, type NotationIdentity, type PublicationOptions, type RenderContext, type ScoreHitRegion,
} from 'vexflow';
import { describePrebend, makePrebend } from './music';
import { leadMarks, drawFrames } from './lead';
import type { Attack, Measure, MeasureVoice, ParsedScore, ScoreSpan } from './model';
import { ScoreError, type SourceRange } from './source';

type Staff = 'notation' | 'tab';
export type Part = 'score' | Staff;

/** Different views may coexist in one document. Keep DOM IDs unique and musical IDs stable. */
let nextView = 0;
function projections(parsed: ParsedScore, part: Part): Staff[] {
  const choices: Staff[] = ['notation', 'tab'];
  const initial = parsed.measures[0].state;
  const staves = choices.filter(s => initial[s] && (part === 'score' || part === s));
  if (!staves.length) throw new ScoreError('fixed-layout', `No ${part} staff in this score`, parsed.measures[0].range);
  for (const m of parsed.measures) {
    if (choices.some(s => (part === 'score' || part === s) && m.state[s] !== initial[s]) ||
        (staves.includes('tab') && m.state.strings !== initial.strings)) {
      throw new ScoreError('fixed-layout', 'Use fixed layout for a change of staff configuration', m.state.declaration);
    }
  }
  return staves;
}

/** Resolve geometry or a publication ID only against the source revision that produced it. */
class Sources {
  readonly ids: Record<string, string> = Object.create(null);
  private readonly ranges = new Map<string, SourceRange>();
  private readonly prefix = 'vt' + (++nextView) + '-';
  constructor(private readonly revision: string) {}
  id = (staff: Staff, event: string) => this.prefix + staff + '-' + event;
  project(staff: Staff, id: string, range: SourceRange): string {
    const projected = this.id(staff, id);
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
    labels.push(...instrument.bentAttack(pitched, event.base, event.bend.spec).note.notation);
  } else if (physical.length) {
    for (const mark of instrument.attack(physical, event.base).note.notation) {
      labels.push({ ...mark, index: physical[mark.index].index });
    }
  }
  event.heads.forEach((h, index) => {
    if (h.prebend) labels.push({ kind: 'technique', id: 'pre-bend', index, label: describePrebend(h.prebend, h.position.str) });
    if (!h.position && h.sounding === null) labels.push({ kind: 'unpitched', id: 'slash', label: 'Rhythm slash', index });
  });
  return labels;
}

/** Both projections use the written duration, including dots before tuplet scaling. */
function voiceSpec(voice: MeasureVoice, measure: Measure, staff: Staff, sources: Sources, index: number): EasyScoreVoiceSpec {
  const direction = voice.stem ?? (measure.voices.length > 1 ? (index === 0 ? 'up' : 'down') : undefined);
  const stemDirection = direction ? (direction === 'up' ? 1 : -1) : staff === 'tab' ? voice.tabDirection : undefined;
  const instrument = new FrettedInstrument(measure.state.tuning, measure.state.capo);
  const notes: EasyScoreContent[] = voice.events.map(event => {
    const id = sources.project(staff, event.id, event.range);
    const rhythm = { duration: event.base, dots: event.dots, stemDirection };
    if (!event.heads.length) return { id, note: { ...rhythm, keys: ['r/4'], clef: 'treble', type: 'r' } };
    const notation = guitarNotation(event, instrument);
    const keys = event.heads.map(h => h.position?.fret === 'X' ? h.written + '/X' : h.written);
    if (staff === 'tab') {
      return { id, tab: { ...rhythm, keys, notation, positions: event.heads.map(h => ({ ...h.position! })) }, drawStem: voice.tabStems && !['w', '1'].includes(event.base) };
    }
    return { id, note: { ...rhythm, keys, notation, clef: measure.state.clef, type: event.slash ? 's' : 'n', autoStem: !direction } };
  });
  return {
    notes, stem: direction ?? 'auto',
    autoBeam: voice.beams && (staff === 'notation' || voice.tabStems) && {
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
  const spans: ContinuousSpan[] = [];
  // VexFlow can draw a tab ending between two TabNotes or two rendered rests.
  // Mixed endpoint types still need the screen fallback for a tab-only projection.
  const rests = new Set(parsed.measures.flatMap(m => m.voices.flatMap(v => v.events.filter(e => !e.heads.length).map(e => e.id))));
  const mixedEndings: ScoreSpan[] = [];
  const spec: EasyScoreCompositionSpec = {
    accidentals: 'key-aware', sheet: { width, x: 10, y: 14, rowGap: 36 }, system: { spaceBetweenStaves: 9 },
    staves: staves.map(staff => ({
      id: staff, kind: staff === 'tab' ? 'tab' : 'stave',
      options: staff === 'tab' ? { numLines: parsed.measures[0].state.strings } : {},
      measures: parsed.measures.map(m => ({
        clef: staff === 'tab' ? 'tab' : m.state.clef, key: m.state.key, time: m.state.meter, span: m.span,
        showTimeSignature: m.state.showTime && !(staff === 'tab' && staves.includes('notation')),
        endBarline: writtenEndBar(m),
        ...(staff === staves[0] && leadMarks(m, staff, id => eventId(staff, id), publication || !staves.includes('tab'))),
        voices: m.voices.map((v, index) => voiceSpec(v, m, staff, sources, index)),
      })),
    })),
    continuous: {
      courtesy: false, measureNumbers: parsed.measureNumbers, spans,
      groups: staves.length === 2 ? [{ first: 'notation', last: 'tab', type: 'bracket' }] : [],
      boundaries: parsed.measures.map(m => ({
        measure: m.number, rehearsal: m.voices[0].rehearsal, breakBefore: m.newRow && m.number > 1 ? 'force' : undefined,
        repeatStart: ['repeat-begin', 'repeat-both'].includes(m.voices[0].opening?.type),
        repeatEnd: ['repeat-end', 'repeat-both'].includes(m.voices[0].closing?.type),
      })),
    },
  };
  for (const tie of parsed.ties) {
    for (const staff of staves) spans.push({
      kind: 'tie', id: sources.project(staff, tie.id, tie.range), from: eventId(staff, tie.from),
      to: eventId(staff, tie.to), fromHead: tie.fromHead, toHead: tie.toHead,
    });
  }
  for (const mark of parsed.spans ?? []) {
    if (mark.kind === 'palmMute' && !staves.includes('tab')) {
      throw new ScoreError('fixed-layout', 'A string-specific palm mute needs a tab staff', mark.range);
    }
    const staff = mark.kind === 'palmMute' ? 'tab' : staves[0];
    const id = sources.project(staff, mark.id, mark.range);
    const endpoints = { id, from: eventId(staff, mark.from), to: eventId(staff, mark.to) };
    if (mark.kind === 'palmMute') spans.push({ ...endpoints, kind: mark.kind, strings: mark.strings });
    else if (staff === 'tab' && rests.has(mark.from) !== rests.has(mark.to)) mixedEndings.push(mark);
    else spans.push({ ...endpoints, kind: mark.kind, text: mark.label });
  }
  return { spec, staves, sources, eventId, mixedEndings };
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

/** Install screen-only modifiers before formatting, while note IDs still refer to both projections. */
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
      for (const voice of m.voices) for (const event of voice.events) {
        const note = composition.getNote(view.eventId(staff, event.id));
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
        if (staff === 'tab') {
          event.heads.forEach((head, index) => {
            if (head.prebend) note.addModifier(makePrebend(head.prebend), index);
          });
        }
        if (staff === 'tab' && !voice.tabStems) {
          // Keep VexFlow's exact tuplet multiplier. Skip the numeral on an unstemmed tab staff.
          for (const tuplet of note.getTupletStack()) tuplet.setRendered();
          if (!event.heads.length) note.renderOptions.draw = false;
        }
        // Native lead descriptors own the engraving. Retain the authored source IDs for diagnostics.
        if (staff === view.staves[0]) {
          for (const mark of note.getModifiers()) {
            if (!(mark instanceof Annotation)) continue;
            const kind = mark.getVerticalJustification() === Annotation.VerticalJustify.TOP ? 'chord' : 'lyric';
            if (kind === 'chord' && event.chord?.color) mark.setStyle(inkStyle(event.chord.color));
            const range = event[kind]?.range;
            if (range) mark.setAttribute('id', view.sources.project(staff, kind + range.start, range));
          }
        }
        if (staff !== 'notation') continue;
        event.heads.forEach((head, i) => {
          if (!head.accidental) return;
          let mark = note.getModifiers().find((m): m is Accidental => m instanceof Accidental && m.getIndex() === i);
          if (!mark) {
            mark = new Accidental(head.accidental);
            note.addModifier(mark, i);
          }
          if (head.cautionary) mark.setAsCautionary();
        });
      }
    }
  }
  splitSilentBeams(factory, split, silent);
}

/** Draw mixed rest/fret endings that the native tab span cannot yet anchor. */
function drawTabEndings(view: Projection, composition: EasyScoreComposition, ctx: RenderContext) {
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
      const y = row.y - 15;
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

/** Recompose off-screen, then replace the host after all layout, drawing and indexing succeeds. */
export function renderScore(host: HTMLElement, parsed: ParsedScore, options: { width?: number; part?: Part } = {}) {
  const width = options.width ?? (host.clientWidth || 640);
  if (!Number.isFinite(width) || width <= 20) throw new RangeError('Score width must exceed 20 pixels');
  const view = project(parsed, options.part ?? 'score', width - 20);
  const surface = document.createElement('div');
  const ctx = new SVGContext(surface);
  const frames = drawFrames(parsed, width, ctx, (id, range) => view.sources.project(view.staves[0], id, range));
  view.spec.sheet.y += frames.height + (view.mixedEndings.length ? 20 : 0);
  const factory = new Factory({ renderer: { elementId: null, width, height: 1 } }).setContext(ctx);
  const composition = factory.EasyScore().compose(view.spec);
  prepareScreen(parsed, view, composition, factory);
  factory.draw();
  const extraRegions = [...frames.regions, ...drawTabEndings(view, composition, ctx)];
  const navigation = new ScoreNavigation(composition, view.spec.staves, view.sources.ids);
  // Expose the fragments of each written tie together, in source order.
  const tabTies = new Map(parsed.ties.map(t => [view.eventId('tab', t.id), [] as ScoreHitRegion[]]));
  for (const region of navigation.regions) tabTies.get(region.id)?.push(region);
  const tabRegions = Array.from(tabTies.values()).flat();
  // Silent tab rests still advance the reader's clock, but have no visible pointer target.
  const hidden = new Set(parsed.measures.flatMap(m => m.voices.filter(v => !v.tabStems)
    .flatMap(v => v.events.filter(e => !e.heads.length).map(e => view.eventId('tab', e.id)))));
  for (const m of parsed.measures) for (const v of m.voices) for (const e of v.events) {
    if (e.silent) for (const staff of view.staves) hidden.add(view.eventId(staff, e.id));
  }
  function hitTest(x: number, y: number): ScoreHitRegion | undefined {
    const hit = navigation.hitTest(x, y);
    if (hit && !hidden.has(hit.id)) return hit;
    return extraRegions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }
  const rows = composition.sheet.getRows();
  const extent = Math.max(width, frames.width, ...rows.map(r => r.x + r.width + 10));
  ctx.resize(extent, Math.ceil(composition.sheet.getHeight() + 20));
  host.replaceChildren(surface);
  const diagnostics: { code: string; measures: number[]; range: SourceRange; source?: string }[] =
    composition.sheet.getContinuousLayout().diagnostics.map(d => ({
    ...d, range: (d.source && view.sources.rangeFor(d.source, parsed.source)) || parsed.measures[d.measures[0] - 1]?.range,
  }));
  for (const m of parsed.measures) {
    if (!m.voices.some(v => v.events.some(e => e.chord || e.lyric))) continue;
    for (const d of composition.systems[m.number - 1].getPhraseLayout().diagnostics) {
      const source = d.sources.find(id => view.sources.rangeFor(id, parsed.source));
      diagnostics.push({ code: d.code, measures: [m.number], source, range: view.sources.rangeFor(source, parsed.source) ?? m.range });
    }
  }
  return { composition, navigation, hitTest, tabRegions, extraRegions, diagnostics,
    rangeFor: view.sources.rangeFor, sourceFor: view.sources.sourceFor };
}

/** Extract one numbered voice across all measures. Shared endings follow its boundary events. */
function selectVoice(score: ParsedScore, number: number): ParsedScore {
  const events = new Set<string>();
  const measures = score.measures.map(m => {
    const voice = m.voices[number - 1];
    if (!Number.isInteger(number) || !voice) throw new ScoreError('measure', 'Missing voice ' + number + ' in bar ' + m.number, m.range);
    for (const event of voice.events) events.add(event.id);
    return { ...m, voices: [{ ...voice, stem: undefined, rehearsal: m.voices[0].rehearsal }] };
  });
  const ties = score.ties.filter(t => events.has(t.from) && events.has(t.to));
  const spans = (score.spans ?? []).filter(s => s.kind === 'volta' || events.has(s.from)).map(s => {
    if (s.kind !== 'volta') return s;
    const end = measures[s.lastBar - 1].voices[0].events;
    return { ...s, from: measures[s.firstBar - 1].voices[0].events[0].id, to: end[end.length - 1].id };
  });
  return { ...score, measures, ties, spans };
}

/** Publication recomposes from descriptors. Reject any selected mark that needs the screen pass. */
export function renderScorePart(host: HTMLElement, parsed: ParsedScore, part: Staff,
  options: Omit<PublicationOptions, 'staves'> & { voice?: number } = {}) {
  const { voice, ...paper } = options;
  if (voice !== undefined) parsed = selectVoice(parsed, voice);
  const view = project(parsed, part, 600, true);
  const unsupported = (feature: string, range: SourceRange): never => {
    throw new ScoreError('fixed-layout', `Independent ${part} parts cannot engrave ${feature} yet`, range);
  };
  if (view.mixedEndings.length) unsupported('a tab ending between a rest and a fret', view.mixedEndings[0].range);
  for (const m of parsed.measures) {
    for (const voice of m.voices) {
      if (part === 'tab' && !voice.tabStems && voice.tuplets.length) unsupported('an unstemmed tab tuplet', voice.tuplets[0].range);
      for (const event of voice.events) {
        if (event.frame) unsupported('a chord frame', event.frame.range);
        if (event.silent) unsupported('a silent position', event.silent);
        const sign = part === 'notation' && event.heads.find(h => h.accidental);
        if (sign) unsupported('an explicit accidental', sign.range);
        if (part === 'tab' && !voice.tabStems && !event.heads.length) unsupported('a silent tab rest', event.range);
      }
    }
  }
  const publication = new Publication(view.spec).render(host, paper);
  colorPublication(publication, parsed, event => view.eventId(part, event.id));
  return { publication, rangeFor: view.sources.rangeFor, sourceFor: view.sources.sourceFor };
}
