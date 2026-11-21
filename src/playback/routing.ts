// Share the transport clock while opening one playback-plugin session per authored MIDI program.
import type { PlaybackPlugin, PlaybackSession } from './transport';

/** Stop ready and late-arriving sessions together when loading fails or playback is cancelled. */
export function routedPlayback(plugin: PlaybackPlugin, programs: number[]): PlaybackPlugin {
  return { async open(fallback, signal) {
    const sessions = new Map<number, PlaybackSession>();
    let stopped = false;
    function stop() {
      stopped = true;
      sessions.forEach(session => session.stop());
      sessions.clear();
    }
    signal.addEventListener('abort', stop, { once: true });
    try {
      await Promise.all([...new Set(programs)].map(async program => {
        const session = await plugin.open(program, signal);
        if (stopped || signal.aborted) session.stop();
        else sessions.set(program, session);
      }));
      return { get currentTime() { return sessions.values().next().value?.currentTime; },
        playNote(note) { sessions.get(note.program ?? fallback)?.playNote(note); }, stop };
    } catch (error) { stop(); throw error; }
  } };
}
