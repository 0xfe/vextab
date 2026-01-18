// src/artist/ArticulationBuilder.ts
// Modifier pipeline for articulations, bends, tuplets, annotations, and special glyphs.

import Vex from '../vexflow'; // VexFlow shim for modifier classes.
import * as _ from '../utils'; // Utility helpers for collections.
import type Artist from './Artist'; // Artist type for shared state access.

/**
 * Handles articulations, annotations, tuplets, bends, and other note modifiers.
 * This file centralizes modifier logic so rendering/notation code stays focused.
 */
export class ArticulationBuilder {
  private artist: Artist; // Owning Artist instance.

  /**
   * Create a modifier builder bound to an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  // ---- Bends ----

  /**
   * Build a bend descriptor between two frets.
   */
  private makeBend(from_fret: string, to_fret: string): { type: number; text: string } {
    let direction = Vex.Flow.Bend.UP; // Default to upward bend.
    let text = ''; // Display text for the bend amount.

    if (parseInt(from_fret, 10) > parseInt(to_fret, 10)) {
      direction = Vex.Flow.Bend.DOWN;
    } else {
      switch (Math.abs(parseInt(to_fret, 10) - parseInt(from_fret, 10))) {
        case 1:
          text = '1/2';
          break;
        case 2:
          text = 'Full';
          break;
        case 3:
          text = '1 1/2';
          break;
        default:
          text = `Bend to ${to_fret}`;
          break;
      }
    }

    return { type: direction, text };
  }

  /**
   * Start or extend a bend phrase across notes.
   */
  openBends(first_note: any, last_note: any, first_indices: number[], last_indices: number[]): void {
    this.artist.log('openBends', first_note, last_note, first_indices, last_indices);
    const tab_notes = _.last(this.artist.staves)!.tab_notes; // Current tab notes.

    let start_note = first_note; // Default bend start.
    let start_indices = first_indices; // Default bend start indices.

    if (_.isEmpty(this.artist.current_bends)) {
      this.artist.bend_start_index = tab_notes.length - 2;
      this.artist.bend_start_strings = first_indices;
    } else {
      start_note = tab_notes[this.artist.bend_start_index as number];
      start_indices = this.artist.bend_start_strings as number[];
    }

    const start_frets = start_note.getPositions(); // Start note positions.
    const last_frets = last_note.getPositions(); // End note positions.
    start_indices.forEach((index, i) => {
      const last_index = last_indices[i]; // Matching end index for this string.
      const from_fret = start_frets[index]; // Starting fret.
      const to_fret = last_frets[last_index]; // Ending fret.
      if (!this.artist.current_bends[index]) {
        this.artist.current_bends[index] = [];
      }
      this.artist.current_bends[index].push(this.makeBend(from_fret.fret, to_fret.fret));
    });
  }

  /**
   * Close any open bend phrases and apply them to the tab notes.
   */
  closeBends(offset = 1): void {
    if (this.artist.bend_start_index == null) return;
    this.artist.log(`closeBends(${offset})`);
    const tab_notes = _.last(this.artist.staves)!.tab_notes; // Current tab notes.

    _.forEach(this.artist.current_bends, (bend_list, key) => {
      const phrase: any[] = []; // Full bend phrase for this string.
      bend_list.forEach((bend) => phrase.push(bend));
      const bend_modifier = Vex.Flow.Bend.length <= 1
        ? new Vex.Flow.Bend(phrase)
        : new Vex.Flow.Bend(null, null, phrase);
      const bend_index = parseInt(String(key), 10); // String index in the chord.
      tab_notes[this.artist.bend_start_index as number].addModifier(bend_modifier, bend_index);
    });

    // Replace bent notes with ghosts (make them invisible)
    tab_notes
      .slice((this.artist.bend_start_index as number) + 1, (tab_notes.length - 2) + offset + 1)
      .forEach((tab_note) => tab_note.setGhost(true));

    this.artist.current_bends = {};
    this.artist.bend_start_index = null;
  }

  // ---- Tuplets ----

