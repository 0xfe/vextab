// Compatibility adapter for existing pages that explicitly provide a MIDI.js global.
import type { PlaybackPlugin, PlaybackSession } from './transport';

/** Preserve the public instrument cache and the host's historical soundfont URL. */
export function legacyMidiPlayback(instrument: string, url: string, cache: Record<string, boolean>): PlaybackPlugin {
  return { open(program, signal) {
    function connect(): PlaybackSession {
      signal.throwIfAborted();
      MIDI.programChange(0, program);
      return {
        playNote(note) {
          MIDI.noteOn(0, note.pitch, 127, 0);
          MIDI.noteOff(0, note.pitch, note.duration);
        },
        stop() { /* MIDI.js owns the scheduled releases. */ },
      };
    }
    if (cache[instrument]) return connect();
    return new Promise<PlaybackSession>((resolve, reject) => {
      MIDI.loadPlugin({
        instruments: [instrument], soundfontUrl: url, onerror: reject,
        callback() {
          cache[instrument] = true;
          try { resolve(connect()); } catch (error) { reject(error); }
        },
      });
    });
  } };
}
