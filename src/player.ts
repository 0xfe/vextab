// Playback overlay that uses MIDI.js to audition VexFlow notes and show a moving marker.
import { PlayerOverlay } from './player-overlay';
import Vex from './vexflow';
import * as _ from './utils';

/**
 * VexTab Player
 *
 * This helper renders a transport overlay and uses MIDI.js to play back the
 * rendered notes. It attaches itself to Vex.Flow.Player for compatibility
 * with legacy VexTab usage.
 */
export default class Player {
  // Enables verbose logging for debugging.
  static DEBUG = false;
  // Cache to avoid re-loading soundfonts per instrument.
  static INSTRUMENTS_LOADED: Record<string, boolean> = {};

  // Artist instance provides render data and context.
  private artist: any;
  // Configurable playback options.
  private options: Record<string, any>;
  // Playback timer and overlay UI handles.
  private interval_id: any = null;
  private overlay?: PlayerOverlay;
  // A stopped or replaced score must never restart from a late MIDI.js callback.
  private pendingLoad?: () => void;

  // Playback timing state.
  private all_ticks: any[] = [];
  private tpm = 0;
  private refresh_rate = 25;
  private ticks_per_refresh = 0;

  // Cursor state for playback.
  private current_ticks = 0;
  private next_event_tick = 0;
  private next_index = 0;
  private done = false;

  // Static constants pulled from VexFlow for timing and note math.
  private Fraction = Vex.Flow.Fraction;
  private RESOLUTION = Vex.Flow.RESOLUTION;
  private noteValues = Vex.Flow.Music.noteValues;

  // MIDI program numbers keyed by human-friendly instrument names.
  private INSTRUMENTS: Record<string, number> = {
    acoustic_grand_piano: 0,
    acoustic_guitar_nylon: 24,
    acoustic_guitar_steel: 25,
    electric_guitar_jazz: 26,
    distortion_guitar: 30,
    electric_bass_finger: 33,
    electric_bass_pick: 34,
    trumpet: 56,
    brass_section: 61,
    soprano_sax: 64,
    alto_sax: 65,
    tenor_sax: 66,
    baritone_sax: 67,
    flute: 73,
    synth_drum: 118,
  };

  /**
   * Construct a playback helper and attach to an Artist.
   * Design note: options are merged so callers can override selectively.
   */
  constructor(artist: any, options?: Record<string, any>) {
    this.artist = artist;
    this.log('Initializing player: ', options);
    this.options = {
      instrument: 'acoustic_grand_piano',
      tempo: 120,
      show_controls: true,
      soundfont_url: '/soundfont/',
      overlay_class: 'vextab-player',
    };

    if (options) {
      _.extend(this.options, options);
    }

    this.log(`Using soundfonts in: ${this.options.soundfont_url}`);
    this.reset();
  }

  /**
   * Log only when debug mode is enabled, to keep console noise low.
   */
  private log(...args: any[]): void {
    if (Player.DEBUG && console) {
      console.log('(Vex.Flow.Player)', ...args);
    }
  }

  /**
   * Swap the Artist instance and reset cached playback data.
   */
  setArtist(artist: any): void {
    this.dispose();
    this.artist = artist;
    this.reset();
  }

  /**
   * Update playback tempo and recompute tick scheduling.
   */
  setTempo(tempo: number): void {
    this.log('New tempo: ', tempo);
    this.options.tempo = tempo;
    this.reset();
  }

  /**
   * Update the MIDI instrument used for playback.
   */
  setInstrument(instrument: string): void {
    this.log('New instrument: ', instrument);
    if (!Object.keys(this.INSTRUMENTS).includes(instrument)) {
      throw new Vex.RERR('PlayerError', `Invalid instrument: ${instrument}`);
    }
    this.options.instrument = instrument;
    this.reset();
  }

  /**
   * Reset internal playback state and recompute timing values.
   * Design note: called on every render to keep playback in sync.
   */
  reset(): void {
    this.artist.attachPlayer(this);
    this.stop();
    this.all_ticks = [];
    this.tpm = this.options.tempo * (this.RESOLUTION / 4);
    this.ticks_per_refresh = this.tpm / (60 * (1000 / this.refresh_rate));
  }

  /** Remove the entire overlay when the Artist turns playback off. */
  removeControls(): void {
    this.stop();
    this.overlay?.remove();
    this.overlay = undefined;
  }

  /** Release the timer, pending UI work, and attachment to the Artist. */
  dispose(): void {
    this.removeControls();
    this.all_ticks = [];
    if (this.artist.player === this) this.artist.attachPlayer(null);
  }