  /**
   * Create tuplets for the most recent notes in the current stave.
   */
  makeTuplets(tuplets: number, notes?: number): void {
    this.artist.log('makeTuplets', tuplets, notes);
    const tuple_notes = notes ?? tuplets; // Number of notes in the tuplet group.
    const stave = _.last(this.artist.staves); // Current stave group.
    if (!stave || !stave.note) return;

    const stave_notes = stave.note_notes; // Notation notes.
    const tab_notes = stave.tab_notes; // Tab notes.

    if (stave_notes.length < tuple_notes) {
      throw new Vex.RERR('ArtistError', 'Not enough notes for tuplet');
    }

    const modifier = new Vex.Flow.Tuplet(
      stave_notes.slice(stave_notes.length - tuple_notes),
      { num_notes: tuplets },
    );
    this.artist.stave_articulations.push(modifier);

    // Tuplet creation adjusts ticks, so we create one for tab as well.
    const tab_modifier = new Vex.Flow.Tuplet(
      tab_notes.slice(tab_notes.length - tuple_notes),
      { num_notes: tuplets },
    );

    if (this.artist.customizations['tab-stems'] === 'true') {
      this.artist.tab_articulations.push(tab_modifier);
    }
  }

  // ---- Fingerings / strokes / score articulations ----

  /**
   * Extract a fingering command from text, if present.
   */
  private getFingering(text: string): RegExpMatchArray | null {
    return text.match(/^\.fingering\/([^.]+)\./);
  }

  /**
   * Parse a fingering annotation into modifiers that can be attached to notes.
   */
  makeFingering(text: string): Array<{ num: number; modifier: any }> | null {
    const parts = this.getFingering(text); // Regex parts for fingering syntax.
    const POS = Vex.Flow.Modifier.Position; // VexFlow position enum.
    const fingers: string[] = []; // Individual fingering tokens.
    const fingering: Array<{ num: number; modifier: any }> = []; // Parsed modifier list.
    const offset_x = 4; // Horizontal offset to keep digits clear of notes.

    if (parts) {
      parts[1].split(/-/).forEach((piece) => fingers.push(piece.trim()));
    } else {
      return null;
    }

    const badFingering = () => new Vex.RERR('ArtistError', `Bad fingering: ${parts[1]}`); // Error helper.

    fingers.forEach((finger) => {
      const pieces = finger.match(/(\d+):([ablr]):([fs]):([^-.]+)/); // Parse "note:position:type:value".
      if (!pieces) throw badFingering();

      const note_number = parseInt(pieces[1], 10) - 1; // 1-based to 0-based index.
      let position = POS.RIGHT; // Default modifier position.
      switch (pieces[2]) {
        case 'l':
          position = POS.LEFT;
          break;
        case 'r':
          position = POS.RIGHT;
          break;
        case 'a':
          position = POS.ABOVE;
          break;
        case 'b':
          position = POS.BELOW;
          break;
        default:
          break;
      }

      let modifier: any = null; // VexFlow modifier instance.
      const number = pieces[4]; // Finger number string.
      switch (pieces[3]) {
        case 's':
          modifier = new Vex.Flow.StringNumber(number).setPosition(position);
          break;
        case 'f':
          modifier = new Vex.Flow.FretHandFinger(number).setPosition(position);
          break;
        default:
          break;
      }

      if (modifier && typeof modifier.setOffsetX === 'function') {
        if (position === POS.RIGHT) {
          modifier.setOffsetX(offset_x);
        } else if (position === POS.LEFT) {
          modifier.setOffsetX(-offset_x);
        }
      }

      fingering.push({ num: note_number, modifier }); // Store modifier for later attachment.
    });

    return fingering;
  }

  /**
   * Extract a stroke command from text, if present.
   */
  private getStrokeParts(text: string): RegExpMatchArray | null {
    return text.match(/^\.stroke\/([^.]+)\./);
  }

