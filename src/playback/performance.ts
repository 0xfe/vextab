// Translate parsed scores and legacy fixed rows into sounding notes on one timeline.
import { VexFlow } from 'vexflow';
import { midiPitch } from '../score/music';
import type { SourceRange } from '../score/source';
import type Artist from '../artist';
import type { Attack, Head, ParsedScore } from '../score/model';
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
  if (!head.sounding || event.silent) return;
  const note = soundingNote(head.sounding, duration, head.prebend?.release && head.prebend.semitones);
  const spec = event.bend?.spec;
  if (!note || !spec || spec.string !== head.position?.str) return note;
  const time = (fraction: readonly number[]) => duration * fraction[0] / fraction[1];
  const points = [{ time: time(spec.rise), semitones: spec.semitones }];
  if (spec.hold) points.push({ time: time(spec.hold), semitones: spec.semitones });
  if (spec.release) points.push({ time: time(spec.release), semitones: 0 });
  note.bend = points;
  return note;
}

/** Traverse written measures once, carrying sounding heads through ties across voices and bars. */
export function scorePerformance(score: ParsedScore, tempo: number, mark?: (id: string) => void): Performance {
  const events: PlaybackEvent[] = [];
  const prior = new Map(score.ties.map(tie => [tie.to + ':' + tie.toHead, tie.from + ':' + tie.fromHead]));
  const sounding = new Map<string, PlaybackNote>();
  const whole = 240 / tempo;
  let bar = 0;
  for (const measure of score.measures) {
    for (const voice of measure.voices) for (const attack of voice.events) {
      const time = bar + seconds(attack.onset, whole);
      const duration = seconds(attack.duration, whole);
      const notes: PlaybackNote[] = [];
      attack.heads.forEach((head, i) => {
        const id = attack.id + ':' + i;
        const tied = sounding.get(prior.get(id));
        if (tied) {
          tied.duration += duration;
          sounding.set(id, tied);
        } else {
          const note = scoreNote(attack, head, duration);
          if (note) { notes.push(note); sounding.set(id, note); }
        }
      });
      events.push({ time, notes, mark: () => mark?.(attack.id) });
    }
    bar += seconds(measure.span, whole);
  }
  return { events: events.sort((a, b) => a.time - b.time), duration: bar };
}

/** Fixed scores may contain fragments and text voices outside the shared parser's grammar. */
export function artistPerformance(artist: Artist, tempo: number, mark: (note: any) => void): Performance {
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
        events.push({ time: (row + tick) * tickSeconds, notes, mark: () => mark(glyph) });
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
