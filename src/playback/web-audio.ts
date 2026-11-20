// A polyphonic Web Audio instrument with no samples, network requests or global state.
import type { PlaybackNote, PlaybackPlugin, PlaybackSession } from './transport';

/** Pass a context to share the host's audio graph. An omitted context belongs to the session. */
export function createWebAudioPlayback(context?: AudioContext | OfflineAudioContext): PlaybackPlugin {
  async function open(program: number, signal: AbortSignal): Promise<PlaybackSession> {
    const audio = context ?? new AudioContext();
    const voices = new Set<OscillatorNode>();
    let closed = false;
    // Cancellation releases the voices and any context created for this session.
    function stop() {
      if (closed) return;
      closed = true;
      for (const voice of voices) voice.stop();
      if (!context && audio instanceof AudioContext && audio.state !== 'closed') void audio.close();
      signal.removeEventListener('abort', stop);
    }
    signal.addEventListener('abort', stop, { once: true });
    try {
      if (audio instanceof AudioContext && audio.state !== 'running') await audio.resume();
      signal.throwIfAborted();
    } catch (error) { stop(); throw error; }

    // Each note gets its own pitch envelope so chord members can bend independently.
    function playNote(note: PlaybackNote) {
      const now = audio.currentTime;
      const end = now + note.duration;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = program >= 72 && program <= 79 ? 'sine' : 'triangle';
      osc.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      osc.detune.setValueAtTime(0, now);
      for (const point of note.bend ?? []) osc.detune.linearRampToValueAtTime(point.semitones * 100, now + point.time);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(note.velocity / 127 * 0.12, now + Math.min(0.006, note.duration / 3));
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(gain).connect(audio.destination);
      voices.add(osc);
      osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
      osc.start(now);
      osc.stop(end);
    }
    return { playNote, stop, get currentTime() { return audio.currentTime; } };
  }
  return { open };
}
