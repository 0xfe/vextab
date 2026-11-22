// Translate parsed scores and legacy fixed rows into sounding notes on one timeline.
import type { createPerformer, PerformanceBar } from './performer';
import { measureVisits } from './visits';
import { decorateAttack } from './decorations';
import { KeyManager, VexFlow } from 'vexflow';
import { midiPitch } from '../score/music';
import type { SourceRange } from '../score/source';
import type Artist from '../artist';
import type { Attack, Head, Measure, ParsedScore } from '../score/model';
import type { Performance, PlaybackEvent, PlaybackNote } from './transport';

/** A single picked string owns its pitch envelope, including the release of a pre-bend. */
function soundingNote(key: string, duration: number, release?: number): PlaybackNote | undefined {
  const pitch = midiPitch(key);
  if (pitch === undefined) return;
  const note: PlaybackNote = { pitch, duration, velocity: 100 };
  if (release) note.bend = [{ time: duration, semitones: -release }];
  return note;
}

function seconds(value: string, whole: number) {
  const [n, d] = value.split('/').map(Number);
  return n / d * whole;
}

/** Map a measured bend's phase ends to seconds relative to this attack. */
function scoreNote(event: Attack, head: Head, duration: number) {
  if (head.midi !== undefined && !event.silent) return { pitch: head.midi, duration, velocity: 100 } as PlaybackNote;
  if (!head.sounding || event.silent) return;
  const note = soundingNote(head.sounding, duration, head.prebend?.release && head.prebend.semitones);
  const spec = head.bend ?? event.bend?.spec;
  if (!note || !spec || spec.string !== head.position?.str) return note;
  const time = (fraction: readonly number[]) => duration * fraction[0] / fraction[1];
  const points = [{ time: time(spec.rise), semitones: spec.semitones }];
  if (spec.hold) points.push({ time: time(spec.hold), semitones: spec.semitones });
  if (spec.release) points.push({ time: time(spec.release), semitones: 0 });
  note.bend = points;
  return note;
}

/** Resolve tempo and attack velocities on the written clock so a repeat restores its own expression. */
function expression(score: ParsedScore, tempo: number, expressive: boolean) {
  const tempi: number[] = [];
  const velocities = new Map<string, number>();
  type Position = { id: string; time: number; explicit: boolean; index: number; voice: number };
  const positions = new Map<string, Position>();
  const lanes: Position[][] = [];
  const levels = { ppp: 28, pp: 40, p: 52, mp: 66, mf: 82, f: 98, ff: 112, fff: 124 };
  // With dynamics written for both piano hands, the performer voices each independently.
  // A dynamic written for only one staff still sets the level of the whole instrument.
  const markedHands = new Set(expressive && score.measures[0]?.state.piano
    ? score.measures.flatMap(m => m.voices.filter(v => v.hand && v.events.some(e => e.dynamic)).map(v => v.hand)) : []);
  const handLevels = new Map<string, number>();
  let bpm = tempo, velocity = 100, time = 0;
  for (const m of score.measures) {
    const change = score.playback?.tempos?.[m.number];
    if (change) bpm = change * tempo / (score.playback.tempo ?? 120);
    tempi.push(bpm);
    const byTime = m.voices.flatMap((voice, index) => voice.events.map(attack => ({
      attack, voice: index, onset: seconds(attack.onset, 1),
    }))).sort((a, b) => a.onset - b.onset || Number(!!b.attack.dynamic) - Number(!!a.attack.dynamic));
    for (const { attack, voice, onset } of byTime) {
      const hand = m.voices[voice].hand;
      if (markedHands.size === 2 && hand) {
        if (attack.dynamic) handLevels.set(hand, levels[attack.dynamic]);
        velocities.set(attack.id, handLevels.get(hand) ?? velocity);
      } else {
        if (attack.dynamic) velocity = levels[attack.dynamic];
        velocities.set(attack.id, velocity);
      }
      const lane = lanes[voice] ??= [];
      const point = { id: attack.id, time: time + onset, voice, explicit: !!attack.dynamic, index: lane.length };
      positions.set(attack.id, point);
      lane.push(point);
    }
    time += seconds(m.span, 1);
  }
  for (const span of score.spans ?? []) {
    if (span.kind !== 'crescendo' && span.kind !== 'diminuendo') continue;
    const first = positions.get(span.from), last = positions.get(span.to);
    if (!first || !last || last.time <= first.time) continue;
    const rising = span.kind === 'crescendo';
    const start = rising && span.niente ? 1 : velocities.get(span.from);
    const end = !rising && span.niente ? 1 : last.explicit ? velocities.get(span.to) : Math.min(127, Math.max(1, start + (rising ? 24 : -24)));
    for (let i = first.index; i <= last.index; i++) {
      const point = lanes[first.voice][i];
      velocities.set(point.id, Math.round(start + (end - start) * (point.time - first.time) / (last.time - first.time)));
    }
  }
  return { tempi, velocities };
}

