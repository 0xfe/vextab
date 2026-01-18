import Vex from './vexflow';
import * as _ from 'lodash';

/**
 * VexTab Player
 *
 * This helper renders a transport overlay and uses MIDI.js to play back the
 * rendered notes. It attaches itself to Vex.Flow.Player for compatibility
 * with legacy VexTab usage.
 */
export default class Player {
  static DEBUG = false;
  static INSTRUMENTS_LOADED: Record<string, boolean> = {};

  private artist: any;
  private options: Record<string, any>;
  private interval_id: any = null;
  private paper: any = null;
  private marker: any = null;
  private loading_message: any = null;
  private play_button: any = null;
  private stop_button: any = null;

  private tick_notes: Record<string, any> = {};
  private all_ticks: any[] = [];
  private total_ticks: any = null;
  private tpm = 0;
  private refresh_rate = 25;
  private ticks_per_refresh = 0;

  private current_ticks = 0;
  private next_event_tick = 0;
  private next_index = 0;
  private done = false;
  private loading = false;
  private scale = 1;

  // Static constants pulled from VexFlow for timing.
  private Fraction = Vex.Flow.Fraction;
  private RESOLUTION = Vex.Flow.RESOLUTION;
  private noteValues = Vex.Flow.Music.noteValues;

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

  private log(...args: any[]): void {
    if (Player.DEBUG && console) {
      console.log('(Vex.Flow.Player)', ...args);
    }
  }

  setArtist(artist: any): void {
    this.artist = artist;
    this.reset();
  }

  setTempo(tempo: number): void {
    this.log('New tempo: ', tempo);
    this.options.tempo = tempo;
    this.reset();
  }

  setInstrument(instrument: string): void {
    this.log('New instrument: ', instrument);
    if (!Object.keys(this.INSTRUMENTS).includes(instrument)) {
      throw new Vex.RERR('PlayerError', `Invalid instrument: ${instrument}`);
    }
    this.options.instrument = instrument;
    this.reset();
  }

  reset(): void {
    this.artist.attachPlayer(this);
    this.tick_notes = {};
    this.all_ticks = [];
    this.tpm = this.options.tempo * (this.RESOLUTION / 4);
    this.refresh_rate = 25; // ms: 50 = 20hz
    this.ticks_per_refresh = this.tpm / (60 * (1000 / this.refresh_rate));
    this.total_ticks = 0;
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    this.stop();
  }

  private getOverlay(context: any, scale: number, overlay_class: string): { paper: any; canvas: any } {
    const canvas = context.canvas;
    const height = canvas.height;
    const width = canvas.width;

    const overlay = $('<canvas>');
    overlay.css('position', 'absolute');
    overlay.css('left', 0);
    overlay.css('top', 0);
    overlay.addClass(overlay_class);

    $(canvas).after(overlay);
    const ctx = Vex.Flow.Renderer.getCanvasContext(overlay.get(0), width, height);
    ctx.scale(scale, scale);

    const ps = new paper.PaperScope();
    ps.setup(overlay.get(0));

    return { paper: ps, canvas: overlay.get(0) };
  }

  removeControls(): void {
    if (this.play_button) this.play_button.remove();
    if (this.stop_button) this.stop_button.remove();
    if (this.paper) this.paper.view.draw();
  }

  render(): void {
    this.reset();
    const data = this.artist.getPlayerData();
    this.scale = data.scale;

    if (!this.paper) {
      const overlay = this.getOverlay(data.context, data.scale, this.options.overlay_class);
      this.paper = overlay.paper;
    }

    this.marker = new this.paper.Path.Rectangle(0, 0, 13, 85);
    this.loading_message = new this.paper.PointText(35, 12);

    if (this.options.show_controls) {
      this.play_button = new this.paper.Path.RegularPolygon(new this.paper.Point(25, 10), 3, 7, 7);
      this.play_button.fillColor = '#396';
      this.play_button.opacity = 0.8;
      this.play_button.rotate(90);
      this.play_button.onMouseUp = () => {
        this.play();
      };

      this.stop_button = new this.paper.Path.Rectangle(3, 3, 10, 10);
      this.stop_button.fillColor = '#396';
      this.stop_button.opacity = 0.8;
      this.stop_button.onMouseUp = () => {
        this.stop();
      };
    }

    this.paper.view.draw();
    const staves = data.voices;

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

            if (_.has(this.tick_notes, key)) {
              this.tick_notes[key].notes.push(note);
            } else {
              this.tick_notes[key] = {
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

    this.all_ticks = _.sortBy(_.values(this.tick_notes), (tick) => tick.value);
    this.total_ticks = _.last(this.all_ticks);
    this.log(this.all_ticks);
  }

  private updateMarker(x: number, y: number): void {
    this.marker.fillColor = '#369';
    this.marker.opacity = 0.2;
    this.marker.setPosition(new this.paper.Point(x * this.scale, y * this.scale));
    this.paper.view.draw();
  }

  private playNote(notes: any[]): void {
    this.log(`(${this.current_ticks}) playNote: `, notes);

    notes.forEach((note) => {
      const x = note.getAbsoluteX() + 4;
      const y = note.getStave().getYForLine(2);
      if (this.paper) this.updateMarker(x, y);
      if (note.isRest()) return;

      const keys = note.getPlayNote();
      const duration = note.getTicks().value() / (this.tpm / 60);
      keys.forEach((key: string) => {
        const pieces = key.split('/');
        const noteName = pieces[0].trim().toLowerCase();
        const octave = pieces[1];
        const note_value = this.noteValues[noteName];
        if (!note_value) return;

        const midi_note = (24 + (parseInt(octave, 10) * 12)) + note_value.int_val;
        MIDI.noteOn(0, midi_note, 127, 0);
        MIDI.noteOff(0, midi_note, duration);
      });
    });
  }

  private refresh(): void {
    if (this.done) {
      this.stop();
      return;
    }

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

  private start(): void {
    this.stop();
    this.log('Start');
    if (this.play_button) this.play_button.fillColor = '#a36';
    MIDI.programChange(0, this.INSTRUMENTS[this.options.instrument]);
    this.render();
    this.interval_id = window.setInterval(() => this.refresh(), this.refresh_rate);
  }

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
        soundfontUrl: this.options.soundfont_url,
        instruments: [this.options.instrument],
        callback: () => {
          Player.INSTRUMENTS_LOADED[this.options.instrument] = true;
          this.loading = false;
          this.loading_message.content = '';
          this.start();
        },
      });
    }
  }
}

// Preserve legacy access via Vex.Flow.Player.
if (!Vex.Flow.Player) {
  Vex.Flow.Player = Player;
}