  /** Mount the transport above the latest score Canvas after each Artist draw. */
  render(): void {
    this.removeControls();
    const canvas = this.artist.getPlayerData().context?.canvas;
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Vex.RERR('PlayerError', 'The player requires a rendered Canvas score.');
    }
    this.overlay = new PlayerOverlay(canvas, this.options.overlay_class, this.options.show_controls,
      () => this.play(), () => this.stop());
  }

  /** Rebuild the event map from the Artist's current voices at the start of each play. */
  private prepareEvents(): void {
    const tickNotes: Record<string, any> = {};
    const staves = this.artist.getPlayerData().voices;
    // Build a flattened list of tick events to drive playback.
    let total_ticks = new this.Fraction(0, 1);
    staves.forEach((voice_group: any[]) => {
      let max_voice_tick = new this.Fraction(0, 1);
      voice_group.forEach((voice) => {
        const total_voice_ticks = new this.Fraction(0, 1);

        voice.getTickables().forEach((note: any) => {
          if (!note.shouldIgnoreTicks()) {
            const abs_tick = total_ticks.clone();
            abs_tick.add(total_voice_ticks);
            abs_tick.simplify();
            const key = abs_tick.toString();

            if (_.has(tickNotes, key)) {
              tickNotes[key].notes.push(note);
            } else {
              tickNotes[key] = {
                tick: abs_tick,
                value: abs_tick.value(),
                notes: [note],
              };
            }

            total_voice_ticks.add(note.getTicks());
          }
        });

        if (total_voice_ticks.value() > max_voice_tick.value()) {
          max_voice_tick.copy(total_voice_ticks);
        }
      });

      total_ticks.add(max_voice_tick);
    });

    // Sort events by absolute tick for deterministic playback.
    this.all_ticks = _.sortBy(_.values(tickNotes), (tick) => tick.value);
    this.log(this.all_ticks);
  }

  /**
   * Trigger MIDI playback for a set of notes and move the marker.
   * Design note: VexFlow's note APIs provide pitch strings we map to MIDI.
   */
  private playNote(notes: any[]): void {
    this.log(`(${this.current_ticks}) playNote: `, notes);

    // For each note, move the marker and emit MIDI events.
    notes.forEach((note) => {
      const x = note.getAbsoluteX() + 4;
      const y = note.getStave().getYForLine(2);
      this.overlay?.moveCursor(x, y);
      if (note.isRest()) return;

      const keys = note.getPlayNote();
      const duration = note.getTicks().value() / (this.tpm / 60);
      keys.forEach((key: string) => {
        const pieces = key.split('/');
        const noteName = pieces[0].trim().toLowerCase();
        const octave = pieces[1];
        const note_value = this.noteValues[noteName];
        if (!note_value) return;

        const midi_note = (24 + (parseInt(octave, 10) * 12)) + note_value.intVal;
        MIDI.noteOn(0, midi_note, 127, 0);
        MIDI.noteOff(0, midi_note, duration);
      });
    });
  }

  /**
   * Advance playback time and emit notes when their tick is reached.
   */
  private refresh(): void {
    if (this.done) {
      this.stop();
      return;
    }

    // Advance playback cursor based on ticks-per-refresh.
    this.current_ticks += this.ticks_per_refresh;

    if (this.current_ticks >= this.next_event_tick && this.all_ticks.length > 0) {
      this.playNote(this.all_ticks[this.next_index].notes);
      this.next_index += 1;
      if (this.next_index >= this.all_ticks.length) {
        this.done = true;
      } else {
        this.next_event_tick = this.all_ticks[this.next_index].tick.value();
      }
    }
  }

  /**
   * Stop playback, clear timers, and reset UI state.
   */
  stop(): void {
    this.log('Stop');
    // Reset playback cursor and UI state.
    if (this.interval_id) window.clearInterval(this.interval_id);
    this.pendingLoad = undefined;
    this.overlay?.setLoading(false);
    this.overlay?.setPlaying(false);
    this.interval_id = null;
    this.current_ticks = 0;
    this.next_event_tick = 0;
    this.next_index = 0;
    this.done = false;
  }

  /**
   * Start playback after ensuring the overlay and MIDI setup are ready.
   */
  private start(): void {
    this.stop();
    this.log('Start');
    this.prepareEvents();
    if (!this.all_ticks.length) return;
    this.overlay?.setPlaying(true);
    // Select instrument and schedule refresh ticks.
    MIDI.programChange(0, this.INSTRUMENTS[this.options.instrument]);
    this.interval_id = window.setInterval(() => this.refresh(), this.refresh_rate);
  }

  /**
   * Public entry point for playback. Loads instruments as needed.
   */
  play(): void {
    this.log('Play: ', this.refresh_rate, this.ticks_per_refresh);
    if (this.pendingLoad) return;
    if (!this.overlay) this.render();
    const instrument = this.options.instrument;
    if (Player.INSTRUMENTS_LOADED[instrument]) {
      this.start();
      return;
    }

    this.overlay.setLoading(true);
    const loaded = () => {
      Player.INSTRUMENTS_LOADED[instrument] = true;
      if (this.pendingLoad === loaded) this.start();
    };
    this.pendingLoad = loaded;
    try {
      MIDI.loadPlugin({
        soundfontUrl: this.options.soundfont_url,
        instruments: [instrument],
        callback: loaded,
      });
    } catch (error) {
      this.stop();
      throw error;
    }
  }
}

// Preserve legacy access via Vex.Flow.Player.
if (!Vex.Flow.Player) {
  Vex.Flow.Player = Player;
}