/** Dampers affect both hands. Repeated strikes of the same key still get their own attack. */
function sustainNotes(events: PlaybackEvent[], windows: { start: number; end: number }[], expressive: boolean) {
  if (!windows.length) return;
  windows.sort((a, b) => a.start - b.start);
  const ranges: typeof windows = [];
  for (const window of windows) {
    const last = ranges[ranges.length - 1];
    if (last && window.start < last.end) last.end = Math.max(last.end, window.end);
    else ranges.push(window);
  }
  const nextStrike = new Map<number, number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    for (const note of event.notes) {
      const release = event.time + note.duration;
      let low = 0, high = ranges.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (ranges[mid].end <= release) low = mid + 1;
        else high = mid;
      }
      const pedal = ranges[low];
      // A finger may lift early, but the damper still determines the audible note-off.
      if (expressive && (pedal?.start < release || ranges[low - 1]?.end === release)) note.holdRelease = true;
      if (pedal && pedal.start < release) {
        const end = Math.min(pedal.end, nextStrike.get(note.pitch) ?? Infinity);
        note.duration = Math.max(note.duration, end - event.time);
      }
      nextStrike.set(note.pitch, event.time);
    }
  }
}

/** Translate meter, pickup and phrasing marks to seconds on this performed visit. */
function performanceBar(measure: Measure, whole: number, slurEnds: Set<string>): PerformanceBar {
  const duration = seconds(measure.span, whole), quarter = whole / 4;
  const [count, unit] = measure.state.meter.split('/').map(Number);
  // A fractional pickup ends on the downbeat even if it starts halfway through a beat.
  const missing = Math.max(0, count / unit * whole - duration) / quarter;
  const beatOffset = Math.abs(missing - Math.round(missing)) > 1e-8 ? (missing % 1) * quarter : 0;
  const fermatas: number[] = [];
  let phraseEnd = false;
  for (const voice of measure.voices) {
    for (const attack of voice.events) {
      const release = seconds(attack.onset, whole) + seconds(attack.duration, whole);
      if (attack.heads.some(h => h.marks?.some(m => m.articulation?.startsWith('a@')))) fermatas.push(release);
      if (release >= duration - 1e-8 && slurEnds.has(attack.id)) phraseEnd = true;
    }
  }
  return { duration, quarter, beatOffset, swingable: unit === 2 || unit === 4, fermatas, phraseEnd: phraseEnd || !!fermatas.length };
}

/** Conduct from the lead meter. A held beat in another part also holds the ensemble.
 * Overlapping compound meters keep their written divisions, including at independent barlines. */
export function ensembleBars(tracks: PerformanceBar[][]): PerformanceBar[] {
  const grid = tracks[0] ?? [];
  for (const track of tracks.slice(1)) {
    let first = 0, gridStart = 0, partStart = 0;
    for (const measure of track) {
      let i = first, start = gridStart;
      const partEnd = partStart + measure.duration;
      while (i < grid.length && start < partEnd - 1e-9) {
        const bar = grid[i], end = start + bar.duration;
        if (measure.swingable === false) bar.swingable = false;
        if (measure.phraseEnd && Math.abs(partEnd - end) < 1e-8) bar.phraseEnd = true;
        for (const at of measure.fermatas ?? []) {
          const t = partStart + at;
          if (t > start + 1e-9 && t <= end + 1e-9) bar.fermatas = [...(bar.fermatas ?? []), t - start];
        }
        if (end > partEnd + 1e-9) break;
        start = end;
        i++;
      }
      first = i;
      gridStart = start;
      partStart = partEnd;
    }
  }
  return grid;
}

