// src/player.ts
// Playback overlay that uses MIDI.js to audition VexFlow notes and show a moving marker.

import Vex from './vexflow'; // VexFlow shim (for legacy Vex.Flow.Player attachment).
import * as _ from './utils'; // Utility helpers used for sorting/merging.

/**
 * VexTab Player
 *
 * This helper renders a transport overlay and uses MIDI.js to play back the
 * rendered notes. It attaches itself to Vex.Flow.Player for compatibility
 * with legacy VexTab usage.
 */
export default class Player {
  static DEBUG = false; // Enables verbose logging for debugging.
  static INSTRUMENTS_LOADED: Record<string, boolean> = {}; // Cache to avoid re-loading soundfonts.

  private artist: any; // Artist instance providing rendering + playback data.
  private options: Record<string, any>; // Configurable playback options.
  private interval_id: any = null; // setInterval handle for playback refresh.
  private paper: any = null; // Paper.js scope used to draw overlay UI.
  private marker: any = null; // Marker rectangle that tracks the current note.
  private loading_message: any = null; // Text overlay for loading state.
  private play_button: any = null; // Paper.js play button path.
  private stop_button: any = null; // Paper.js stop button path.

  private tick_notes: Record<string, any> = {}; // Map of tick → notes at that time.
  private all_ticks: any[] = []; // Sorted list of tick events for playback.
  private total_ticks: any = null; // Last tick in the piece (for display/logging).
  private tpm = 0; // Ticks per minute (derived from tempo).
  private refresh_rate = 25; // Refresh cadence in ms for playback updates.
  private ticks_per_refresh = 0; // Tick increment for each refresh tick.

  private current_ticks = 0; // Current playback position in ticks.
  private next_event_tick = 0; // Tick value for the next event to play.
  private next_index = 0; // Index into all_ticks for the next event.
  private done = false; // Whether playback has completed.
  private loading = false; // Whether instruments are currently loading.
  private scale = 1; // Render scale used to position the marker.

  // Static constants pulled from VexFlow for timing and note math.
  private Fraction = Vex.Flow.Fraction; // Fraction class for tick arithmetic.
  private RESOLUTION = Vex.Flow.RESOLUTION; // Ticks per whole note.
  private noteValues = Vex.Flow.Music.noteValues; // Map of note name → semitone info.

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
    this.artist = artist; // Store artist reference for data queries.
    this.log('Initializing player: ', options);
    this.options = {
      instrument: 'acoustic_grand_piano',
      tempo: 120,
      show_controls: true,
      soundfont_url: '/soundfont/',
      overlay_class: 'vextab-player',
    };

    if (options) {
      _.extend(this.options, options); // Apply user overrides.
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
    this.artist.attachPlayer(this); // Allow Artist to push voice data.
    this.tick_notes = {}; // Clear tick → notes map.
    this.all_ticks = []; // Clear tick list.
    this.tpm = this.options.tempo * (this.RESOLUTION / 4); // Ticks per minute.
    this.refresh_rate = 25; // ms: 50 = 20hz
    this.ticks_per_refresh = this.tpm / (60 * (1000 / this.refresh_rate)); // Tick delta per refresh.
    this.total_ticks = 0; // Reset total tick counter.
    if (this.marker) {
      this.marker.remove(); // Remove old marker from overlay.
      this.marker = null;
    }
    this.stop();
  }

  /**
   * Create a Paper.js overlay canvas positioned above the VexFlow surface.
   * Design note: a separate overlay avoids interfering with VexFlow render output.
   */
  private getOverlay(context: any, scale: number, overlay_class: string): { paper: any; canvas: any } {
    const canvas = context.canvas; // Underlying render surface.
    const height = canvas.height; // Render surface height.
    const width = canvas.width; // Render surface width.

    const overlay = $('<canvas>'); // New overlay canvas.
    overlay.css('position', 'absolute'); // Overlay above main canvas.
    overlay.css('left', 0); // Align to left edge of container.
    overlay.css('top', 0); // Align to top edge of container.
    overlay.addClass(overlay_class); // CSS hook for styling.

    $(canvas).after(overlay);
    const ctx = Vex.Flow.Renderer.getCanvasContext(overlay.get(0), width, height); // Overlay context.
    ctx.scale(scale, scale); // Mirror render scale.

    const ps = new paper.PaperScope(); // Paper.js scope for overlay drawing.
    ps.setup(overlay.get(0)); // Bind Paper.js to the overlay canvas.

    return { paper: ps, canvas: overlay.get(0) };
  }

  /**
   * Remove playback controls from the overlay (used when re-rendering).
   */
  removeControls(): void {
    if (this.play_button) this.play_button.remove();
    if (this.stop_button) this.stop_button.remove();
    if (this.paper) this.paper.view.draw();
  }

