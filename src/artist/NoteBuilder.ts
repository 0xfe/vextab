import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from './Artist';

/**
 * NoteBuilder handles note creation, durations, rests, and chord expansion.
 * It is intentionally stateful and mutates the parent Artist state directly.
 */
export class NoteBuilder {
  private artist: Artist;

  constructor(artist: Artist) {
    this.artist = artist;
  }

  // Given a fret/string pair, returns a note, octave, and required accidentals
  // based on current guitar tuning and stave key.
  getNoteForFret(fret: string, string: number): [string, string | number, string | null] {
    const spec = this.artist.tuning.getNoteForFret(fret, string);
    const spec_props = Vex.Flow.keyProperties(spec);

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

    // Key manager can force octave changes based on root note.
    const old_root = this.artist.music_api.getNoteParts(spec_props.key).root;
    const new_root = this.artist.music_api.getNoteParts(selected_note.note).root;
    if (new_root === 'b' && old_root === 'c') {
      new_octave -= 1;
    } else if (new_root === 'c' && old_root === 'b') {
      new_octave += 1;
    }

    return [new_note, new_octave, accidental];
  }

  getNoteForABC(abc: any, string: number): [string, number, string | null] {
    const key = abc.key;
    const octave = string;
    let accidental = abc.accidental;
    if (abc.accidental_type) {
      accidental += `_${abc.accidental_type}`;
    }
    return [key, octave, accidental];
  }

  addStaveNote(note_params: any): void {
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

    if (this.artist.current_duration.endsWith('d')) {
      Vex.Flow.Dot.buildAndAttach([stave_note], { all: true });
    }

    if (params.play_note) {
      stave_note.setPlayNote(params.play_note);
    }

    stave_notes.push(stave_note);
  }

  addTabNote(spec: any, play_note: any = null): void {
    const tab_notes = _.last(this.artist.staves)!.tab_notes;
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

    tab_notes.push(new_tab_note);

    if (this.artist.current_duration.endsWith('d')) {
      Vex.Flow.Dot.buildAndAttach([new_tab_note], { all: true });
    }
  }

  private makeDuration(time: string, dot?: boolean): string {
    return `${time}${dot ? 'd' : ''}`;
  }

  setDuration(time: string, dot = false): void {
    const t = time.split(/\s+/);
    this.artist.log('setDuration: ', t[0], dot);
    this.artist.current_duration = this.makeDuration(t[0], dot);
  }

  addRest(params: Record<string, string>): void {
    this.artist.log('addRest: ', params);
    this.artist.closeBends();

    const position_value = parseInt(String(params.position), 10);
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
      tab_notes.push(new Vex.Flow.GhostNote(this.artist.current_duration));
    }
  }

  addChord(chord: any[], chord_articulation: string | null, chord_decorator: string | null): void {
    if (_.isEmpty(chord)) return;
    this.artist.log('addChord: ', chord);
    const stave = _.last(this.artist.staves)!;

    const specs: string[][] = [];
    const play_notes: string[][] = [];
    const accidentals: Array<Array<string | null>> = [];
    const articulations: Array<Array<string | null>> = [];
    const decorators: Array<string | null> = [];
    const tab_specs: any[][] = [];
    const durations: Array<{ time: string; dot: boolean } | null> = [];

    let num_notes = 0;

    // Chords can contain multiple lines per string; track motion per line.
    let current_string = chord[0].string;
    let current_position = 0;

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

      let new_note: string | null = null;
      let new_octave: string | number | null = null;
      let accidental: string | null = null;
      let play_note: string | null = null;

      if (note.abc) {
        const octave = note.octave ? note.octave : note.string;
        [new_note, new_octave, accidental] = this.getNoteForABC(note.abc, octave);
        const acc = accidental ? accidental.split('_')[0] : '';
        play_note = `${new_note}${acc}`;
        if (!note.fret) {
          note.fret = 'X';
        }
      } else if (note.fret) {
        [new_note, new_octave, accidental] = this.getNoteForFret(note.fret, note.string);
        play_note = this.artist.tuning.getNoteForFret(note.fret, note.string).split('/')[0];
      } else {
        throw new Vex.RERR('ArtistError', 'No note specified');
      }

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
      const art: string[] = [];
      for (let i = 0; i < num_notes; i += 1) art.push(chord_articulation);
      this.artist.addArticulations(art);
    }

    if (chord_decorator) {
      this.artist.addDecorator(chord_decorator);
    }
  }

  addNote(note: any): void {
    this.addChord([note], null, null);
  }
}
