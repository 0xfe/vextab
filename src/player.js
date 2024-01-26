/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// VexTab Player
// Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
//
// This class is responsible for rendering the elements
// parsed by Vex.Flow.VexTab.

(function() {
  let L = undefined;
  let Fraction = undefined;
  let RESOLUTION = undefined;
  let noteValues = undefined;
  let drawDot = undefined;
  let INSTRUMENTS = undefined;
  let getOverlay = undefined;
  const Cls = (Vex.Flow.Player = class Player {
    static initClass() {
      this.DEBUG = false;
      this.INSTRUMENTS_LOADED = {};
      L = function(...args) { if (Vex.Flow.Player.DEBUG) { return (typeof console !== 'undefined' && console !== null ? console.log("(Vex.Flow.Player)", ...Array.from(args)) : undefined); } };
  
      ({
        Fraction
      } = Vex.Flow);
      ({
        RESOLUTION
      } = Vex.Flow);
      ({
        noteValues
      } = Vex.Flow.Music);
      ({
        drawDot
      } = Vex);
  
      INSTRUMENTS = {
        "acoustic_grand_piano": 0,
        "acoustic_guitar_nylon": 24,
        "acoustic_guitar_steel": 25,
        "electric_guitar_jazz": 26,
        "distortion_guitar": 30,
        "electric_bass_finger": 33,
        "electric_bass_pick": 34,
        "trumpet": 56,
        "brass_section": 61,
        "soprano_sax": 64,
        "alto_sax": 65,
        "tenor_sax": 66,
        "baritone_sax": 67,
        "flute": 73,
        "synth_drum": 118
      };
  
      getOverlay = function(context, scale, overlay_class) {
        const {
          canvas
        } = context;
        const {
          height
        } = canvas;
        const {
          width
        } = canvas;
  
        const overlay = $('<canvas>');
        overlay.css("position", "absolute");
        overlay.css("left", 0);
        overlay.css("top", 0);
        overlay.addClass(overlay_class);
  
        $(canvas).after(overlay);
        const ctx = Vex.Flow.Renderer.getCanvasContext(overlay.get(0), width, height);
        ctx.scale(scale, scale);
  
        const ps = new paper.PaperScope();
        ps.setup(overlay.get(0));
  
        return {
          paper: ps,
          canvas: overlay.get(0)
        };
      };
    }

    constructor(artist, options) {
      this.artist = artist;
      L("Initializing player: ", options);
      this.options = {
        instrument: "acoustic_grand_piano",
        tempo: 120,
        show_controls: true,
        soundfont_url: "/soundfont/",
        overlay_class: "vextab-player"
      };

      if (options != null) { _.extend(this.options, options); }
      L(`Using soundfonts in: ${this.options.soundfont_url}`);
      this.interval_id = null;
      this.paper = null;
      this.reset();
    }

    setArtist(artist) {
      this.artist = artist;
      return this.reset();
    }

    setTempo(tempo) {
      L("New tempo: ", tempo);
      this.options.tempo = tempo;
      return this.reset();
    }

    setInstrument(instrument) {
      let needle;
      L("New instrument: ", instrument);
      if ((needle = instrument, !Array.from(_.keys(INSTRUMENTS)).includes(needle))) {
        throw new Vex.RuntimeError("PlayerError", "Invalid instrument: " + instrument);
      }
      this.options.instrument = instrument;
      return this.reset();
    }

    reset() {
      this.artist.attachPlayer(this);
      this.tick_notes = {};
      this.all_ticks = [];
      this.tpm = this.options.tempo * (RESOLUTION / 4);
      this.refresh_rate = 25; // ms: 50 = 20hz
      this.ticks_per_refresh = this.tpm / (60 * (1000/this.refresh_rate));
      this.total_ticks = 0;
      if (this.marker != null) {
        this.marker.remove();
        this.marker = null;
      }
      return this.stop();
    }

    removeControls() {
      if (this.play_button != null) { this.play_button.remove(); }
      if (this.stop_button != null) { this.stop_button.remove(); }
      if (this.paper != null) { return this.paper.view.draw(); }
    }

    render() {
      this.reset();
      const data = this.artist.getPlayerData();
      this.scale = data.scale;

      if (!this.paper) {
        const overlay = getOverlay(data.context, data.scale, this.options.overlay_class);
        this.paper = overlay.paper;
      }

      this.marker = new this.paper.Path.Rectangle(0,0,13,85);
      this.loading_message = new this.paper.PointText(35, 12);

      if (this.options.show_controls) {
        this.play_button = new this.paper.Path.RegularPolygon(new this.paper.Point(25,10), 3, 7, 7);
        this.play_button.fillColor = '#396';
        this.play_button.opacity = 0.8;
        this.play_button.rotate(90);
        this.play_button.onMouseUp = event => {
          return this.play();
        };

        this.stop_button = new this.paper.Path.Rectangle(3,3,10,10);
        this.stop_button.fillColor = '#396';
        this.stop_button.opacity = 0.8;
        this.stop_button.onMouseUp = event => {
          return this.stop();
        };
      }

      this.paper.view.draw();
      const staves = data.voices;

      const total_ticks = new Fraction(0, 1);
      for (var voice_group of Array.from(staves)) {
        var max_voice_tick = new Fraction(0, 1);
        for (var i = 0; i < voice_group.length; i++) {
          var voice = voice_group[i];
          var total_voice_ticks = new Fraction(0, 1);

          for (var note of Array.from(voice.getTickables())) {
            if (!note.shouldIgnoreTicks()) {
              var abs_tick = total_ticks.clone();
              abs_tick.add(total_voice_ticks);
              abs_tick.simplify();
              var key = abs_tick.toString();

              if (_.has(this.tick_notes, key)) {
                this.tick_notes[key].notes.push(note);
              } else {
                this.tick_notes[key] = {
                  tick: abs_tick,
                  value: abs_tick.value(),
                  notes: [note]
                };
              }

              total_voice_ticks.add(note.getTicks());
            }
          }

          if (total_voice_ticks.value() > max_voice_tick.value()) {
            max_voice_tick.copy(total_voice_ticks);
          }
        }

        total_ticks.add(max_voice_tick);
      }

      this.all_ticks = _.sortBy(_.values(this.tick_notes), tick => tick.value);
      this.total_ticks = _.last(this.all_ticks);
      return L(this.all_ticks);
    }

    updateMarker(x, y) {
      this.marker.fillColor = '#369';
      this.marker.opacity = 0.2;
      this.marker.setPosition(new this.paper.Point(x * this.scale, y * this.scale));
      return this.paper.view.draw();
    }

    playNote(notes) {
      L(`(${this.current_ticks}) playNote: `, notes);

      return (() => {
        const result = [];
        for (var note of Array.from(notes)) {
          var x = note.getAbsoluteX() + 4;
          var y = note.getStave().getYForLine(2);
          if (this.paper != null) { this.updateMarker(x, y); }
          if (note.isRest()) { continue; }

          var keys = note.getPlayNote();
          var duration = note.getTicks().value() / (this.tpm/60);
          result.push((() => {
            const result1 = [];
            for (var key of Array.from(keys)) {
              var octave;
              [note, octave] = Array.from(key.split("/"));
              note = note.trim().toLowerCase();
              var note_value = noteValues[note];
              if (note_value == null) { continue; }

              var midi_note = (24 + (octave * 12)) + noteValues[note].int_val;
              MIDI.noteOn(0, midi_note, 127, 0);
              result1.push(MIDI.noteOff(0, midi_note, duration));
            }
            return result1;
          })());
        }
        return result;
      })();
    }

    refresh() {
      if (this.done) {
        this.stop();
        return;
      }

      this.current_ticks += this.ticks_per_refresh;

      if ((this.current_ticks >= this.next_event_tick) && (this.all_ticks.length > 0)) {
        this.playNote(this.all_ticks[this.next_index].notes);
        this.next_index++;
        if (this.next_index >= this.all_ticks.length) {
          return this.done = true;
        } else {
          return this.next_event_tick = this.all_ticks[this.next_index].tick.value();
        }
      }
    }

    stop() {
      L("Stop");
      if (this.interval_id != null) { window.clearInterval(this.interval_id); }
      if (this.play_button != null) { this.play_button.fillColor = '#396'; }
      if (this.paper != null) { this.paper.view.draw(); }
      this.interval_id = null;
      this.current_ticks = 0;
      this.next_event_tick = 0;
      this.next_index = 0;
      return this.done = false;
    }

    start() {
      this.stop();
      L("Start");
      if (this.play_button != null) { this.play_button.fillColor = '#a36'; }
      MIDI.programChange(0, INSTRUMENTS[this.options.instrument]);
      this.render(); // try to update, maybe notes were changed dynamically
      return this.interval_id = window.setInterval((() => this.refresh()), this.refresh_rate);
    }

    play() {
      L("Play: ", this.refresh_rate, this.ticks_per_refresh);
      if (Vex.Flow.Player.INSTRUMENTS_LOADED[this.options.instrument] && !this.loading) {
        return this.start();
      } else {
        L("Loading instruments...");
        this.loading_message.content = "Loading instruments...";
        this.loading_message.fillColor = "green";
        this.loading = true;
        this.paper.view.draw();

        return MIDI.loadPlugin({
          soundfontUrl: this.options.soundfont_url,
          instruments: [this.options.instrument],
          callback: () => {
            Vex.Flow.Player.INSTRUMENTS_LOADED[this.options.instrument] = true;
            this.loading = false;
            this.loading_message.content = "";
            return this.start();
          }
        });
      }
    }
  });
  Cls.initClass();
  return Cls;
})();
