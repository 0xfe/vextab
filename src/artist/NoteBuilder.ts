// Note creation and expansion logic for tab/notation, including chords and rests.
import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from './Artist';

/**
 * NoteBuilder handles note creation, durations, rests, and chord expansion.
 * It is intentionally stateful and mutates the parent Artist state directly.
 */
export class NoteBuilder {
  // Shared Artist state for tuning, key, and layout options.
  private artist: Artist;

  /**
   * Create a note builder bound to an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  /**
   * Given a fret/string pair, return note name, octave, and accidental.
   * Design note: this uses the Artist key manager to respect the current key.
   */
  getNoteForFret(fret: string, string: number): [string, string | number, string | null] {
    const spec = this.artist.tuning.getNoteForFret(fret, string);
    const spec_props = Vex.Flow.keyProperties(spec);

    // Use the key manager to select the canonical spelling for the current key.
    const selected_note = this.artist.key_manager.selectNote(spec_props.key);
    let accidental: string | null = null;

    // Determine explicit accidentals based on custom strategy.
    switch (this.artist.customizations.accidentals) {
      case 'standard':
        if (selected_note.change) {
          accidental = selected_note.accidental ? selected_note.accidental : 'n';
        }
        break;
      case 'cautionary':
        if (selected_note.change) {
          accidental = selected_note.accidental ? selected_note.accidental : 'n';
        } else {
          accidental = selected_note.accidental ? `${selected_note.accidental}_c` : null;
        }
        break;
      default:
        throw new Vex.RERR(
          'ArtistError',
          `Invalid value for option 'accidentals': ${this.artist.customizations.accidentals}`,
        );
    }

    let new_note = selected_note.note;
    let new_octave = spec_props.octave;

    // Adjust octave when the key manager changes the root letter.
    const old_root = this.artist.music_api.getNoteParts(spec_props.key).root;
    const new_root = this.artist.music_api.getNoteParts(selected_note.note).root;
    if (new_root === 'b' && old_root === 'c') {
      new_octave -= 1;
    } else if (new_root === 'c' && old_root === 'b') {
      new_octave += 1;
    }

    return [new_note, new_octave, accidental];
  }

  /**
   * Convert ABC-style note data into a note name, octave, and accidental.
   */
  getNoteForABC(abc: any, string: number): [string, number, string | null] {
    // ABC notes provide a direct note name; octave is derived from the string index.
    const key = abc.key;
    const octave = string;
    let accidental = abc.accidental;
    if (abc.accidental_type) {
      accidental += `_${abc.accidental_type}`;
    }
    return [key, octave, accidental];
  }

  /**
   * Add a notation (staff) note, with accidentals and optional playback pitch.
   */
  addStaveNote(note_params: any): void {
    // Normalize input and default to non-rest notes.
    const params = {
      is_rest: false,
      play_note: null,
      ...note_params,
    };

    const stave_notes = _.last(this.artist.staves)!.note_notes;
    const stave_note = new Vex.Flow.StaveNote({
      keys: params.spec,
      duration: this.artist.current_duration + (params.is_rest ? 'r' : ''),
      clef: params.is_rest ? 'treble' : this.artist.current_clef,
      auto_stem: params.is_rest ? false : true,
    });

    // Attach accidentals per note head.
    params.accidentals.forEach((acc: string | null, index: number) => {
      if (!acc) return;
      const parts = acc.split('_');
      const new_accidental = new Vex.Flow.Accidental(parts[0]);
      if (parts.length > 1 && parts[1] === 'c') {
        new_accidental.setAsCautionary();
      }

      if (typeof stave_note.addAccidental === 'function') {
        stave_note.addAccidental(index, new_accidental);
      } else if (typeof stave_note.addModifier === 'function') {
        stave_note.addModifier(new_accidental, index);
      }
    });

    // VexFlow uses a dotted flag in the duration string.
    if (this.artist.current_duration.endsWith('d')) {
      Vex.Flow.Dot.buildAndAttach([stave_note], { all: true });
    }

    // Playback pitch is optional and only used when Player is enabled.
    if (params.play_note) {
      stave_note.setPlayNote(params.play_note);
    }

    stave_notes.push(stave_note);
  }

  /**
   * Add a tablature note (TabNote) with optional playback pitches.
   */
  addTabNote(spec: any, play_note: any = null): void {
    // Tab notes are built from positions and the current duration.
    const tab_notes = _.last(this.artist.staves)!.tab_notes;
    const new_tab_note = new Vex.Flow.TabNote(
      {
        positions: spec,
        duration: this.artist.current_duration,
      },
      this.artist.customizations['tab-stems'] === 'true',
    );

    // Playback pitch is optional and only used when Player is enabled.
    if (play_note) {
      new_tab_note.setPlayNote(play_note);
    }

    tab_notes.push(new_tab_note);

    // Dotted notes need an explicit dot glyph on tab notes.
    if (this.artist.current_duration.endsWith('d')) {
      Vex.Flow.Dot.buildAndAttach([new_tab_note], { all: true });
    }
  }

  /**
   * Create a VexFlow duration string including a dotted flag.
   */
  private makeDuration(time: string, dot?: boolean): string {
    return `${time}${dot ? 'd' : ''}`;
  }

  /**
   * Update the current duration used for subsequent notes.
   */
  setDuration(time: string, dot = false): void {
    // Support "q" or "q ." style tokens from the parser.
    const t = time.split(/\s+/);
    this.artist.log('setDuration: ', t[0], dot);
    this.artist.current_duration = this.makeDuration(t[0], dot);
  }

