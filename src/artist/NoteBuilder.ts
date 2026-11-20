// Note creation and expansion logic for tab/notation, including chords and rests.
import { Accidental, Fraction, Music, StaveNote, WrittenAccidentalState } from 'vexflow';
import Vex from '../vexflow';
import { drumKit } from '../score/drums';
import { fixedHeads } from '../playback/performance';
import { describePrebend, makePrebend, spellFret } from '../score/music';
import * as _ from '../utils';
import type Artist from './Artist';
import type { StaveGroup } from './Artist';

/** A written sign belongs to one head, even if engraving reorders the chord. */
interface HeadSign {
  key: string;
  sign: string;
  literal: boolean;
  cautionary: boolean;
  mark?: Accidental;
}

/**
 * NoteBuilder handles note creation, durations, rests, and chord expansion.
 * It is intentionally stateful and mutates the parent Artist state directly.
 */
export class NoteBuilder {
  // Shared Artist state for tuning, key, and layout options.
  private artist: Artist;
  private signs = new WeakMap<StaveNote, (HeadSign | null)[]>();

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
    return spellFret(this.artist.tuning, this.artist.key_manager, this.artist.music_api, fret, string);
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
      accidental = `${accidental || 'n'}_${abc.accidental_type}`;
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
      duration: this.artist.current_duration,
      type: this.artist.current_head,
      clef: this.artist.current_clef,
      autoStem: true,
    });

    this.signs.set(stave_note, params.signs);

    // VexFlow uses a dotted flag in the duration string.
    this.attachDots(stave_note);

    // Playback pitch is optional and only used when Player is enabled.
    if (params.play_note) {
      stave_note.setPlayNote(params.play_note);
    }

    stave_notes.push(stave_note);
  }

  /** Resolve signs in musical time. A barline in any voice resets the staff. */
  applyAccidentals(group: StaveGroup): void {
    const signature: Record<string, string> = {};
    for (const [name, pitch] of Object.entries(new Music().createScaleMap(group.key))) {
      signature[name] = pitch.slice(1) || 'n';
    }
    const state = new WrittenAccidentalState(signature);
    const onsets = new Map<string, { at: Fraction; bar: boolean; notes: StaveNote[] }>();
    for (const voice of group.note_voices) {
      const time = new Fraction(0, 1);
      for (const note of voice) {
        const id = time.clone().simplify().toString();
        let onset = onsets.get(id);
        if (!onset) {
          onset = { at: time.clone(), bar: false, notes: [] };
          onsets.set(id, onset);
        }
        if (note instanceof Vex.Flow.BarNote) onset.bar = true;
        else {
          if (this.signs.has(note)) onset.notes.push(note);
          time.add(note.getTicks());
        }
      }
    }
    for (const onset of [...onsets.values()].sort((a, b) => a.at.value() - b.at.value())) {
      if (onset.bar) state.reset();
      // Decide simultaneous unisons together, including conflicting written signs.
      const pitches = new Map<string, { head: HeadSign; note: StaveNote; index: number }[]>();
      for (const note of onset.notes) {
        this.signs.get(note)!.forEach((head, index) => {
          if (!head) return;
          const entries = pitches.get(head.key) ?? [];
          entries.push({ head, note, index });
          pitches.set(head.key, entries);
        });
      }
      for (const [key, entries] of pitches) {
        const sign = entries[0].head.sign;
        const conflict = entries.some(entry => entry.head.sign !== sign);
        const changed = state.sign(key, conflict ? 'ambiguous' : sign) !== undefined;
        for (const { head, note, index } of entries) {
          this.updateSign(note, index, head, changed || conflict);
        }
      }
    }
  }

  /** Reuse the sign across draws. An edit can change which sign a later voice needs. */
  private updateSign(note: StaveNote, index: number, head: HeadSign, changed: boolean): void {
    const caution = head.cautionary && (head.literal || !changed);
    const show = head.literal || changed || caution;
    if (head.mark && (!show || head.mark.isCautionary() !== caution)) {
      const modifiers = note.getModifiers();
      const previous = modifiers.indexOf(head.mark);
      if (previous >= 0) modifiers.splice(previous, 1);
      delete head.mark;
    }
    if (show && !head.mark) {
      head.mark = new Accidental(head.sign);
      if (caution) head.mark.setAsCautionary();
      note.addModifier(head.mark, index);
    }
  }

  /**
   * Add a tablature note (TabNote) with optional playback pitches.
   */
  addTabNote(spec: any, play_note: any = null): void {
    // Tab notes are built from positions and the current duration.
    const tab_notes = _.last(this.artist.staves)!.tab_notes;
    this.artist.stavesBuilder.reserveTabRhythmSpace();
    const new_tab_note = new Vex.Flow.TabNote(
      {
        positions: spec.map(({ str, fret }) => ({ str, fret })),
        duration: this.artist.current_duration,
      },
      this.artist.customizations['tab-stems'] === 'true',
    );

    // Playback pitch is optional and only used when Player is enabled.
    if (play_note) {
      new_tab_note.setPlayNote(play_note);
    }

    spec.forEach(({ prebend }, index) => {
      if (prebend) new_tab_note.addModifier(makePrebend(prebend), index);
    });
    tab_notes.push(new_tab_note);

    // Dotted notes need an explicit dot glyph on tab notes.
    this.attachDots(new_tab_note);
  }

  /** Draw one dot per augmentation on every head of the attack. */
  private attachDots(note: any): void {
    for (let i = 0; i < this.artist.current_dots; i++) {
      // A tab chord has one rhythmic stem and no VexFlow pitch keys.
      Vex.Flow.Dot.buildAndAttach([note], note instanceof Vex.Flow.TabNote ? { index: 0 } : { all: true });
    }
  }

  /** Keep slash heads separate from the rhythmic value shared with tab and text. */
  setDuration(time: string, dot: boolean | number = false): void {
    const match = /^(\d+|[whq])(s?)(d*)$/i.exec(time.trim());
    if (!match) throw new Vex.RERR('ArtistError', `Invalid duration '${time}'`);
    const dots = Number(dot) || match[3].length;
    this.artist.current_dots = dots;
    this.artist.current_head = match[2] ? 's' : 'n';
    this.artist.current_duration = match[1] + 'd'.repeat(dots);
  }

  /** Add one kit attack. A timing spacer keeps the fixed Artist's parallel voice arrays aligned. */
  addDrums(ids: string[]): void {
    const stave = _.last(this.artist.staves)!;
    const duration = this.artist.current_duration;
    const note = new StaveNote(drumKit.note(ids, duration));
    this.attachDots(note);
    stave.note_notes.push(note);
    stave.tab_notes.push(new Vex.Flow.GhostNote(duration));
    fixedHeads.set(note, []);
  }

  /** Position rests in staff coordinates. ## leaves the default line to VexFlow. */
  addRest(params: Record<string, string>): void {
    this.artist.closeBends();
    const stave = _.last(this.artist.staves)!;
    this.artist.stavesBuilder.reserveTabRhythmSpace();
    const positioned = params.explicit || Number(params.position) !== 0;
    const makeRest = (target: any) => {
      const rest = new StaveNote({ keys: ['r/4'], duration: this.artist.current_duration, type: 'r' });
      rest.setStave(target);
      if (positioned) {
        // Positions 1–8 ascend from the bottom line in half-spaces.
        // 0 and 9 anchor on the adjacent ledger lines, with further positions beyond.
        const position = Number(params.position);
        const lines = target.getNumLines();
        const bottom = 6 - lines;
        const above = 2 * lines - 1;
        let line = bottom + (position - 1) / 2;
        if (position <= 0) line = bottom - 1 + position / 2;
        if (position >= above) line = 6 + (position - above) / 2;
        rest.setRestLine(line);
      }
      this.attachDots(rest);
      return rest;
    };
    if (stave.note) stave.note_notes.push(makeRest(stave.note));
    stave.tab_notes.push(stave.tab && this.artist.customizations['tab-stems'] === 'true'
      ? makeRest(stave.tab) : new Vex.Flow.GhostNote(this.artist.current_duration));
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
    const sounding: string[][] = [];
    const signs: Array<Array<HeadSign | null>> = [];
    const articulations: Array<Array<string | null>> = [];
    const decorators: Array<string | null> = [];
    const tab_specs: any[][] = [];
    const durations: Array<{ time: string; dot: boolean | number } | null> = [];

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
        sounding[current_position] = [];
        signs[current_position] = [];
        tab_specs[current_position] = [];
        articulations[current_position] = [];
        decorators[current_position] = null;
      }

      let new_note: string | null = null;
      let new_octave: string | number | null = null;
      let accidental: string | null = null;
      let play_note: string | null = null;
      let fretOctave: number | undefined;

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
        const attackFret = note.prebend ? String(Number(note.fret) + note.prebend.semitones) : note.fret;
        [new_note, new_octave, accidental] = this.getNoteForFret(attackFret, note.string);
        const [pitch, octave] = this.artist.tuning.getNoteForFret(attackFret, note.string).split('/');
        play_note = pitch;
        // Guitar tuning gives written pitches one octave above the sounding fret.
        fretOctave = Number(octave) - 1;
      } else {
        throw new Vex.RERR('ArtistError', 'No note specified');
      }

      // Apply any octave shift commands to the playback pitch.
      const play_octave = parseInt(String(new_octave), 10) + this.artist.current_octave_shift;

      const current_duration = note.time ? { time: note.time, dot: note.dot } : null;
      const sign = accidental?.split('_')[0];
      const written = note.abc && sign && sign !== 'n' ? new_note + sign : new_note;
      specs[current_position].push(`${written}/${new_octave}`);
      const soundingOctave = (fretOctave ?? Number(new_octave)) + this.artist.current_octave_shift;
      play_notes[current_position].push(`${play_note}/${play_octave}`);
      sounding[current_position].push(`${play_note}/${soundingOctave}`);
      signs[current_position].push(sign && /^[a-g]/i.test(new_note) ? {
        key: `${new_note[0].toLowerCase()}/${new_octave}`, sign,
        literal: !!note.abc,
        cautionary: note.abc ? note.abc.accidental_type === 'c'
          : this.artist.customizations.accidentals === 'cautionary' && sign !== 'n',
      } : null);
      tab_specs[current_position].push({ fret: note.fret, str: note.string, prebend: note.prebend });
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
        this.addStaveNote({ spec, signs: signs[i], play_note: play_notes[i] });
        if (!stave.tab) {
          const instructions = tab_specs[i].filter(p => p.prebend).map(p => describePrebend(p.prebend, p.str));
          if (instructions.length) {
            const mark = new Vex.Flow.Annotation(instructions.join(' · '));
            mark.setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.TOP);
            _.last(stave.note_notes).addModifier(mark, 0);
          }
        }
      }
      const heads = sounding[i].map((key, index) => {
        const bend = tab_specs[i][index].prebend;
        return { key, release: bend?.release ? bend.semitones : 0 };
      });
      fixedHeads.set(_.last(stave.tab_notes), heads);
      if (stave.note) fixedHeads.set(_.last(stave.note_notes), heads);
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
