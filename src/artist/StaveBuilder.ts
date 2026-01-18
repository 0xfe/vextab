// src/artist/StaveBuilder.ts
// Stave creation logic that manages bars, voices, and stave layout.

import Vex from '../vexflow'; // VexFlow shim for stave classes.
import * as _ from '../utils'; // Utility helpers for collections.
import type Artist from './Artist'; // Artist type for shared state.

/**
 * Builds staves, manages voice boundaries, and handles barlines.
 */
export class StaveBuilder {
  private artist: Artist; // Owning Artist instance.

  /**
   * Create a stave builder bound to an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  /**
   * Insert a barline into the current stave group.
   */
  addBar(type: string): void {
    this.artist.log('addBar: ', type);
    this.artist.closeBends();
    this.artist.key_manager.reset();
    const stave = _.last(this.artist.staves)!; // Current stave group.

    const TYPE = Vex.Flow.Barline.type; // VexFlow barline constants.
    let bar_type = TYPE.SINGLE; // Default barline type.
    switch (type) {
      case 'single':
        bar_type = TYPE.SINGLE;
        break;
      case 'double':
        bar_type = TYPE.DOUBLE;
        break;
      case 'end':
        bar_type = TYPE.END;
        break;
      case 'repeat-begin':
        bar_type = TYPE.REPEAT_BEGIN;
        break;
      case 'repeat-end':
        bar_type = TYPE.REPEAT_END;
        break;
      case 'repeat-both':
        bar_type = TYPE.REPEAT_BOTH;
        break;
      default:
        bar_type = TYPE.SINGLE;
        break;
    }

    const bar_note = new Vex.Flow.BarNote().setType(bar_type); // Barline marker note.
    stave.tab_notes.push(bar_note); // Add to tab notes.
    if (stave.note) {
      stave.note_notes.push(bar_note); // Mirror into notation if present.
    }
  }

  /**
   * Start a new voice within the current stave group.
   */
  addVoice(_options?: Record<string, string>): void {
    this.artist.closeBends();
    const stave = _.last(this.artist.staves); // Current stave group.
    if (!stave) {
      this.addStave('stave', _options || {});
      return;
    }

    if (!_.isEmpty(stave.tab_notes)) {
      stave.tab_voices.push(stave.tab_notes); // Commit tab notes to a voice.
      stave.tab_notes = []; // Start a new tab note list.
    }

    if (!_.isEmpty(stave.note_notes)) {
      stave.note_voices.push(stave.note_notes); // Commit notation notes to a voice.
      stave.note_notes = []; // Start a new notation note list.
    }
  }

  /**
   * Add a new stave group (tab, notation, or both) with the given options.
   */
  addStave(element: string, options: Record<string, string>): void {
    const opts: Record<string, any> = {
      tuning: 'standard',
      clef: 'treble',
      key: 'C',
      notation: element === 'tabstave' ? 'false' : 'true',
      tablature: element === 'stave' ? 'false' : 'true',
      strings: 6,
    };

    _.extend(opts, options); // Merge in user-provided overrides.
    this.artist.log('addStave: ', element, opts);

    let tab_stave: any = null; // Tab stave (if enabled).
    let note_stave: any = null; // Notation stave (if enabled).

    // Used to line up tablature and notation.
    const start_x = this.artist.x + Number(this.artist.customizations['connector-space']); // X position for staves.
    let tabstave_start_x = 40; // Fallback start for tab glyphs.

    if (opts.notation === 'true') {
      note_stave = new Vex.Flow.Stave(
        start_x,
        this.artist.last_y,
        Number(this.artist.customizations.width) - 20,
        { left_bar: false },
      );
      if (opts.clef !== 'none') {
        note_stave.addClef(opts.clef);
      }
      note_stave.addKeySignature(opts.key);
      if (opts.time) {
        note_stave.addTimeSignature(opts.time);
      }

      this.artist.last_y += note_stave.getHeight()
        + this.artist.options.note_stave_lower_spacing
        + parseInt(String(this.artist.customizations['stave-distance']), 10);
      tabstave_start_x = note_stave.getNoteStartX(); // Align tab with notation.
      this.artist.current_clef = opts.clef === 'none' ? 'treble' : opts.clef; // Update current clef.
    }

    if (opts.tablature === 'true') {
      tab_stave = new Vex.Flow.TabStave(
        start_x,
        this.artist.last_y,
        Number(this.artist.customizations.width) - 20,
        { left_bar: false },
      ).setNumLines(opts.strings);
      if (opts.clef !== 'none') {
        tab_stave.addTabGlyph();
      }
      tab_stave.setNoteStartX(tabstave_start_x); // Align with notation stave start.
      this.artist.last_y += tab_stave.getHeight() + this.artist.options.tab_stave_lower_spacing;
    }

    this.artist.closeBends();

    const beam_groups = Vex.Flow.Beam.getDefaultBeamGroups(opts.time); // Beam grouping based on time signature.
    this.artist.staves.push({
      tab: tab_stave,
      note: note_stave,
      tab_voices: [],
      note_voices: [],
      tab_notes: [],
      note_notes: [],
      text_voices: [],
      beam_groups,
    });

    this.artist.tuning.setTuning(opts.tuning); // Apply tuning to the Artist state.
    this.artist.key_manager.setKey(opts.key); // Apply key signature to the Artist state.
  }
}