  /**
   * Build the overlay UI and compute tick maps for playback.
   * Design note: we compute tick maps from the render output for accuracy.
   */
  render(): void {
    this.reset();
    const data = this.artist.getPlayerData(); // Voice data + renderer context.
    this.scale = data.scale; // Track scaling for marker placement.

    if (!this.paper) {
      const overlay = this.getOverlay(data.context, data.scale, this.options.overlay_class);
      this.paper = overlay.paper; // Cache Paper.js scope for later updates.
    }

    this.marker = new this.paper.Path.Rectangle(0, 0, 13, 85); // Marker rectangle for playback position.
    this.loading_message = new this.paper.PointText(35, 12); // Loading status text.

    if (this.options.show_controls) {
      this.play_button = new this.paper.Path.RegularPolygon(new this.paper.Point(25, 10), 3, 7, 7); // Triangle play icon.
      this.play_button.fillColor = '#396';
      this.play_button.opacity = 0.8;
      this.play_button.rotate(90);
      this.play_button.onMouseUp = () => {
        this.play();
      };

      this.stop_button = new this.paper.Path.Rectangle(3, 3, 10, 10); // Square stop icon.
      this.stop_button.fillColor = '#396';
      this.stop_button.opacity = 0.8;
      this.stop_button.onMouseUp = () => {
        this.stop();
      };
    }

    this.paper.view.draw();
    const staves = data.voices; // Nested voice list from the Artist.

    let total_ticks = new this.Fraction(0, 1); // Accumulator for total tick count.
    staves.forEach((voice_group: any[]) => {
      let max_voice_tick = new this.Fraction(0, 1); // Track the longest voice in this group.
      voice_group.forEach((voice) => {
        const total_voice_ticks = new this.Fraction(0, 1); // Tick count within the voice.

        voice.getTickables().forEach((note: any) => {
          if (!note.shouldIgnoreTicks()) {
            const abs_tick = total_ticks.clone(); // Absolute tick position.
            abs_tick.add(total_voice_ticks); // Add per-voice offset.
            abs_tick.simplify(); // Reduce fraction for consistent string keys.
            const key = abs_tick.toString(); // Hash key for tick map.

            if (_.has(this.tick_notes, key)) {
              this.tick_notes[key].notes.push(note);
            } else {
              this.tick_notes[key] = {
                tick: abs_tick,
                value: abs_tick.value(),
                notes: [note],
              };
            }

            total_voice_ticks.add(note.getTicks()); // Advance by note duration.
          }
        });

        if (total_voice_ticks.value() > max_voice_tick.value()) {
          max_voice_tick.copy(total_voice_ticks); // Keep the maximum voice length.
        }
      });

      total_ticks.add(max_voice_tick); // Advance by the longest voice.
    });

    this.all_ticks = _.sortBy(_.values(this.tick_notes), (tick) => tick.value); // Sorted tick events.
    this.total_ticks = _.last(this.all_ticks); // Final tick event (if any).
    this.log(this.all_ticks);
  }

  /**
   * Move the overlay marker to the given note position.
   */
  private updateMarker(x: number, y: number): void {
    this.marker.fillColor = '#369';
    this.marker.opacity = 0.2;
    this.marker.setPosition(new this.paper.Point(x * this.scale, y * this.scale));
    this.paper.view.draw();
  }

  /**
   * Trigger MIDI playback for a set of notes and move the marker.
   * Design note: VexFlow's note APIs provide pitch strings we map to MIDI.
   */
  private playNote(notes: any[]): void {
    this.log(`(${this.current_ticks}) playNote: `, notes);

    notes.forEach((note) => {
      const x = note.getAbsoluteX() + 4; // Slight offset to center the marker.
      const y = note.getStave().getYForLine(2); // Vertical placement on the stave.
      if (this.paper) this.updateMarker(x, y);
      if (note.isRest()) return;

      const keys = note.getPlayNote(); // Pitch strings (e.g., c/4).
      const duration = note.getTicks().value() / (this.tpm / 60); // Duration in seconds.
      keys.forEach((key: string) => {
        const pieces = key.split('/'); // ["c", "4"] style split.
        const noteName = pieces[0].trim().toLowerCase(); // Normalized pitch name.
        const octave = pieces[1]; // Octave string.
        const note_value = this.noteValues[noteName]; // VexFlow note value info.
        if (!note_value) return;

        const midi_note = (24 + (parseInt(octave, 10) * 12)) + note_value.int_val; // MIDI note number.
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

    this.current_ticks += this.ticks_per_refresh; // Advance playback cursor.

    if (this.current_ticks >= this.next_event_tick && this.all_ticks.length > 0) {
      this.playNote(this.all_ticks[this.next_index].notes); // Play current tick's notes.
      this.next_index += 1; // Move to next tick event.
      if (this.next_index >= this.all_ticks.length) {
        this.done = true;
      } else {
        this.next_event_tick = this.all_ticks[this.next_index].tick.value(); // Update target tick.
      }
    }
  }

  /**
   * Stop playback, clear timers, and reset UI state.
   */
  stop(): void {
    this.log('Stop');
    if (this.interval_id) window.clearInterval(this.interval_id);
    if (this.play_button) this.play_button.fillColor = '#396';
    if (this.paper) this.paper.view.draw();
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
    if (this.play_button) this.play_button.fillColor = '#a36';
    MIDI.programChange(0, this.INSTRUMENTS[this.options.instrument]); // Select instrument.
    this.render();
    this.interval_id = window.setInterval(() => this.refresh(), this.refresh_rate); // Schedule refresh loop.
  }

  /**
   * Public entry point for playback. Loads instruments as needed.
   */
  play(): void {
    this.log('Play: ', this.refresh_rate, this.ticks_per_refresh);
    if (Player.INSTRUMENTS_LOADED[this.options.instrument] && !this.loading) {
      this.start();
    } else {
      this.log('Loading instruments...');
      this.loading_message.content = 'Loading instruments...';
      this.loading_message.fillColor = 'green';
      this.loading = true;
      this.paper.view.draw();

      MIDI.loadPlugin({
        soundfontUrl: this.options.soundfont_url, // Base URL for soundfont assets.
        instruments: [this.options.instrument], // Instruments to load.
        callback: () => {
          Player.INSTRUMENTS_LOADED[this.options.instrument] = true; // Mark instrument cached.
          this.loading = false; // Exit loading state.
          this.loading_message.content = ''; // Clear loading text.
          this.start(); // Begin playback after assets are ready.
        },
      });
    }
  }
}

// Preserve legacy access via Vex.Flow.Player.
if (!Vex.Flow.Player) {
  Vex.Flow.Player = Player;
}