  /**
   * Build a VexFlow stroke modifier from a stroke command string.
   */
  makeStroke(text: string): any | null {
    const parts = this.getStrokeParts(text); // Regex parts for stroke syntax.
    const TYPE = Vex.Flow.Stroke.Type; // Stroke type enum.

    if (!parts) return null;

    switch (parts[1]) {
      case 'bu':
        return new Vex.Flow.Stroke(TYPE.BRUSH_UP);
      case 'bd':
        return new Vex.Flow.Stroke(TYPE.BRUSH_DOWN);
      case 'ru':
        return new Vex.Flow.Stroke(TYPE.ROLL_UP);
      case 'rd':
        return new Vex.Flow.Stroke(TYPE.ROLL_DOWN);
      case 'qu':
        return new Vex.Flow.Stroke(TYPE.RASQUEDO_UP);
      case 'qd':
        return new Vex.Flow.Stroke(TYPE.RASQUEDO_DOWN);
      default:
        throw new Vex.RERR('ArtistError', `Invalid stroke type: ${parts[1]}`);
    }
  }

  /**
   * Extract score articulation parts from the annotation string.
   */
  private getScoreArticulationParts(text: string): RegExpMatchArray | null {
    return text.match(/^\.(a[^/]*)\/(t|b)[^.]*\./);
  }

  /**
   * Create a score articulation modifier from an annotation string.
   */
  makeScoreArticulation(text: string): any | null {
    const parts = this.getScoreArticulationParts(text);
    if (!parts) return null;

    const type = parts[1]; // Articulation code (e.g., a|).
    const position = parts[2]; // t (top) or b (bottom).

    const POSTYPE = Vex.Flow.Modifier.Position; // VexFlow position enum.
    const pos = position === 't' ? POSTYPE.ABOVE : POSTYPE.BELOW; // Convert to VexFlow position.
    return new Vex.Flow.Articulation(type).setPosition(pos);
  }

  // ---- Annotations ----

  /**
   * Create a VexFlow Annotation modifier, with optional font overrides.
   */
  makeAnnotation(text: string): any | null {
    let font_face = this.artist.customizations['font-face']; // Default font face.
    let font_size = this.artist.customizations['font-size']; // Default font size.
    let font_style = this.artist.customizations['font-style']; // Default font style.
    const aposition = this.artist.customizations['annotation-position']; // Top/bottom setting.

    const VJUST = Vex.Flow.Annotation.VerticalJustify;
    const default_vjust = aposition === 'top' ? VJUST.TOP : VJUST.BOTTOM;

    const makeIt = (note_text: string, just = default_vjust) => (
      new Vex.Flow.Annotation(note_text)
        .setFont(font_face, font_size, font_style)
        .setVerticalJustification(just)
    );

    let parts = text.match(/^\.([^-]*)-([^-]*)-([^.]*)\.(.*)/); // Font override syntax.
    if (parts) {
      font_face = parts[1];
      font_size = parts[2];
      font_style = parts[3];
      const message = parts[4];
      return message ? makeIt(message) : null;
    }

    parts = text.match(/^\.([^.]*)\.(.*)/); // Command syntax (e.g., .big.)
    if (parts) {
      let just = default_vjust; // Vertical justification to apply.
      const command = parts[1]; // Command token.
      const message = parts[2]; // Annotation text.
      switch (command) {
        case 'big':
          font_style = 'bold';
          font_size = '14';
          break;
        case 'italic':
        case 'italics':
          font_face = 'Times';
          font_style = 'italic';
          break;
        case 'medium':
          font_size = '12';
          break;
        case 'top':
          just = VJUST.TOP;
          this.artist.customizations['annotation-position'] = 'top';
          break;
        case 'bottom':
          just = VJUST.BOTTOM;
          this.artist.customizations['annotation-position'] = 'bottom';
          break;
        default:
          break;
      }
      return message ? makeIt(message, just) : null;
    }

    return makeIt(text);
  }