/** Traverse the chosen written measures, carrying sounding heads through adjacent ties. */
export function scorePerformance(score: ParsedScore, tempo: number, mark?: (id: string) => void, visits = measureVisits(score, false),
  take?: ReturnType<typeof createPerformer>, bars?: PerformanceBar[]): Performance {
  const events: PlaybackEvent[] = [];
  const prior = new Map(score.ties.map(tie => [tie.to + ':' + tie.toHead, tie]));
  const sounding = new Map<string, { note: PlaybackNote; start: number }>();
  const expressive = !!take && !take.literal;
  const { tempi, velocities } = expression(score, tempo, expressive);
  const slurEnds = new Set((score.spans ?? []).filter(s => s.kind === 'slur').map(s => s.to));
  const tremolos = new Map((score.spans ?? []).filter(span => span.kind === 'tremolo').map(span => [span.from, span]));
  const glissandi = new Map((score.spans ?? []).flatMap(span => span.kind === 'glissando' ? [[span.to + ':' + span.toHead, span] as const] : []));
  const decorations = new Map<string, { attack: Attack; key: KeyManager }>();
  const keys = new Map<string, KeyManager>();
  const pedals = (score.spans ?? []).filter(s => s.kind === 'pedal');
  const downs = new Map(pedals.map(s => [s.from, s.to]));
  const held = new Map<string, number>();
  const windows: { start: number; end: number }[] = [];
  // A repeat jump or a partial playback selection releases any unfinished pedal.
  function liftAll(end: number) {
    for (const start of held.values()) windows.push({ start, end });
    held.clear();
  }
  let previousBar = 0;
  let bar = 0;
  for (const number of visits) {
    const measure = score.measures[number - 1];
    if (number !== previousBar + 1) { sounding.clear(); liftAll(bar); }
    previousBar = number;
    const whole = 240 / tempi[number - 1];
    // Process by onset so an earlier attack in a later-written voice can start a named tie.
    const attacks = measure.voices.flatMap(v => v.events).map(attack => ({ attack, time: bar + seconds(attack.onset, whole) }));
    attacks.sort((a, b) => a.time - b.time);
    if (bars && seconds(measure.span, whole) > 0) bars.push(performanceBar(measure, whole, slurEnds));
    const inBar = new Map<string, PlaybackEvent>();
    for (const { attack, time } of attacks) {
      const duration = seconds(attack.duration, whole);
      if (downs.has(attack.id)) held.set(downs.get(attack.id), time);
      if (held.has(attack.id)) {
        windows.push({ start: held.get(attack.id), end: time + duration });
        held.delete(attack.id);
      }
      const notes: PlaybackNote[] = [];
      if (attack.grace || attack.ornament) {
        const key = measure.state.key ?? 'C';
        if (!keys.has(key)) keys.set(key, new KeyManager(key));
        decorations.set(attack.id, { attack, key: keys.get(key) });
      }
      attack.heads.forEach((head, i) => {
        const id = attack.id + ':' + i;
        const tie = prior.get(id);
        const tied = tie && sounding.get(tie.from + ':' + tie.fromHead);
        if (tied) {
          if (expressive) tied.note.holdRelease = true;
          tied.note.duration = Math.max(tied.note.duration, time + duration - tied.start);
          if (tie.bend) {
            const { semitones, hold, release } = tie.bend;
            tied.note.bend = [...(tied.note.bend ?? []),
              { time: time - tied.start + duration * hold[0] / hold[1], semitones },
              { time: time - tied.start + duration * release[0] / release[1], semitones: 0 }];
          }
          sounding.set(id, tied);
        } else {
          const note = scoreNote(attack, head, duration);
          if (note) {
            const gliss = glissandi.get(id);
            const source = gliss && sounding.get(gliss.from + ':' + gliss.fromHead);
            if (source) source.note.bend = [...(source.note.bend ?? []),
              { time: time - source.start, semitones: note.pitch - source.note.pitch }];
            note.velocity = velocities.get(attack.id);
            if (expressive && head.marks) {
              if (head.marks.some(m => m.articulation === 'a>' || (!m.articulation && !m.finger && !m.stringNumber)))
                note.velocity = Math.min(127, note.velocity + 10);
              if (!note.bend && !attack.grace && !attack.ornament && head.marks.some(m => m.articulation === 'a.'))
                note.duration *= .58;
            }
            if (score.program !== undefined) note.program = score.program;
            notes.push(note); sounding.set(id, { note, start: time });
          }
        }
      });
      inBar.set(attack.id, { time, duration, source: attack.id, notes, mark: mark && (() => mark(attack.id)) });
    }
    for (const [id, first] of inBar) {
      const span = tremolos.get(id);
      if (span?.kind !== 'tremolo') { events.push(first); continue; }
      const last = inBar.get(span.to);
      const length = first.duration + last.duration, pulse = whole / 2 ** (2 + span.strokes);
      // Alternate source IDs so the cursor returns to the correct written head on every pulse.
      for (let i = 0; i * pulse < length - 1e-9; i++) {
        const event = i % 2 ? last : first, duration = Math.min(pulse, length - i * pulse);
        events.push({ ...event, time: first.time + i * pulse, duration, notes: event.notes.map(n => ({ ...n, duration })) });
      }
      inBar.delete(span.to);
    }
    bar += seconds(measure.span, whole);
  }
  const sounded = decorations.size ? events.flatMap(event => {
    const word = decorations.get(String(event.source));
    if (!word) return [event];
    const grace = word.attack.grace;
    const share = grace && take?.graceFraction(event.time, event.duration, grace.pitches.length, grace.slash);
    return decorateAttack(event, word.attack, word.key, share);
  }) : events;
  sounded.sort((a,b) => a.time - b.time);
  liftAll(bar);
  sustainNotes(sounded, windows, expressive);
  return { events: sounded, duration: bar };
}

