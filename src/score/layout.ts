// Project the shared score into fresh VexFlow objects for each screen or publication view.
import {
  Accidental, Barline, Dot, Factory, Publication, ScoreNavigation, SVGContext, TabNote, TabTie, TimeSignature,
  type ContinuousSpan, type EasyScoreComposition, type EasyScoreCompositionSpec, type EasyScoreContent,
  type EasyScoreVoiceSpec, type PublicationOptions, type RenderContext, type ScoreHitRegion,
} from 'vexflow';
import type { Measure, MeasureVoice, ParsedScore } from './model';
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

/** Both projections use the written duration, including dots before tuplet scaling. */
function voiceSpec(voice: MeasureVoice, measure: Measure, staff: Staff, sources: Sources, index: number): EasyScoreVoiceSpec {
  const direction = voice.stem ?? (measure.voices.length > 1 ? (index === 0 ? 'up' : 'down') : undefined);
  const stemDirection = direction ? (direction === 'up' ? 1 : -1) : staff === 'tab' ? voice.tabDirection : undefined;
  const notes: EasyScoreContent[] = voice.events.map(event => {
    const id = sources.project(staff, event.id, event.range);
    const rhythm = { duration: event.base, dots: event.dots, stemDirection };
    if (!event.heads.length) return { id, note: { ...rhythm, keys: ['r/4'], clef: 'treble', type: 'r' } };
    const keys = event.heads.map(h => h.written);
    if (staff === 'tab') {
      return { id, tab: { ...rhythm, keys, positions: event.heads.map(h => ({ ...h.position! })) }, drawStem: voice.tabStems };
    }
    return { id, note: { ...rhythm, keys, clef: measure.state.clef, type: event.slash ? 's' : 'n', autoStem: !direction } };
  });
  return {
    notes, stem: direction ?? 'auto',
    autoBeam: voice.beams && (staff === 'notation' || voice.tabStems) && {
      stemDirection, beamRests: voice.beamRests, showStemlets: voice.stemlets, beamMiddleOnly: voice.middleRests },
    tuplets: voice.tuplets.map(t => ({ start: t.start, count: t.count, options: { numNotes: t.numNotes, notesOccupied: t.notesOccupied } })),
  };
}

/** Retain declarative descriptors only. Every independently composed part gets fresh native objects. */
function project(parsed: ParsedScore, part: Part, width: number) {
  const staves = projections(parsed, part);
  const sources = new Sources(parsed.source);
  const eventId = sources.id;
  const spans: ContinuousSpan[] = [];
  const spec: EasyScoreCompositionSpec = {
    accidentals: 'key-aware', sheet: { width, x: 10, y: 14, rowGap: 36 }, system: { spaceBetweenStaves: 9 },
    staves: staves.map(staff => ({
      id: staff, kind: staff === 'tab' ? 'tab' : 'stave',
      options: staff === 'tab' ? { numLines: parsed.measures[0].state.strings } : {},
      measures: parsed.measures.map(m => ({
        clef: staff === 'tab' ? 'tab' : m.state.clef, key: m.state.key, time: m.state.meter, span: m.span,
        voices: m.voices.map((v, index) => voiceSpec(v, m, staff, sources, index)),
      })),
    })),
    continuous: {
      courtesy: false, measureNumbers: false, spans,
      groups: staves.length === 2 ? [{ first: 'notation', last: 'tab', type: 'bracket' }] : [],
      boundaries: parsed.measures.map(m => ({
        measure: m.number, breakBefore: m.newRow && m.number > 1 ? 'force' : undefined,
        repeatStart: ['repeat-begin', 'repeat-both'].includes(m.voices[0].opening?.type),
        repeatEnd: ['repeat-end', 'repeat-both'].includes(m.voices[0].closing?.type),
      })),
    },
  };
  for (const tie of parsed.ties) {
    if (staves.includes('notation')) spans.push({
      kind: 'tie', id: sources.project('notation', tie.id, tie.range), from: eventId('notation', tie.from),
      to: eventId('notation', tie.to), fromHead: tie.fromHead, toHead: tie.toHead,
    });
  }
  return { spec, staves, sources, eventId };
}
type Projection = ReturnType<typeof project>;

