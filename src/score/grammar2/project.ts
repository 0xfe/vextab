// Translate one v2 instrument into the measured score used by engraving, printing, navigation and playback.
import { resolveVerseLinks } from '../verses';
import { duplicateMark } from './marks.mts';
import { NotationSpelling, PercussionMap, Fraction, FrettedInstrument, KeyManager, Music, Tuning } from 'vexflow';
import type { Attack, Head, Measure, MeasureVoice, ParsedScore, StaffState } from '../model';
import { midiPitch, soundingGuitarPitch, spellFret } from '../music';
import { Interval, transposeChord } from '../transpose';
import { frame, resolveMarks } from '../commands';
import { isScoreColor } from '../color';
import { drumKit } from '../drums';
import { ScoreError, type SourceRange } from '../source';
import type { EventMark, ScoreV2, Head as WrittenHead, ScoreVoice, ScoreEvent, TextRange } from './model';

/** Index the original revision once. CRLF and non-BMP characters keep their DOM selection offsets. */
export function locations(source: string) {
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
  const { id, name, shortName, sounds } = part;
  const hasIdentity = id !== undefined || name !== undefined || shortName !== undefined || sounds !== undefined
    || part.staves.some(staff => staff.id !== undefined || staff.displayName !== undefined || staff.shortName !== undefined || staff.sounds !== undefined);
  const instrument = hasIdentity && { id, name, shortName, sounds, staves: Object.fromEntries(part.staves.map(staff =>
    [staff.name, { id: staff.id, name: staff.displayName, shortName: staff.shortName, sounds: staff.sounds }])) };
  let tuning = new Tuning(part.tuning ?? 'standard');
  const music = new Music();
  let writtenKey = part.key ?? 'C';
  let manager = new KeyManager(writtenKey);
  const fretKeys = new Map<string, KeyManager>();
  const capo = part.capo ?? 0;
  const hasUnassignedPitch = part.staves.some(staff => staff.voices.some(voice =>
    voice.events.some(event => event.heads.some(head => 'pitch' in head))));
  if (hasUnassignedPitch && (part.view === 'tab' || part.view === 'both')) {
    throw new ScoreError('measure', 'A tab view needs a string and fret for every pitch', declaration);
  }
  function ink(value: string, range: SourceRange) {
    if (!isScoreColor(value)) throw new ScoreError('measure', 'Expected a CSS color name or hex code', range);
    return value;
  }
  const tuningName = part.tuning ?? 'standard';
  const opening = part.staves[0].voices[0].measures[0];
  const initialMeter = opening.meter ?? score.meter;
  const initialMeterRange = opening.meterRange ?? score.meterRange;
  const state: StaffState = {
    declaration, color: part.ink && part.ink !== 'default' ? ink(part.ink, declaration) : undefined, timeRange: locate(initialMeterRange ?? part.range), meter: initialMeter, showTime: !!initialMeterRange,
    tab: part.kind === 'guitar' && part.view !== 'notation' && !hasUnassignedPitch, notation: part.view !== 'tab', piano: part.kind === 'piano',
    tuning: tuningName, strings: (Tuning.names[tuningName] ?? tuningName).split(',').length, capo, key: part.key ?? 'C',
    hideClef: part.clef === 'none', clef: part.kind === 'drums' ? 'percussion' : part.clef === 'none' ? 'treble' : part.clef ?? 'treble', pickup: score.pickup, fragment: false,
  };
  const measures: Measure[] = [];
  const projected: ParsedScore = { ...(score.groups && { groups: score.groups }), ...(instrument && { instrument }), source: score.source, measures, ties: [], spans: [], playback: score.playback, layout: score.layout, measureNumbers: score.measureNumbers ?? false };
  projected.program = part.program;
  const kit = part.drums?.length ? new PercussionMap([...PercussionMap.kit, ...part.drums]) : drumKit;
  if (part.kind === 'drums') state.kit = kit;
  const fullBar = new Fraction().parse(initialMeter).simplify().toString();
  const intervals = new Map<string, Interval>();
  function intervalFor(amount: number): Interval | undefined {
    if (!amount || part.kind === 'drums') return;
    const id = writtenKey + '/' + amount;
    if (!intervals.has(id)) intervals.set(id, new Interval(amount, writtenKey));
    return intervals.get(id);
  }

  /** Keep the displayed spelling, sounding pitch and physical position distinct. */
  function projectHead(head: WrittenHead, interval?: Interval): Head {
    const range = locate(head.range);
    const marks: Head['marks'] = [];
    let result: Head;
    if ('drum' in head) result = { drum: head.drum, midi: part.drums?.find(d => d.id === head.drum)?.midi, written: kit.note([head.drum], 'q').keys[0], sounding: null, range };
    else if ('pitch' in head) {
      const letter = head.pitch[0].toLowerCase(), sign = head.pitch.slice(1, -1);
      manager.reset();
      const spelling = sign ? letter + (sign === 'n' ? '' : sign) : manager.getAccidental(letter).note;
      const written = interval ? interval.pitch(spelling, Number(head.pitch.slice(-1))) : spelling + '/' + head.pitch.slice(-1);
      // A spelling determines pitch. The engraver prints changes and cancellations across the bar.
      // Only showSign and courtesy force ink on a repeated or otherwise redundant alteration.
      result = { written, sounding: written, range };
    } else {
      if (head.string > state.strings) throw new ScoreError('measure', 'String outside the tuning', range);
      const position = { str: head.string, fret: head.fret === 'x' ? 'X' as const : head.fret + (interval?.semitones ?? 0) };
      if (typeof position.fret === 'number' && position.fret < 0) throw new ScoreError('measure', 'Transposition puts fret outside the original string', range);
      const bend = head.marks.find(m => m.kind === 'prebend');
      const fret = (bend?.semitones ?? 0) + (typeof position.fret === 'number' ? position.fret : 0) + capo;
      const displayKey = interval?.target ?? writtenKey;
      if (!fretKeys.has(displayKey)) fretKeys.set(displayKey, new KeyManager(displayKey));
      const [name, octave] = spellFret(tuning, fretKeys.get(displayKey), music, String(fret), head.string);
      result = { position, written: name + '/' + octave, sounding: head.fret === 'x' ? null : soundingGuitarPitch(tuning, fret, head.string), range };
    }
    if (part.cautionary && result.position && result.written.split('/')[0].length > 1) {
      result.accidental = result.written.split('/')[0].slice(1);
      result.cautionary = true;
    }
    for (const mark of head.marks) {
      if (mark.kind === 'sustain') result.sustain = mark.duration;
      if (mark.kind === 'prebend') result.prebend = { semitones: mark.semitones, release: mark.release };
      if (mark.kind === 'slideIn' || mark.kind === 'slideOut') result.openSlide = { edge: mark.kind === 'slideIn' ? 'in' : 'out', side: mark.side };
      if (mark.kind === 'write') {
        if (!result.position) throw new ScoreError('measure', 'A written-pitch override needs a fretted head', locate(mark.range));
        const letter = mark.pitch[0].toLowerCase(), sign = mark.pitch.slice(1, -1);
        const name = sign ? letter + (sign === 'n' ? '' : sign) : manager.getAccidental(letter).note;
        result.written = interval ? interval.pitch(name, Number(mark.pitch.slice(-1))) : name + '/' + mark.pitch.slice(-1);
      }
      if (mark.kind === 'gliss') result.glissFrom = mark.fromHead;
      if (mark.kind === 'release') result.release = mark;
      if (mark.kind === 'sign') marks.push({ articulation: mark.code, position: mark.position });
      if (mark.kind === 'finger' || mark.kind === 'stringNumber') marks.push({ finger: String(mark.value), stringNumber: mark.kind === 'stringNumber', position: mark.side });
    }
    // Resolve forced signs after the written spelling, regardless of mark order in the source.
    for (const mark of head.marks) {
      if (mark.kind === 'courtesy' || mark.kind === 'showSign') {
        result.accidental = result.written.split('/')[0].slice(1) || 'n';
        result.cautionary = mark.kind === 'courtesy';
      }
    }
    for (const mark of head.marks) if (mark.kind === 'hammer' || mark.kind === 'pull' || mark.kind === 'slide') result.connection = mark.kind;
    if ('hammerFrom' in head && head.hammerFrom) result.hammer = true;
    if (marks.length) result.marks = marks;
    if (result.sounding && midiPitch(result.sounding) === undefined) throw new ScoreError('measure', 'Pitch outside MIDI range', range);
    return result;
  }

  /** Resolve grace pitches once so notation, TAB and playback use the same tuning and transposition. */
  function projectGrace(mark: Extract<EventMark, { kind: 'grace' }>, interval?: Interval): Attack['grace'] {
    const steps = mark.pitches.map(step => (Array.isArray(step) ? step : [step]).map(key => {
      const head = typeof key === 'string' ? { pitch: key } : key;
      return projectHead({ ...head, marks: [], range: mark.range }, interval);
    }));
    const fretted = steps.some(chord => chord.some(head => head.position));
    if (fretted && (part.kind !== 'guitar' || steps.some(chord => chord.some(head => !head.position))))
      throw new ScoreError('measure', 'Write every guitar grace head as a fret/string, or use written pitches throughout', locate(mark.range));
    if (!fretted && !state.notation)
      throw new ScoreError('measure', 'TAB grace notes need explicit fret/string positions', locate(mark.range));
    const positions = fretted ? steps.map(chord => chord.map(head => head.position!)) : undefined;
    if (positions?.some(chord => new Set(chord.map(head => head.str)).size !== chord.length))
      throw new ScoreError('measure', 'A grace chord may use each string once', locate(mark.range));
    return { side: mark.side, slash: mark.slash, ...(mark.steal && { steal: mark.steal }), positions, fingerings: mark.fingerings,
      pitches: steps.map((chord, i) => Array.isArray(mark.pitches[i]) ? chord.map(head => head.written) : chord[0].written) };
  }

  /** Place one expanded event on the measure clock and resolve its annotations. */
  function attack(event: ScoreEvent, sounds: number): Attack {
    const interval = intervalFor((score.transpose ?? 0) + (event.transpose ?? 0));
    // Previously serialized models can predate duplicate-mark validation in the compiler.
    for (const marks of [event.marks, ...event.heads.map(head => head.marks)]) {
      const duplicate = duplicateMark(marks);
      if (duplicate) throw new ScoreError('measure', duplicate.reason, locate(duplicate.range));
    }
    const heads = event.heads.map(head => projectHead(head, interval));
    // An explicit instrument interval is measured from the written pitch. An ordinary guitar
    // otherwise keeps its native tuning and octave convention, including display-only overrides.
    const shift = intervalFor((sounds ?? 0) + 12 * (event.soundingOctaves ?? 0));
    if (sounds !== undefined || event.soundingOctaves) for (const head of heads) {
      if (!head.sounding) continue;
      const origin = sounds === undefined ? head.sounding : head.written;
      const [pitch, octave] = origin.split('/');
      head.sounding = shift ? shift.pitch(pitch, Number(octave)) : origin;
      if (midiPitch(head.sounding) === undefined) throw new ScoreError('measure', 'Sounding pitch exceeds the MIDI range after the octave or instrument shift', head.range);
    }
    if (event.kind === 'slash') {
      if (state.tab) throw new ScoreError('measure', 'Give a slash a notation-only staff', locate(event.range));
      heads.push({ written: 'b/4', sounding: null, range: locate(event.range) });
    }
    const result: Attack = {
      id: event.id, range: locate(event.range), heads, slash: event.kind === 'slash',
      onset: event.at, duration: event.duration, ...writtenRhythm(event.writtenDuration) };
    if (event.rhythmRange) result.rhythmRange = locate(event.rhythmRange);
    if (event.kind === 'skip') result.silent = result.range;
    event.heads.forEach((h, i) => {
      for (const mark of h.marks) if (mark.kind === 'bend' && 'string' in h) {
        const range = locate(mark.range), positions = heads.map(head => head.position);
        if (heads[i].bend || heads[i].prebend || positions.some(p => !p || typeof p.fret !== 'number'))
          throw new ScoreError('measure', 'A bend needs pitched frets and one contour per string', range);
        const spec = { string: h.string, semitones: mark.semitones, rise: mark.rise, release: mark.release, hold: mark.hold };
        try { new FrettedInstrument(state.tuning, capo).bentAttack(positions as { str: number; fret: number }[], result.base, spec); }
        catch (e) { throw new ScoreError('measure', e.message, range); }
        heads[i].bend = spec;
        result.bend ??= { spec, range };
      }
    });
    for (const mark of event.marks) {
      if (mark.kind === 'slash') {
        if (!heads.length) throw new ScoreError('measure', 'A slash needs a written head', locate(mark.range));
        result.slash = true;
      }
      if (mark.kind === 'lyric') {
        const syllable = { ...mark, range: locate(mark.range) };
        if (mark.verse) (result.verses ??= []).push(syllable);
        else result.lyric = syllable;
      }
      if (mark.kind === 'harmony') {
        const { root, bass, quality } = mark;
        result.harmony = NotationSpelling.transposeChord({ root, quality, bass }, interval?.semitones ?? 0, interval?.steps ?? 0);
        result.chord = { text: NotationSpelling.chordText(result.harmony), range: locate(mark.range) };
      }
      if (mark.kind === 'dynamic') result.dynamic = mark.value;
      if ((mark.kind === 'ossia' || mark.kind === 'ornament' || mark.kind === 'grace') && (!heads.length || (!state.notation && mark.kind !== 'grace') || heads.some(h => !!h.drum)))
        throw new ScoreError('measure', 'Grace notes, ornaments and ossias need a pitched notation anchor', locate(mark.range));
      if (mark.kind === 'ornament') result.ornament = mark.value;
      if (mark.kind === 'onStaff' || mark.kind === 'sharedStem') {
        if (!state.piano || (mark.kind === 'sharedStem' && !heads.length))
          throw new ScoreError('measure', 'Staff assignments need piano and a shared stem needs pitched notes', locate(mark.range));
        if (mark.kind === 'onStaff') result.displayHand = mark.hand === 'upper' ? 'right' : 'left';
        else result.sharedStem = mark.name;
      }
      if (mark.kind === 'grace') result.grace = projectGrace(mark, interval);
      if (mark.kind === 'ossia') result.ossia = { duration: mark.duration,
        notes: mark.notes.map(n => ({ key: projectHead({ pitch: n.pitch, range: mark.range, marks: [] }, interval).written, ornament: n.ornament })) };
      if (mark.kind === 'symbol') result.chord = { text: interval ? transposeChord(mark.text, interval) : mark.text, color: mark.ink && ink(mark.ink, locate(mark.range)), range: locate(mark.range) };
      if (mark.kind === 'line') {
        if (event.kind !== 'rest') throw new ScoreError('measure', 'Only a rest takes a staff line', locate(mark.range));
        result.restLine = mark.value;
      }
      if (mark.kind === 'ink') result.color = ink(mark.value, locate(mark.range));
      if (mark.kind === 'label') {
        const style = mark.style;
        (result.labels ??= []).push({ text: mark.text, ...style, range: locate(mark.range), ink: style.ink && ink(style.ink, locate(mark.range)) });
      }
      if (mark.kind === 'tap' || mark.kind === 'vibrato' || 'direction' in mark) (result.gestures ??= []).push(mark);
      if (mark.kind === 'accent') {
        if (!heads.length) throw new ScoreError('measure', 'Accent needs a head', locate(mark.range));
        (heads[0].marks ??= []).push({ position: 'above' });
      }
    }
    const diagram = event.marks.find(m => m.kind === 'frame');
    if (diagram?.kind === 'frame') {
      const delta = interval?.semitones ?? 0;
      const frets = diagram.frets.map(fret => fret === 'x' ? fret : fret + delta);
      const barre = diagram.barre;
      const detail = barre && barre[0] + delta !== 0 ? ' barre=' + (barre[0] + delta) + ':' + barre[1] + '-' + barre[2] : '';
      const range = locate(diagram.range);
      result.frame = { range, spec: frame(frets.join(',') + detail, result, state, range) };
    }
    return result;
  }

  type Endpoint = { event: Attack; index: number; bar: number; hand?: string; range: SourceRange };
  const starts = new Map<string, Endpoint>(), ends = new Map<string, Endpoint>();

  /** Labels connect nonadjacent heads by name even when the destination voice is written first. */
  function connectNamedTies() {
    for (const name of new Set([...starts.keys(), ...ends.keys()])) {
      const start = starts.get(name), end = ends.get(name);
      if (!start || !end) throw new ScoreError('measure', 'Unpaired tie ' + name, (start ?? end).range);
      const first = start.event.heads[start.index], last = end.event.heads[end.index];
      const later = start.bar < end.bar || (start.bar === end.bar &&
        new Fraction().parse(start.event.onset).lessThan(new Fraction().parse(end.event.onset)));
      if (!later || first.sounding === null || first.written !== last.written || first.sounding !== last.sounding ||
        first.position?.str !== last.position?.str || start.hand !== end.hand)
        throw new ScoreError('measure', 'Named tie needs a later matching head on the same staff', end.range);
      projected.ties.push({ id: 'named-tie-' + name, from: start.event.id, fromHead: start.index, to: end.event.id, toHead: end.index, range: end.range });
    }
  }

  /** Build one measure voice at a time. Ties follow the preceding attack of this voice. */
  function addVoice(voice: ScoreVoice, staffSounds: number, hand: 'right' | 'left' | undefined, track: import('./model').StaffChange[] = []) {
    const voices: MeasureVoice[] = [];
    const engraving = { ...part, ...voice.settings };
    let changeIndex = 0, activeClef: string = hand === 'left' ? 'bass' : part.clef ?? 'treble';
    let changes: import('./model').StaffChange[] = [], inBar = 0;
    // Written settings persist across bars. Each voice traverses the same ordered track once.
    function apply(change: import('./model').StaffChange) {
      if (change.key) {
        writtenKey = change.key;
        manager = new KeyManager(writtenKey);
        state.key = intervalFor(score.transpose)?.target ?? writtenKey;
      }
      if (change.clef) activeClef = change.clef;
      if (change.sounds !== undefined) staffSounds = change.sounds;
    }
    let previous: Attack | undefined;
    let depressed: Attack | undefined;
    function voiceAttack(event: ScoreEvent) {
      while (inBar < changes.length && !new Fraction().parse(changes[inBar].at).greaterThan(new Fraction().parse(event.at)))
        apply(changes[inBar++]);
      const next = attack(event, staffSounds);
      if (track.length) { next.writtenClef = activeClef; next.activeKey = state.key; }
      for (const mark of event.marks) {
        if (mark.kind !== 'pedal') continue;
        const range = locate(mark.range);
        if (!state.piano || event.kind === 'skip') throw new ScoreError('measure', 'Place pedal marks on piano notes or rests', range);
        if (mark.action === 'down') {
          if (depressed) throw new ScoreError('measure', 'Lift the pedal before pressing again', range);
          depressed = next;
        } else {
          if (!depressed) throw new ScoreError('measure', 'Pedal up needs an earlier pedal down in this voice', range);
          projected.spans.push({ kind: 'pedal', ...(mark.onset && { onset: true }), from: depressed.id, to: next.id, id: 'pedal-' + depressed.id, range });
          depressed = undefined;
        }
      }
      const used = new Set<number>();
      event.heads.forEach((head, i) => {
        for (const mark of head.marks) {
          if (mark.kind !== 'tieStart' && mark.kind !== 'tieEnd') continue;
          const points = mark.kind === 'tieStart' ? starts : ends;
          if (points.has(mark.name)) throw new ScoreError('measure', 'Duplicate tie endpoint ' + mark.name, locate(mark.range));
          points.set(mark.name, { event: next, index: i, bar: event.bar, hand, range: locate(mark.range) });
        }
        const gliss = next.heads[i].glissFrom;
        if (gliss !== undefined) {
          if (!previous?.heads[gliss]) throw new ScoreError('measure', 'Missing previous glissando head', next.heads[i].range);
          projected.spans.push({ kind: 'glissando', id: 'gliss-' + next.id + '-' + i,
            from: previous.id, fromHead: gliss, to: next.id, toHead: i, range: next.heads[i].range });
        }
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
    writtenKey = part.key ?? 'C';
    manager = new KeyManager(writtenKey);
    state.key = intervalFor(score.transpose)?.target ?? writtenKey;
    state.tuning = tuningName;
    tuning = new Tuning(tuningName);
    state.color = part.ink === 'default' ? undefined : part.ink;
    let displayMeter = part.displayMeter;
    for (const bar of voice.measures) {
      if (part.keys?.[bar.number]) {
        writtenKey = part.keys[bar.number];
        manager = new KeyManager(writtenKey);
        state.key = intervalFor(score.transpose)?.target ?? writtenKey;
      }
      const range = locate(bar.barlineRange);
      const change = part.changes?.[bar.number];
      if (change?.tuning) {
        const strings = (Tuning.names[change.tuning] ?? change.tuning).split(',').length;
        if (strings !== state.strings) throw new ScoreError('measure', 'A tuning change must keep the same string count', range);
        state.tuning = change.tuning;
        tuning = new Tuning(change.tuning);
      }
      if (change?.ink) state.color = change.ink === 'default' ? undefined : ink(change.ink, range);
      if (change?.displayMeter !== undefined) displayMeter = change.displayMeter;
      const span = bar.span ?? (bar.number === 1 && score.pickup ? score.pickup : fullBar);
      const meter = bar.meter ?? initialMeter;
      changes = []; inBar = 0;
      while (changeIndex < track.length && track[changeIndex].bar === bar.number) {
        const at = track[changeIndex++];
        if (at.at === '0/1') apply(at);
        else changes.push(at);
      }
      const displayed = score.transpose ? changes.map(change => change.key
        ? { ...change, key: new Interval(score.transpose, change.key).target } : change) : changes;
      const openingState = { key: state.key, clef: activeClef, changes: displayed };
      const value: MeasureVoice = { declaration: locate(voice.range), hand, span, events: voice.events.slice(bar.start, bar.end).map(voiceAttack),
        tuplets: [], stem: engraving.stem, beams: engraving.beam ?? true, beamRests: engraving.beamRests ?? true, beatGroups: engraving.beatGroups, stemlets: engraving.stemlets ?? false, middleRests: engraving.middleRests ?? false, tabStems: engraving.tabStems ?? false,
        rehearsal: bar.rehearsal, opening: bar.opening ? { type: bar.opening, range } : undefined, closing: bar.closing ? { type: bar.closing, range } : undefined, tabDirection: engraving.tabDirection === 'down' ? -1 : 1
      };
      const prior = measures[bar.number - 2]?.state;
      const changedMeter = prior?.meter !== meter || prior?.meterSign !== bar.meterSign;
      const m = measures[bar.number - 1] ??= {
        number: bar.number, range, state: { ...state, key: openingState.key, fragment: !!bar.fragment, meter, meterSign: bar.meterSign, timeRange: bar.meterRange ? locate(bar.meterRange) : state.timeRange, showTime: displayMeter !== false && (bar.number === 1 ? displayMeter || state.showTime : changedMeter || change?.displayMeter === true) },
        span, newRow: !!bar.newRow, voices: []
      };
      if (track.length) (m.staffState ??= {})[hand ?? 'notation'] = openingState;
      while (inBar < changes.length) apply(changes[inBar++]);
      m.newRow ||= !!bar.newRow;
      const first = m.voices[0];
      if (first) {
        if ((value.rehearsal && first.rehearsal && value.rehearsal !== first.rehearsal) ||
          (value.opening && first.opening && value.opening.type !== first.opening.type) ||
          (value.closing && first.closing && value.closing.type !== first.closing.type))
          throw new ScoreError('measure', 'Voices disagree about a shared bar boundary', range);
        first.rehearsal ??= value.rehearsal;
        first.opening ??= value.opening;
        first.closing ??= value.closing;
      }
      m.voices.push(value);
      voices.push(value);
    }
    if (depressed) throw new ScoreError('measure', 'Missing pedal up', depressed.range);
    resolveVerseLinks(voices, projected.spans);
    addEndings(voice);
    addSpans(voice, voices);
  }

  /** Endings describe shared bar boundaries even when only one voice declares the repeat. */
  function addEndings(voice: ScoreVoice) {
    for (const repeat of voice.repeats ?? []) {
      if (!projected.repeats?.some(r => r.first === repeat.first && r.bodyEnd === repeat.bodyEnd &&
        r.endings.length === repeat.endings.length && r.endings.every((e, i) => e.last === repeat.endings[i].last))) (projected.repeats ??= []).push(repeat);
      const range = locate(repeat.range);
      if (measures.slice(repeat.first - 1, repeat.endings[repeat.endings.length - 1].last).some(m => !m.voices[0].events.length))
        throw new ScoreError('measure', 'An ending needs sounding or resting measures', range);
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
      if (mark.kind === 'continuousBeam' || mark.kind === 'crescendo' || mark.kind === 'diminuendo' || mark.kind === 'tremolo') {
        if (!state.notation) throw new ScoreError('measure', 'This expression span needs a notation staff', range);
        projected.spans.push({ kind: mark.kind, from: mark.first, to: mark.last, niente: mark.niente, strokes: mark.strokes, range, id: mark.kind + '-' + mark.first + (mark.name ? '-' + mark.name : '') });
        if (mark.kind === 'tremolo' || mark.kind === 'continuousBeam') {
          for (const v of voices) for (const event of v.events) if (indices.get(event.id) >= indices.get(mark.first) && indices.get(event.id) <= indices.get(mark.last)) {
            if (mark.kind === 'tremolo') event.tremolo = mark.strokes;
            else event.continuousBeam = true;
          }
        }
      } else if (mark.kind === 'slur' || mark.kind === 'palmMute') {
        if (mark.kind === 'palmMute' && mark.strings.some(n => n > state.strings))
          throw new ScoreError('measure', 'Mute outside the instrument tuning', range);
        projected.spans.push({ kind: mark.kind, from: mark.first, to: mark.last, side: mark.side, strings: mark.strings, range, id: mark.kind + '-' + mark.first + (mark.name ? '-' + mark.name : '') });
      } else if (mark.kind === 'beam' || mark.kind === 'feather') {
        const first = indices.get(mark.first), last = indices.get(mark.last);
        const bar = voice.measures[voice.events[first].bar - 1];
        (voices[bar.number - 1].beamGroups ??= []).push({ start: first - bar.start, end: last - bar.start, feather: mark.kind === 'feather' ? mark.feather : undefined, range });
      } else if ('to' in mark) {
        projected.spans.push({
          kind: mark.kind, id: mark.kind + '-' + mark.to.event + '-' + mark.to.head, range,
          from: mark.from.event, to: mark.to.event, fromHead: mark.from.head, toHead: mark.to.head });
      } else if (mark.kind === 'tuplet') {
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
    addVoice(voice, staff.sounds ?? part.sounds, staff.name === 'upper' ? 'right' : staff.name === 'lower' ? 'left' : undefined, staff.staffChanges);
  }
  connectNamedTies();
  const attacks = new Map(measures.flatMap(m => m.voices.flatMap(v => v.events.map(e => [e.id, e] as const))));
  for (const tie of projected.ties) {
    const from = attacks.get(tie.from).heads[tie.fromHead], to = attacks.get(tie.to).heads[tie.toHead];
    if (!to.release) continue;
    if (!from.bend || from.bend.release || !to.position || from.position.str !== to.position.str)
      throw new ScoreError('measure', 'A tied release needs a bent source on the same string', to.range);
    from.tiedBendStart = true;
    tie.bend = { semitones: from.bend.semitones, rise: from.bend.rise, hold: to.release.hold, release: to.release.release };
    tie.string = to.position.str;
  }
  for (const event of attacks.values()) for (const [i, head] of event.heads.entries())
    if (head.release && !projected.ties.some(t => t.to === event.id && t.toHead === i && t.bend))
      throw new ScoreError('measure', 'A release needs a tied continuation', head.range);
  resolveMarks(measures, projected.spans);
  for (const [i, lane] of (part.text ?? []).entries()) {
    const style = { line: -i * 2, ...lane.style };
    if (style.ink) ink(style.ink, locate(lane.voice.range));
    for (const bar of lane.voice.measures) {
      const measure = measures[bar.number - 1];
      const cells: import('../model').MeasuredText[] = lane.voice.events.slice(bar.start, bar.end).map(e => {
        const mark = e.marks.find(m => m.kind === 'text');
        return { id: e.id, range: locate(e.range), ...writtenRhythm(e.writtenDuration), text: mark?.text ?? '', glyph: mark?.glyph, style: { ...style, ...mark?.style } };
      });
      for (const boundary of lane.voice.boundaries ?? []) {
        if (boundary.bar !== bar.number) continue;
        const cell = boundary.edge === 'start' ? cells[0] : cells[cells.length - 1];
        if (!cell) throw new ScoreError('measure', 'A text boundary needs a timed anchor', locate(boundary.range));
        (cell.boundaries ??= []).push({ ...boundary, range: locate(boundary.range) });
      }
      for (const cell of cells) if (cell.style.ink) ink(cell.style.ink, cell.range);
      (measure.text ??= []).push(cells);
    }
  }
  parts.set(index, projected);
  return projected;
}