/** Fixed scores may contain fragments and text voices outside the shared parser's grammar. */
export function artistPerformance(artist: Artist, tempo: number): Performance {
  const events: PlaybackEvent[] = [];
  const tickSeconds = 240 / (tempo * VexFlow.RESOLUTION);
  const sounding = new Map<object, Map<number, PlaybackNote>>();
  let row = 0;
  for (const voices of artist.getPlayerData().voices) {
    let span = 0;
    for (const voice of voices) {
      let tick = 0;
      for (const glyph of voice.getTickables()) {
        if (glyph.shouldIgnoreTicks()) continue;
        const length = glyph.getTicks().value();
        const duration = length * tickSeconds;
        const notes: PlaybackNote[] = [];
        if (!glyph.isRest()) {
          const heads = fixedHeads.get(glyph) ?? (glyph.getPlayNote?.() ?? []).map((key: string) => ({ key }));
          const byHead = new Map<number, PlaybackNote>();
          heads.forEach((head: FixedHead, i: number) => {
            const note = soundingNote(head.key, duration, head.release);
            if (!note) return;
            const tie = fixedTies.get(glyph)?.get(i);
            const previous = tie && sounding.get(tie.glyph)?.get(tie.index);
            if (previous && previous.pitch === note.pitch) {
              previous.duration += duration;
              byHead.set(i, previous);
            } else {
              notes.push(note);
              byHead.set(i, note);
            }
          });
          sounding.set(glyph, byHead);
        }
        events.push({ time: (row + tick) * tickSeconds, duration, source: glyph, notes });
        tick += length;
      }
      span = Math.max(span, tick);
    }
    row += span;
  }
  return { events: events.sort((a, b) => a.time - b.time), duration: row * tickSeconds };
}

/** Keep legacy VexFlow getPlayNote() values intact while recording the physical sounding octave. */
interface FixedHead { key: string; release?: number; inherit?: { written: string; range: SourceRange } }
export const fixedHeads = new WeakMap<object, FixedHead[]>();

/** Each tied destination head remembers its source even when the chord is reordered. */
const fixedTies = new WeakMap<object, Map<number, { glyph: object; index: number }>>();
/** An implicit continuation can inherit a source accidental across the barline. */
export function tiedFixedHead(glyph: object, index: number): FixedHead | undefined {
  const tie = fixedTies.get(glyph)?.get(index);
  return tie && fixedHeads.get(tie.glyph)?.[tie.index];
}

export function recordFixedTie(from: object, to: object, first: number[], last: number[]): void {
  if (!from || !to) return;
  const ties = fixedTies.get(to) ?? new Map();
  last.forEach((index, i) => ties.set(index, { glyph: from, index: first[i] }));
  fixedTies.set(to, ties);
}
