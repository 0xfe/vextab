// Public instrument contract and transport shared by score and Artist playback.

/** A linear pitch ramp from the previous point, in seconds and semitones from the attack. */
export interface PitchPoint { time: number; semitones: number }

/** One sounding head. MIDI pitch 60 is middle C. Durations are in seconds. */
export interface PlaybackNote {
  program?: number;
  pitch: number;
  duration: number;
  /** Seconds after the event pulse. The transport consumes this before it calls the instrument. */
  onsetOffset?: number;
  /** A tie or damper owns the release, so finger articulation must preserve its endpoint. */
  holdRelease?: boolean;
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

/** Keep one visual mark per event and merge finger attacks with the other voices on the score clock. */
function transportSteps(events: PlaybackEvent[]): Pick<PlaybackEvent, 'time' | 'notes' | 'mark'>[] {
  if (!events.some(event => event.notes.some(note => note.onsetOffset))) return events;
  const steps = [];
  for (const event of events) {
    const onBeat: PlaybackNote[] = [];
    steps.push({ time: event.time, notes: onBeat, mark: event.mark });
    for (const note of event.notes) {
      if (!note.onsetOffset) { onBeat.push(note); continue; }
      const { onsetOffset, ...sounding } = note;
      steps.push({ time: event.time + onsetOffset, notes: [sounding] });
    }
  }
  return steps.sort((a, b) => a.time - b.time);
}

/** Drive onsets from elapsed time. Timer delays do not accumulate in the tempo. */
export class PlaybackTransport {
  private request?: AbortController;
  private session?: PlaybackSession;
  private timer?: number;
  private rate = 1;
  private retime?: (rate: number) => void;

  /** Pending loads remember the new rate. A running session reschedules its next onset. */
  setRate(rate: number): void {
    if (this.retime) this.retime(rate);
    else this.rate = rate;
  }

  get active(): boolean { return !!this.request; }

  /** Resolve on completion or cancellation, reject on preparation or instrument errors. */
  play(plugin: PlaybackPlugin, program: number, music: Performance, started: (elapsed: () => number) => void, leadIn = 0): Promise<void> {
    this.stop();
    const request = this.request = new AbortController();
    // A document in the back/forward cache retains timers, controls and pending instrument loads.
    // End this run on navigation so returning to the score starts at the first note on a fresh clock.
    // Capture runs before the page owner disconnects its shared synthesizer.
    globalThis.addEventListener?.('pagehide', () => this.stop(), { capture: true, signal: request.signal });
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
        const steps = transportSteps(music.events);
        let wallOrigin = now();
        let scoreOrigin = -leadIn;
        const position = () => scoreOrigin + (now() - wallOrigin) * this.rate;
        let index = 0;
        const advance = () => {
          if (request.signal.aborted) return;
          try {
            const elapsed = position();
            while (index < steps.length && steps[index].time <= elapsed) {
              const event = steps[index++];
              event.mark?.();
              for (const note of event.notes) {
                // A throttled background tab may wake after this note has already ended.
                if (event.time + note.duration > elapsed) session.playNote(atPlaybackRate(note, this.rate));
              }
            }
            if (index === steps.length && elapsed >= music.duration) {
              this.stop();
              return;
            }
            const next = steps[index]?.time ?? music.duration;
            this.timer = window.setTimeout(advance, Math.max(1, (next - position()) / this.rate * 1000));
          } catch (error) { fail(error); }
        };
        this.retime = rate => {
          // Anchor the new slope at the current beat so the audio and cursor stay together.
          scoreOrigin = position();
          wallOrigin = now();
          this.rate = rate;
          window.clearTimeout(this.timer);
          advance();
        };
        started(position);
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
    this.retime = undefined;
    this.rate = 1;
    this.request?.abort();
    this.request = undefined;
    window.clearTimeout(this.timer);
    this.timer = undefined;
    const session = this.session;
    this.session = undefined;
    session?.stop();
  }
}

/** Instruments schedule the release and pitch envelope in wall-clock seconds at each attack. */
function atPlaybackRate(note: PlaybackNote, rate: number): PlaybackNote {
  if (rate === 1) return note;
  return { ...note, duration: note.duration / rate,
    bend: note.bend?.map(point => ({ ...point, time: point.time / rate })) };
}
