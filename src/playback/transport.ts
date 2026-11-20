// Public instrument contract and transport shared by score and Artist playback.

/** A linear pitch ramp from the previous point, in seconds and semitones from the attack. */
export interface PitchPoint { time: number; semitones: number }

/** One sounding head. MIDI pitch 60 is middle C. Durations are in seconds. */
export interface PlaybackNote {
  pitch: number;
  duration: number;
  velocity: number;
  bend?: readonly PitchPoint[];
}

/** Each play owns a session. Stop releases only sounds and resources owned by that session. */
export interface PlaybackSession {
  /** Optional audio clock in seconds. The transport otherwise uses the browser's monotonic clock. */
  readonly currentTime?: number;
  playNote(note: PlaybackNote): void;
  stop(): void;
}

/** Open runs on the Play gesture. The signal cancels preparation during an edit or stop. */
export interface PlaybackPlugin {
  open(program: number, signal: AbortSignal): PlaybackSession | Promise<PlaybackSession>;
}

/** An onset can contain a rest or a chord. Mark is optional visual feedback. */
export interface PlaybackEvent { time: number; duration: number; source: string | object; notes: PlaybackNote[]; mark?: () => void }
export interface Performance { events: PlaybackEvent[]; duration: number }

/** Drive onsets from elapsed time. Timer delays do not accumulate in the tempo. */
export class PlaybackTransport {
  private request?: AbortController;
  private session?: PlaybackSession;
  private timer?: number;

  get active(): boolean { return !!this.request; }

  /** Resolve on completion or cancellation, reject on preparation or instrument errors. */
  play(plugin: PlaybackPlugin, program: number, music: Performance, started: (elapsed: () => number) => void, leadIn = 0): Promise<void> {
    this.stop();
    const request = this.request = new AbortController();
    return new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => resolve(), { once: true });
      const fail = (error: unknown) => {
        if (request.signal.aborted) return;
        reject(error);
        this.stop();
      };
      const begin = (session: PlaybackSession) => {
        if (request.signal.aborted) { session.stop(); return; }
        this.session = session;
        const now = () => session.currentTime ?? performance.now() / 1000;
        const origin = now() + leadIn;
        started(() => now() - origin);
        let index = 0;
        const advance = () => {
          if (request.signal.aborted) return;
          try {
            const elapsed = now() - origin;
            while (index < music.events.length && music.events[index].time <= elapsed) {
              const event = music.events[index++];
              event.mark?.();
              for (const note of event.notes) {
                // A throttled background tab may wake after this note has already ended.
                if (event.time + note.duration > elapsed) session.playNote(note);
              }
            }
            if (index === music.events.length && elapsed >= music.duration) {
              this.stop();
              return;
            }
            const next = music.events[index]?.time ?? music.duration;
            this.timer = window.setTimeout(advance, Math.max(1, (origin + next - now()) * 1000));
          } catch (error) { fail(error); }
        };
        advance();
      };
      try {
        const opening = plugin.open(program, request.signal);
        if ('playNote' in opening) begin(opening);
        else opening.then(begin).catch(fail);
      } catch (error) { fail(error); }
    });
  }

  /** Invalidate late readiness callbacks before releasing the current instrument. */
  stop(): void {
    this.request?.abort();
    this.request = undefined;
    window.clearTimeout(this.timer);
    this.timer = undefined;
    const session = this.session;
    this.session = undefined;
    session?.stop();
  }
}
