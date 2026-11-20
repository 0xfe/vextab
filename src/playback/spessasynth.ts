// Adapter for a host-owned SpessaSynth synthesizer and SoundFont. No runtime import.
import type { PlaybackNote, PlaybackPlugin, PlaybackSession, PitchPoint } from './transport';

/** Structural subset of WorkletSynthesizer. The caller loads its worklet and sound bank. */
export interface SpessaSynthHost {
  readonly context: BaseAudioContext;
  readonly isReady: Promise<unknown>;
  programChange(channel: number, program: number): void;
  noteOn(channel: number, pitch: number, velocity: number): void;
  noteOff(channel: number, pitch: number): void;
  pitchWheelRange(channel: number, semitones: number): void;
  pitchWheel(channel: number, value: number): void;
}

/** A bent voice owns a channel until its pitch wheel has returned to centre. */
interface SoundingVoice { channel: number; note: PlaybackNote; start: number; range: number }

/** Interpolate relative semitones on a single sounding string. */
function pitchAt(points: readonly PitchPoint[], elapsed: number): number {
  let previous = { time: 0, semitones: 0 };
  for (const point of points) {
    if (elapsed < point.time) {
      return previous.semitones + (point.semitones - previous.semitones) *
        (elapsed - previous.time) / (point.time - previous.time);
    }
    previous = point;
  }
  return previous.semitones;
}

/** Reserve melodic channels for this adapter. Pass distinct channels when sharing a synth with other music. */
export function createSpessaSynthPlayback(synth: SpessaSynthHost,
  channels: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]): PlaybackPlugin {
  const pool = [...new Set(channels)];
  if (!pool.length || pool.some(n => !Number.isInteger(n) || n < 0 || n > 15)) {
    throw new RangeError('Supply MIDI channels from 0 to 15');
  }
  // Sessions opened by the same adapter can run together without borrowing each other's channels.
  const leased = new Set<number>();

  async function open(program: number, signal: AbortSignal): Promise<PlaybackSession> {
    const audio = synth.context;
    const resume = 'resume' in audio ? (audio as AudioContext).resume() : Promise.resolve();
    await Promise.all([resume, synth.isReady]);
    signal.throwIfAborted();
    const active = new Set<SoundingVoice>();
    const owned = new Set<number>();
    let timer: number;

    function release(voice: SoundingVoice) {
      synth.noteOff(voice.channel, voice.note.pitch);
      if (voice.range) synth.pitchWheel(voice.channel, 8192);
      active.delete(voice);
    }

    // Keep future note-offs cancellable. A stopped run cannot cut off a later replay.
    function update() {
      window.clearTimeout(timer);
      let delay = Infinity;
      for (const voice of active) {
        const elapsed = audio.currentTime - voice.start;
        if (elapsed >= voice.note.duration) { release(voice); continue; }
        if (voice.range) {
          const offset = pitchAt(voice.note.bend!, elapsed) / voice.range;
          synth.pitchWheel(voice.channel, Math.max(0, Math.min(16383, Math.round(8192 + offset * 8192))));
          delay = Math.min(delay, 0.012);
        }
        delay = Math.min(delay, voice.note.duration - elapsed);
      }
      if (active.size) timer = window.setTimeout(update, Math.max(1, delay * 1000));
    }

    return {
      get currentTime() { return audio.currentTime; },
      playNote(note) {
        update();
        const range = Math.ceil(Math.max(0, ...(note.bend ?? []).map(p => Math.abs(p.semitones))));
        // Straight chord members can share a channel. Bends and overlapping unisons need isolation.
        const channel = pool.find(ch => (!leased.has(ch) || owned.has(ch)) &&
          ![...active].some(v => v.channel === ch && (range || v.range || v.note.pitch === note.pitch)));
        if (channel === undefined) throw new Error('Insufficient reserved SpessaSynth channels for this chord');
        if (!owned.has(channel)) {
          synth.programChange(channel, program);
          owned.add(channel);
          leased.add(channel);
        }
        if (range) synth.pitchWheelRange(channel, range);
        synth.noteOn(channel, note.pitch, note.velocity);
        active.add({ channel, note, start: audio.currentTime, range });
        update();
      },
      stop() {
        window.clearTimeout(timer);
        for (const voice of active) release(voice);
        for (const channel of owned) leased.delete(channel);
        owned.clear();
      },
    };
  }
  return { open };
}
