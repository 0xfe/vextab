// src/artist/NoteBuilder.ts
// Note creation and expansion logic for tab/notation, including chords and rests.

import Vex from '../vexflow'; // VexFlow shim for note classes.
import * as _ from '../utils'; // Utility helpers for list manipulation.
import type Artist from './Artist'; // Artist type for shared state.

/**
 * NoteBuilder handles note creation, durations, rests, and chord expansion.
 * It is intentionally stateful and mutates the parent Artist state directly.
 */
export class NoteBuilder {
  private artist: Artist; // Owning Artist instance with state and customizations.

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
    const spec = this.artist.tuning.getNoteForFret(fret, string); // Raw note string (e.g., c/4).
    const spec_props = Vex.Flow.keyProperties(spec); // Parsed pitch metadata.

    const selected_note = this.artist.key_manager.selectNote(spec_props.key); // Adjusted note for key.
    let accidental: string | null = null; // Accidental marker to display.

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

    let new_note = selected_note.note; // Final note name after key adjustment.
    let new_octave = spec_props.octave; // Octave from the tuning spec.

    // Key manager can force octave changes based on root note.
    const old_root = this.artist.music_api.getNoteParts(spec_props.key).root; // Original root.
    const new_root = this.artist.music_api.getNoteParts(selected_note.note).root; // Adjusted root.
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
    const key = abc.key; // Note name from the ABC token.
    const octave = string; // Octave is provided by caller.
    let accidental = abc.accidental; // Base accidental (if any).
    if (abc.accidental_type) {
      accidental += `_${abc.accidental_type}`;
    }
    return [key, octave, accidental];
  }

  /**
   * Add a notation (staff) note, with accidentals and optional playback pitch.
   */
  addStaveNote(note_params: any): void {
    const params = {
      is_rest: false,
      play_note: null,
      ...note_params,
    };

    const stave_notes = _.last(this.artist.staves)!.note_notes; // Current notation note list.
    const stave_note = new Vex.Flow.StaveNote({
      keys: params.spec,
      duration: this.artist.current_duration + (params.is_rest ? 'r' : ''),
      clef: params.is_rest ? 'treble' : this.artist.current_clef,
      auto_stem: params.is_rest ? false : true,
    });

    params.accidentals.forEach((acc: string | null, index: number) => {
      if (!acc) return;
      const parts = acc.split('_'); // Split accidental + optional cautionary flag.
      const new_accidental = new Vex.Flow.Accidental(parts[0]); // VexFlow accidental glyph.
      if (parts.length > 1 && parts[1] === 'c') {
        new_accidental.setAsCautionary();
      }

      if (typeof stave_note.addAccidental === 'function') {
        stave_note.addAccidental(index, new_accidental);
      } else if (typeof stave_note.addModifier === 'function') {
        stave_note.addModifier(new_accidental, index);
      }
    });

    if (this.artist.current_duration.endsWith('d')) {
      Vex.Flow.Dot.buildAndAttach([stave_note], { all: true });
    }

    if (params.play_note) {
      stave_note.setPlayNote(params.play_note);
    }

    stave_notes.push(stave_note); // Append to the current stave's notes.
  }

  /**
   * Add a tablature note (TabNote) with optional playback pitches.
   */
  addTabNote(spec: any, play_note: any = null): void {
    const tab_notes = _.last(this.artist.staves)!.tab_notes; // Current tab note list.
    const new_tab_note = new Vex.Flow.TabNote(
      {
        positions: spec,
        duration: this.artist.current_duration,
      },
      this.artist.customizations['tab-stems'] === 'true',
    );

    if (play_note) {
      new_tab_note.setPlayNote(play_note);
    }

    tab_notes.push(new_tab_note); // Append to the tab notes list.

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
    const t = time.split(/\s+/); // Support "q" or "q ."-style tokens.
    this.artist.log('setDuration: ', t[0], dot);
    this.artist.current_duration = this.makeDuration(t[0], dot);
  }

  /**
   * Add a rest into both tab and notation staves.
   */
  addRest(params: Record<string, string>): void {
    this.artist.log('addRest: ', params);
    this.artist.closeBends();

    const position_value = parseInt(String(params.position), 10); // Rest placement in stave lines.
    if (position_value === 0) {
      this.addStaveNote({
        spec: ['r/4'],
        accidentals: [],
        is_rest: true,
      });
    } else {
      const position = this.artist.tuning.getNoteForFret((position_value + 5) * 2, 6); // Derive placeholder pitch.
      this.addStaveNote({
        spec: [position],
        accidentals: [],
        is_rest: true,
      });
    }

    const tab_notes = _.last(this.artist.staves)!.tab_notes; // Tab notes list for rest insertion.
    if (this.artist.customizations['tab-stems'] === 'true') {
      const tab_note = new Vex.Flow.StaveNote({
        keys: [position_value === 0 ? 'r/4' : this.artist.tuning.getNoteForFret((position_value + 5) * 2, 6)],
        duration: `${this.artist.current_duration}r`,
        clef: 'treble',
        auto_stem: false,
      });
      if (this.artist.current_duration.endsWith('d')) {
        Vex.Flow.Dot.buildAndAttach([tab_note], { all: true });
      }
      tab_notes.push(tab_note); // Use a stave note to show rest with stems.
    } else {
      tab_notes.push(new Vex.Flow.GhostNote(this.artist.current_duration)); // Ghost note for tab rest spacing.
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
    const stave = _.last(this.artist.staves)!; // Current stave group.

    const specs: string[][] = []; // Notation note specs per chord position.
    const play_notes: string[][] = []; // Playback pitch strings per position.
    const accidentals: Array<Array<string | null>> = []; // Accidental lists per position.
    const articulations: Array<Array<string | null>> = []; // Articulations per position.
    const decorators: Array<string | null> = []; // Decorators per position.
    const tab_specs: any[][] = []; // Tab positions per chord position.
    const durations: Array<{ time: string; dot: boolean } | null> = []; // Per-position duration overrides.

    let num_notes = 0; // Count of notes in the chord (for articulation fan-out).

    // Chords can contain multiple lines per string; track motion per line.
    let current_string = chord[0].string; // Track current string for stacked chord parsing.
    let current_position = 0; // Position index within the chord stack.

    chord.forEach((note) => {
      num_notes += 1;
      if (note.abc || note.string !== current_string) {
        current_position = 0;
        current_string = note.string;
      }

      if (!specs[current_position]) {
        specs[current_position] = [];
        play_notes[current_position] = [];
        accidentals[current_position] = [];
        tab_specs[current_position] = [];
        articulations[current_position] = [];
        decorators[current_position] = null;
      }

      let new_note: string | null = null; // Note name for notation.
      let new_octave: string | number | null = null; // Octave for notation.
      let accidental: string | null = null; // Accidental marker.
      let play_note: string | null = null; // Playback pitch (without octave).

      if (note.abc) {
        const octave = note.octave ? note.octave : note.string; // ABC note octave selection.
        [new_note, new_octave, accidental] = this.getNoteForABC(note.abc, octave);
        const acc = accidental ? accidental.split('_')[0] : ''; // Strip cautionary suffix.
        play_note = `${new_note}${acc}`; // Playback note without octave.
        if (!note.fret) {
          note.fret = 'X';
        }
      } else if (note.fret) {
        [new_note, new_octave, accidental] = this.getNoteForFret(note.fret, note.string);
        play_note = this.artist.tuning.getNoteForFret(note.fret, note.string).split('/')[0]; // Tuning-derived playback note.
      } else {
        throw new Vex.RERR('ArtistError', 'No note specified');
      }

      const play_octave = parseInt(String(new_octave), 10) + this.artist.current_octave_shift; // Apply octave shift.

      const current_duration = note.time ? { time: note.time, dot: note.dot } : null; // Optional duration override.
      specs[current_position].push(`${new_note}/${new_octave}`); // Notation spec.
      play_notes[current_position].push(`${play_note}/${play_octave}`); // Playback pitch.
      accidentals[current_position].push(accidental); // Accidental list.
      tab_specs[current_position].push({ fret: note.fret, str: note.string }); // Tab position.
      if (note.articulation) {
        articulations[current_position].push(note.articulation);
      } else {
        articulations[current_position].push(null);
      }
      durations[current_position] = current_duration; // Capture duration override for this position.
      if (note.decorator) {
        decorators[current_position] = note.decorator;
      }

      current_position += 1;
    });

    specs.forEach((spec, i) => {
      if (durations[i]) {
        this.setDuration(durations[i]!.time, durations[i]!.dot);
      }
      this.addTabNote(tab_specs[i], play_notes[i]); // Add tab note for this position.
      if (stave.note) {
        this.addStaveNote({ spec, accidentals: accidentals[i], play_note: play_notes[i] }); // Add notation note.
      }
      this.artist.addArticulations(articulations[i]); // Apply articulations.
      if (decorators[i]) {
        this.artist.addDecorator(decorators[i]);
      }
    });

    if (chord_articulation) {
      const art: string[] = []; // Fan-out articulation to each chord note.
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
