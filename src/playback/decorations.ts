// Realize unmeasured grace groups and ornaments within the principal attack's written time.
import { KeyManager } from 'vexflow';
import type { Attack } from '../score/model';
import { midiPitch } from '../score/music';
import type { PlaybackEvent } from './transport';

/** Diatonic neighbors follow the written key and the part's sounding transposition. */
function neighbor(written: string, sounding: number, direction: number, key: KeyManager): number {
  const letters = 'cdefgab';
  const [name, octave] = written.split('/');
  const index = letters.indexOf(name[0]) + direction;
  const next = key.getAccidental(letters[(index + 7) % 7]).note;
  const pitch = midiPitch(next + '/' + (Number(octave) + Math.floor(index / 7)));
  return pitch === undefined ? sounding : Math.max(0, Math.min(127, pitch + sounding - midiPitch(written)));
}

/** Keep the original event ID on every subdivision so playback follows the written note. */
export function decorateAttack(event: PlaybackEvent, attack: Attack, key: KeyManager, graceFraction = .25): PlaybackEvent[] {
  if (!event.notes.length) return [event];
  const principal = event.notes[0];
  const head = attack.heads.find(h => h.sounding && midiPitch(h.sounding) === principal.pitch);
  if (!head) return [event];
  const out: PlaybackEvent[] = [];
  let start = event.time, length = event.duration;
  function play(pitches: (number | number[])[], at: number, duration: number) {
    const step = duration / pitches.length;
    pitches.forEach((pitch, i) => out.push({ ...event, time: at + i * step, duration: step,
      notes: (Array.isArray(pitch) ? pitch : [pitch]).map(key => ({ pitch: key, duration: step, velocity: principal.velocity, ...(principal.fixedVelocity && { fixedVelocity: true as const }), program: principal.program })) }));
  }
  if (attack.grace) {
    const shift = principal.pitch - midiPitch(head.written);
    const pitches = attack.grace.pitches.map(step => (Array.isArray(step) ? step : [step])
      .map(pitch => midiPitch(pitch) + shift).filter(p => p >= 0 && p <= 127)).filter(step => step.length);
    if (pitches.length) {
      const before = attack.grace.side === 'before';
      // An unmeasured group can borrow less when a chord member releases early.
      const available = before && !attack.grace.steal ? Math.min(length, ...event.notes.map(note => note.duration)) : length;
      const duration = available * graceFraction;
      const graceOnset = before ? start : start + length - duration;
      play(pitches, graceOnset, duration);
      length -= duration;
      if (before) start += duration;
      for (const note of event.notes) {
        // A shorter chord member may already have released before an after-grace begins.
        if (before) note.duration = Math.max(0, note.duration - duration);
        else note.duration -= Math.min(duration, Math.max(0, note.duration - (graceOnset - event.time)));
      }
    }
  }
  if (attack.ornament) {
    const up = neighbor(head.written, principal.pitch, 1, key);
    const down = neighbor(head.written, principal.pitch, -1, key);
    const main = principal.pitch;
    const patterns = { tr: [main, up, main, up], mordent: [main, up], mordent_inverted: [main, down],
      turn: [up, main, down], turn_inverted: [down, main, up] };
    const figure: number[] = patterns[attack.ornament];
    const window = Math.min(length, principal.duration) / 2;
    play(figure, start, window);
    // Other chord heads sustain beneath the ornament on its principal head.
    if (event.notes.length > 1) out.push({ ...event, time: start, duration: length, notes: event.notes.slice(1) });
    principal.duration = Math.max(0, principal.duration - window);
    out.push({ ...event, time: start + window, duration: length - window, notes: [principal] });
  } else out.push({ ...event, time: start, duration: length });
  return out;
}