  /**
   * Normalize override text for fret annotations (e.g., A#4 or 5/2).
   */
  formatOverrideFretText(text: string): { text: string; string?: string } | null {
    if (!text) return null;
    const unicode = Vex.Flow?.unicode ?? {}; // Unicode glyph map (if available).
    const sharp = unicode.sharp ?? '#'; // Sharp glyph fallback.
    const flat = unicode.flat ?? 'b'; // Flat glyph fallback.
    const natural = unicode.natural ?? 'n'; // Natural glyph fallback.

    const note_match = text.match(/^([A-G])([#@n]{1,2})?(~?)(\d+)?(?:_(\d+)\/(\d+))?$/); // Note pattern.
    if (note_match) {
      const note = note_match[1]; // Base note letter.
      const accidental = note_match[2] ?? ''; // Accidental (if any).
      const octave = note_match[4] ?? ''; // Octave number (if any).
      const string_num = note_match[6]; // String number override (if any).
      const acc_text = (() => {
        switch (accidental) {
          case '##':
            return `${sharp}${sharp}`;
          case '#':
            return sharp;
          case '@@':
            return `${flat}${flat}`;
          case '@':
            return flat;
          case 'n':
            return natural;
          default:
            return '';
        }
      })();
      return { text: `${note}${acc_text}${octave}`, string: string_num };
    }

    const fret_match = text.match(/^(\d+)\/(\d+)$/); // Fret/string pattern.
    if (fret_match) {
      return { text: fret_match[1], string: fret_match[2] };
    }

    return null;
  }

  /**
   * Apply a text override to a tab note's fret rendering.
   */
  applyFretOverride(tab_note: any, override: { text: string; string?: string }): void {
    if (!tab_note || !override) return;
    if (!tab_note.fretElement || !tab_note.positions) return;

    let override_index = 0; // Default to first position if none specified.
    if (override.string) {
      const string_num = parseInt(override.string, 10); // Parsed string number.
      if (!Number.isNaN(string_num)) {
        let idx = -1; // Index of the matching string.
        tab_note.positions.forEach((pos: any, i: number) => {
          if (parseInt(pos.str, 10) === string_num && idx < 0) {
            idx = i;
          }
        });
        override_index = idx >= 0 ? idx : 0;
      }
    }

    const element = tab_note.fretElement[override_index]; // Text element to override.
    if (!element) return;

    element.setText(override.text);
    const font_face = this.artist.customizations['font-face']; // Current font face.
    const font_size = this.artist.customizations['font-size']; // Current font size.
    const font_style = this.artist.customizations['font-style']; // Current font style.
    if (font_face) {
      element.setFont(font_face, font_size, font_style);
    }

    let max_width = 0; // Track widest text to set consistent width.
    tab_note.fretElement.forEach((el: any) => {
      max_width = Math.max(max_width, el.getWidth());
    });
    tab_note.setWidth(max_width);
  }

  /**
   * Add annotation modifiers to the most recent notes in the stave group.
   */
  addAnnotations(annotations: string[]): void {
    const stave = _.last(this.artist.staves)!; // Current stave group.
    const stave_notes = stave.note_notes; // Notation notes.
    const tab_notes = stave.tab_notes; // Tab notes.

    if (annotations.length > tab_notes.length) {
      throw new Vex.RERR('ArtistError', 'More annotations than note elements');
    }

    // Add text annotations to tablature.
    if (stave.tab) {
      tab_notes.slice(tab_notes.length - annotations.length).forEach((tab_note: any, i: number) => {
        if (this.getScoreArticulationParts(annotations[i])) {
          const score_articulation = this.makeScoreArticulation(annotations[i]);
          tab_note.addModifier(score_articulation, 0);
        } else if (this.getStrokeParts(annotations[i])) {
          const stroke = this.makeStroke(annotations[i]);
          tab_note.addModifier(stroke, 0);
        } else {
          const annotation_text = annotations[i]; // Raw annotation string.
          const override = this.formatOverrideFretText(annotation_text); // Override parse result.
          if (override) {
            this.applyFretOverride(tab_note, override);
          } else {
            const annotation = this.makeAnnotation(annotation_text);
            if (annotation) tab_note.addModifier(annotation, 0);
          }
        }
      });
    } else {
      stave_notes.slice(stave_notes.length - annotations.length).forEach((note: any, i: number) => {
        if (!this.getScoreArticulationParts(annotations[i])) {
          const annotation = this.makeAnnotation(annotations[i]);
          if (annotation) {
            if (typeof note.addAnnotation === 'function') {
              note.addAnnotation(0, annotation);
            } else if (typeof note.addModifier === 'function') {
              note.addModifier(annotation, 0);
            }
          }
        }
      });
    }

    // Add glyph articulations, strokes, or fingerings on score.
    if (stave.note) {
      stave_notes.slice(stave_notes.length - annotations.length).forEach((note: any, i: number) => {
        const score_articulation = this.makeScoreArticulation(annotations[i]);
        if (score_articulation) {
          if (typeof note.addArticulation === 'function') {
            note.addArticulation(0, score_articulation);
          } else if (typeof note.addModifier === 'function') {
            note.addModifier(score_articulation, 0);
          }
        }

        const stroke = this.makeStroke(annotations[i]); // Stroke annotations affect notation too.
        if (stroke) {
          note.addStroke(0, stroke);
        }

        const fingerings = this.makeFingering(annotations[i]); // Fingering annotations for strings/frets.
        if (fingerings) {
          try {
            fingerings.forEach((fingering) => note.addModifier(fingering.modifier, fingering.num));
          } catch (_e) {
            throw new Vex.RERR('ArtistError', `Bad note number in fingering: ${annotations[i]}`);
          }
        }
      });
    }
  }

  /**
   * Add a tab articulation between two notes (slides, ties, bends, etc.).
   */
  addTabArticulation(
    type: string,
    first_note: any,
    last_note: any,
    first_indices: number[],
    last_indices: number[],
  ): void {
    this.artist.log('addTabArticulations: ', type, first_note, last_note, first_indices, last_indices);

    if (type === 't') {
      last_note.addModifier(
        new Vex.Flow.Annotation('T')
          .setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.BOTTOM),
      );
    }

    if (_.isEmpty(first_indices) && _.isEmpty(last_indices)) return;

    let articulation: any = null; // VexFlow articulation modifier.
    const notes = {
      first_note,
      last_note,
      first_indices,
      last_indices,
      firstNote: first_note,
      lastNote: last_note,
      firstIndexes: first_indices,
      lastIndexes: last_indices,
    };

    if (type === 's') {
      articulation = new Vex.Flow.TabSlide(notes);
    }

    if (type === 'h' || type === 'p') {
      articulation = new Vex.Flow.TabTie(notes, type.toUpperCase());
    }

    if (type === 'T' || type === 't') {
      articulation = new Vex.Flow.TabTie(notes, ' ');
    }

    if (type === 'b') {
      this.openBends(first_note, last_note, first_indices, last_indices);
    }

    if (articulation) {
      this.artist.tab_articulations.push(articulation);
    }
  }

  /**
   * Add a notation stave articulation between two notes.
   */
  addStaveArticulation(
    type: string,
    first_note: any,
    last_note: any,
    first_indices: number[],
    last_indices: number[],
  ): void {
    this.artist.log('addStaveArticulations: ', type, first_note, last_note, first_indices, last_indices);
    let articulation: any = null; // VexFlow stave articulation modifier.
    if (['b', 's', 'h', 'p', 't', 'T'].includes(type)) {
      articulation = new Vex.Flow.StaveTie({
        first_note,
        last_note,
        first_indices,
        last_indices,
        firstNote: first_note,
        lastNote: last_note,
        firstIndexes: first_indices,
        lastIndexes: last_indices,
      });
    }

    if (articulation) {
      this.artist.stave_articulations.push(articulation);
    }
  }

  /**
   * Find the previous (second-to-last) non-bar, non-ghost tab note index.
   */
  private getPreviousNoteIndex(): number {
    const tab_notes = _.last(this.artist.staves)!.tab_notes; // Current tab notes list.
    let index = 2; // Start from the second-to-last note.
    while (index <= tab_notes.length) {
      const note = tab_notes[tab_notes.length - index];
      if (note instanceof Vex.Flow.TabNote) {
        return tab_notes.length - index;
      }
      index += 1;
    }

    return -1;
  }

  /**
   * Add a decorator (vibrato, up/down bowing) to the latest notes.
   */
  addDecorator(decorator: string | null): void {
    this.artist.log('addDecorator: ', decorator);
    if (!decorator) return;

    const stave = _.last(this.artist.staves)!; // Current stave group.
    const tab_notes = stave.tab_notes; // Tab notes to decorate.
    const score_notes = stave.note_notes; // Notation notes to decorate.
    let modifier: any = null; // Tab modifier.
    let score_modifier: any = null; // Notation modifier (if any).

    if (decorator === 'v') {
      modifier = new Vex.Flow.Vibrato();
    }
    if (decorator === 'V') {
      modifier = new Vex.Flow.Vibrato();
      if (typeof modifier.setHarsh === 'function') {
        modifier.setHarsh(true);
      }
    }
    if (decorator === 'u') {
      modifier = new Vex.Flow.Articulation('a|').setPosition(Vex.Flow.Modifier.Position.BELOW);
      score_modifier = new Vex.Flow.Articulation('a|').setPosition(Vex.Flow.Modifier.Position.BELOW);
    }
    if (decorator === 'd') {
      modifier = new Vex.Flow.Articulation('am').setPosition(Vex.Flow.Modifier.Position.BELOW);
      score_modifier = new Vex.Flow.Articulation('am').setPosition(Vex.Flow.Modifier.Position.BELOW);
    }

    const last_tab = _.last(tab_notes); // Latest tab note.
    if (last_tab && modifier) {
      last_tab.addModifier(modifier, 0);
    }

    if (score_modifier) {
      const score_note = _.last(score_notes); // Latest notation note.
      if (score_note) {
        if (typeof score_note.addArticulation === 'function') {
          score_note.addArticulation(0, score_modifier);
        } else if (typeof score_note.addModifier === 'function') {
          score_note.addModifier(score_modifier, 0);
        }
      }
    }
  }

  /**
   * Add articulations for the most recent tab/note entries.
   */
  addArticulations(articulations: Array<string | null>): void {
    this.artist.log('addArticulations: ', articulations);
    const stave = _.last(this.artist.staves)!; // Current stave group.
    const tab_notes = stave.tab_notes; // Tab notes list.
    const stave_notes = stave.note_notes; // Notation notes list.
    if (_.isEmpty(tab_notes) || _.isEmpty(articulations)) {
      this.closeBends(0);
      return;
    }

    const current_tab_note = _.last(tab_notes); // Latest tab note.
    let has_bends = false; // Track whether current articulation set includes bends.

    ['b', 's', 'h', 'p', 't', 'T', 'v', 'V'].forEach((valid_articulation) => {
      const indices = articulations
        .map((art, i) => (art && art === valid_articulation ? i : -1))
        .filter((idx) => idx >= 0);

      if (_.isEmpty(indices)) return;
      if (valid_articulation === 'b') has_bends = true;

      const prev_index = this.getPreviousNoteIndex(); // Index of previous tab note.
      let prev_tab_note: any = null; // Previous tab note for ties/slides.
      let prev_indices: number[] | null = null; // Previous note string indices.
      let current_indices: number[] = []; // Current note string indices.

      if (prev_index === -1) {
        prev_tab_note = null;
        prev_indices = null;
      } else {
        prev_tab_note = tab_notes[prev_index];
        const this_strings = current_tab_note
          .getPositions()
          .filter((_: any, i: number) => indices.includes(i))
          .map((n: any) => n.str);

        const valid_strings = prev_tab_note
          .getPositions()
          .filter((pos: any) => this_strings.includes(pos.str))
          .map((pos: any) => pos.str);

        prev_indices = prev_tab_note
          .getPositions()
          .map((n: any, i: number) => (valid_strings.includes(n.str) ? i : -1))
          .filter((idx: number) => idx >= 0);

        current_indices = current_tab_note
          .getPositions()
          .map((n: any, i: number) => (valid_strings.includes(n.str) ? i : -1))
          .filter((idx: number) => idx >= 0);
      }

      if (stave.tab) {
        this.addTabArticulation(
          valid_articulation,
          prev_tab_note,
          current_tab_note,
          prev_indices || [],
          current_indices,
        );
      }

      if (stave.note && prev_index !== -1) {
        this.addStaveArticulation(
          valid_articulation,
          stave_notes[prev_index],
          _.last(stave_notes),
          prev_indices || [],
          current_indices,
        );
      }
    });

    if (!has_bends) {
      this.closeBends(0);
    }
  }
}