/** Install screen-only modifiers before formatting, while note IDs still refer to both projections. */
function prepareScreen(parsed: ParsedScore, view: Projection, composition: EasyScoreComposition) {
  for (const [index, m] of parsed.measures.entries()) {
    for (const [s, staff] of view.staves.entries()) {
      const stave = composition.staves[index][s];
      const modifiers = stave.getModifiers();
      const pairedTab = staff === 'tab' && view.staves.includes('notation');
      if (!m.state.showTime || pairedTab) {
        const sign = modifiers.findIndex(mark => mark instanceof TimeSignature);
        if (sign >= 0) modifiers.splice(sign, 1);
      } else if (index && !parsed.measures[index - 1].state.showTime && !modifiers.some(mark => mark instanceof TimeSignature)) {
        stave.addTimeSignature(m.state.meter);
      }
      const end = m.voices[0].closing?.type;
      if (end === 'end' || end === 'double') stave.setEndBarType(end === 'end' ? Barline.type.END : Barline.type.DOUBLE);
      for (const voice of m.voices) for (const event of voice.events) {
        const note = composition.getNote(view.eventId(staff, event.id));
        if (staff === 'tab' && !voice.tabStems) {
          // Keep VexFlow's exact tuplet multiplier. Skip the numeral on an unstemmed tab staff.
          for (const tuplet of note.getTupletStack()) tuplet.setRendered();
          if (!event.heads.length) note.renderOptions.draw = false;
        }
        for (let i = 0; i < event.dots; i++) Dot.buildAndAttach([note], note instanceof TabNote ? { index: 0 } : { all: true });
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
}

/** Native continuous ties require pitched staff notes. Tab ties use the same head endpoints
 * and split on the actual formatted row edges, including a chord written in a new order. */
function drawTabTies(parsed: ParsedScore, view: Projection, composition: EasyScoreComposition, ctx: RenderContext) {
  if (!view.staves.includes('tab')) return [];
  const rows = new Map(composition.sheet.getContinuousLayout().rows.flatMap((row, i) =>
    row.measures.map(m => [m, i] as const)));
  const measureOf = new Map(parsed.measures.flatMap(m => m.voices.flatMap(v => v.events.map(e => [e.id, m.number] as const))));
  const regions: ScoreHitRegion[] = [];
  for (const t of parsed.ties) {
    const firstNote = composition.getNote(view.eventId('tab', t.from)), lastNote = composition.getNote(view.eventId('tab', t.to));
    const firstRow = rows.get(measureOf.get(t.from)), lastRow = rows.get(measureOf.get(t.to));
    const firstIndexes = [t.fromHead], lastIndexes = [t.toHead];
    const segments = firstRow === lastRow ? [{ firstNote, lastNote, firstIndexes, lastIndexes }]
      : [{ firstNote, firstIndexes, lastIndexes: firstIndexes }, { lastNote, lastIndexes, firstIndexes: lastIndexes }];
    const id = view.sources.project('tab', t.id, t.range);
    segments.forEach((ends, i) => {
      const tie = new TabTie(ends, '').setAttribute('id', id + '-' + i);
      if (!ends.firstNote) {
        // Leave a readable lead-in between the repeated TAB clef and the first fret.
        const stave = lastNote.checkStave();
        const clef = stave.getModifiers().find(modifier => modifier.getCategory() === 'Clef');
        const afterClef = clef ? clef.getX() + clef.getWidth() + 2 : stave.getX() + 2;
        tie.renderOptions.firstXShift = -Math.min(stave.getSpacingBetweenLines(), Math.max(0, stave.getTieStartX() - afterClef));
        tie.renderOptions.cp2Short = 4;
      }
      tie.setContext(ctx).draw();
      const { x, y, w, h } = tie.getRibbonBounds();
      regions.push({ id, kind: 'span' as const, source: t.id, row: i ? lastRow : firstRow, x, y, w, h });
    });
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
  const factory = new Factory({ renderer: { elementId: null, width, height: 1 } }).setContext(ctx);
  const composition = factory.EasyScore().compose(view.spec);
  prepareScreen(parsed, view, composition);
  factory.draw();
  const tabRegions = drawTabTies(parsed, view, composition, ctx);
  const navigation = new ScoreNavigation(composition, view.spec.staves, view.sources.ids);
  // Silent tab rests still advance the reader's clock, but have no visible pointer target.
  const hidden = new Set(parsed.measures.flatMap(m => m.voices.filter(v => !v.tabStems)
    .flatMap(v => v.events.filter(e => !e.heads.length).map(e => view.eventId('tab', e.id)))));
  function hitTest(x: number, y: number): ScoreHitRegion | undefined {
    const hit = navigation.hitTest(x, y);
    if (hit && !hidden.has(hit.id)) return hit;
    return tabRegions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }
  const rows = composition.sheet.getRows();
  const extent = Math.max(width, ...rows.map(r => r.x + r.width + 10));
  ctx.resize(extent, Math.ceil(composition.sheet.getHeight() + 20));
  host.replaceChildren(surface);
  return { composition, navigation, hitTest, tabRegions, diagnostics: composition.sheet.getContinuousLayout().diagnostics,
    rangeFor: view.sources.rangeFor, sourceFor: view.sources.sourceFor };
}

/** Publication recomposes from descriptors. Reject any selected mark that needs the screen pass. */
export function renderScorePart(host: HTMLElement, parsed: ParsedScore, part: Staff,
  options: Omit<PublicationOptions, 'staves'> = {}) {
  const view = project(parsed, part, 600);
  const unsupported = (feature: string, range: SourceRange): never => {
    throw new ScoreError('fixed-layout', `Use fixed layout for ${feature} in a printed ${part} part`, range);
  };
  if (part === 'tab' && parsed.ties.length) unsupported('a tab tie', parsed.ties[0].range);
  for (const m of parsed.measures) {
    if (!m.state.showTime) unsupported('a hidden signature', m.state.timeRange);
    const bar = m.voices[0].closing;
    if (bar && ['end', 'double'].includes(bar.type)) unsupported('a final or double bar', bar.range);
    for (const voice of m.voices) {
      if (part === 'tab' && !voice.tabStems && voice.tuplets.length) unsupported('an unstemmed tab tuplet', voice.tuplets[0].range);
      for (const event of voice.events) {
        if (event.dots) unsupported('augmentation dots', event.rhythmRange);
        const sign = part === 'notation' && event.heads.find(h => h.accidental);
        if (sign) unsupported('an explicit accidental', sign.range);
        if (part === 'tab' && !voice.tabStems && !event.heads.length) unsupported('a silent tab rest', event.range);
      }
    }
  }
  const publication = new Publication(view.spec).render(host, options);
  return { publication, rangeFor: view.sources.rangeFor, sourceFor: view.sources.sourceFor };
}