  /**
   * Add a rest into both tab and notation staves.
   */
  addRest(params: Record<string, string>): void {
    this.artist.log('addRest: ', params);
    this.artist.closeBends();

    const position_value = parseInt(String(params.position), 10);
    // Position 0 uses a generic rest marker; other positions use a placeholder pitch.
    if (position_value === 0) {
      this.addStaveNote({
        spec: ['r/4'],
        accidentals: [],
        is_rest: true,
      });
    } else {
      const position = this.artist.tuning.getNoteForFret((position_value + 5) * 2, 6);
      this.addStaveNote({
        spec: [position],
        accidentals: [],
        is_rest: true,
      });
    }

    const tab_notes = _.last(this.artist.staves)!.tab_notes;
    if (this.artist.customizations['tab-stems'] === 'true') {
      // With tab stems enabled, render rests as stave notes for consistent stems.
      const tab_note = new Vex.Flow.StaveNote({
        keys: [position_value === 0 ? 'r/4' : this.artist.tuning.getNoteForFret((position_value + 5) * 2, 6)],
        duration: `${this.artist.current_duration}r`,
        clef: 'treble',
        auto_stem: false,
      });
      if (this.artist.current_duration.endsWith('d')) {
        Vex.Flow.Dot.buildAndAttach([tab_note], { all: true });
      }
      tab_notes.push(tab_note);
    } else {
      // Ghost notes maintain spacing without rendering a glyph.
      tab_notes.push(new Vex.Flow.GhostNote(this.artist.current_duration));
    }
  }

  /**
   * Expand a chord into multiple notes across strings/positions and add them.
   * Design note: chords can represent stacked notes on the same string, so we
   * track "positions" per string to keep multi-stop logic intact.
   */
  addChord(chord: any[], chord_articulation: string | null, chord_decorator: string | null): void {
    if (_.isEmpty(chord)) return;
    this.artist.log('addChord: ', chord);
    const stave = _.last(this.artist.staves)!;

    // Per-position arrays track stacked chord notes on the same string.
    const specs: string[][] = [];
    const play_notes: string[][] = [];
    const accidentals: Array<Array<string | null>> = [];
    const articulations: Array<Array<string | null>> = [];
    const decorators: Array<string | null> = [];
    const tab_specs: any[][] = [];
    const durations: Array<{ time: string; dot: boolean } | null> = [];

    // Track chord size so global articulations can be fanned out.
    let num_notes = 0;
    let current_string = chord[0].string;
    let current_position = 0;

    chord.forEach((note) => {
      num_notes += 1;
      if (note.abc || note.string !== current_string) {
        current_position = 0;
        current_string = note.string;
      }

      // Initialize per-position arrays on first use.
      if (!specs[current_position]) {
        specs[current_position] = [];
        play_notes[current_position] = [];
        accidentals[current_position] = [];
        tab_specs[current_position] = [];
        articulations[current_position] = [];
        decorators[current_position] = null;
      }

      let new_note: string | null = null;
      let new_octave: string | number | null = null;
      let accidental: string | null = null;
      let play_note: string | null = null;

      if (note.abc) {
        // ABC notes carry a pitch name; the octave is derived.
        const octave = note.octave ? note.octave : note.string;
        [new_note, new_octave, accidental] = this.getNoteForABC(note.abc, octave);
        const acc = accidental ? accidental.split('_')[0] : '';
        play_note = `${new_note}${acc}`;
        if (!note.fret) {
          note.fret = 'X';
        }
      } else if (note.fret) {
        // Tab notes are translated through the tuning map.
        [new_note, new_octave, accidental] = this.getNoteForFret(note.fret, note.string);
        play_note = this.artist.tuning.getNoteForFret(note.fret, note.string).split('/')[0];
      } else {
        throw new Vex.RERR('ArtistError', 'No note specified');
      }

      // Apply any octave shift commands to the playback pitch.
      const play_octave = parseInt(String(new_octave), 10) + this.artist.current_octave_shift;

      const current_duration = note.time ? { time: note.time, dot: note.dot } : null;
      specs[current_position].push(`${new_note}/${new_octave}`);
      play_notes[current_position].push(`${play_note}/${play_octave}`);
      accidentals[current_position].push(accidental);
      tab_specs[current_position].push({ fret: note.fret, str: note.string });
      if (note.articulation) {
        articulations[current_position].push(note.articulation);
      } else {
        articulations[current_position].push(null);
      }
      durations[current_position] = current_duration;
      if (note.decorator) {
        decorators[current_position] = note.decorator;
      }

      current_position += 1;
    });

    // Emit notes position by position so formatting and articulations align.
    specs.forEach((spec, i) => {
      if (durations[i]) {
        this.setDuration(durations[i]!.time, durations[i]!.dot);
      }
      this.addTabNote(tab_specs[i], play_notes[i]);
      if (stave.note) {
        this.addStaveNote({ spec, accidentals: accidentals[i], play_note: play_notes[i] });
      }
      this.artist.addArticulations(articulations[i]);
      if (decorators[i]) {
        this.artist.addDecorator(decorators[i]);
      }
    });

    if (chord_articulation) {
      // Fan out a single articulation to each note in the chord.
      const art: string[] = [];
      for (let i = 0; i < num_notes; i += 1) art.push(chord_articulation);
      this.artist.addArticulations(art);
    }

    if (chord_decorator) {
      this.artist.addDecorator(chord_decorator);
    }
  }

  /**
   * Convenience wrapper for adding a single note as a one-note chord.
   */
  addNote(note: any): void {
    this.addChord([note], null, null);
  }
}
