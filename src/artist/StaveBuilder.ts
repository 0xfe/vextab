import Vex from '../vexflow';
import * as _ from 'lodash';
import type Artist from './Artist';

/**
 * Builds staves, manages voice boundaries, and handles barlines.
 */
export class StaveBuilder {
  private artist: Artist;

  constructor(artist: Artist) {
    this.artist = artist;
  }

  addBar(type: string): void {
    this.artist.log('addBar: ', type);
    this.artist.closeBends();
    this.artist.key_manager.reset();
    const stave = _.last(this.artist.staves)!;

    const TYPE = Vex.Flow.Barline.type;
    let bar_type = TYPE.SINGLE;
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

    const bar_note = new Vex.Flow.BarNote().setType(bar_type);
    stave.tab_notes.push(bar_note);
    if (stave.note) {
      stave.note_notes.push(bar_note);
    }
  }

  addVoice(_options?: Record<string, string>): void {
    this.artist.closeBends();
    const stave = _.last(this.artist.staves);
    if (!stave) {
      this.addStave('stave', _options || {});
      return;
    }

    if (!_.isEmpty(stave.tab_notes)) {
      stave.tab_voices.push(stave.tab_notes);
      stave.tab_notes = [];
    }

    if (!_.isEmpty(stave.note_notes)) {
      stave.note_voices.push(stave.note_notes);
      stave.note_notes = [];
    }
  }

  addStave(element: string, options: Record<string, string>): void {
    const opts: Record<string, any> = {
      tuning: 'standard',
      clef: 'treble',
      key: 'C',
      notation: element === 'tabstave' ? 'false' : 'true',
      tablature: element === 'stave' ? 'false' : 'true',
      strings: 6,
    };

    _.extend(opts, options);
    this.artist.log('addStave: ', element, opts);

    let tab_stave: any = null;
    let note_stave: any = null;

    // Used to line up tablature and notation.
    const start_x = this.artist.x + Number(this.artist.customizations['connector-space']);
    let tabstave_start_x = 40;

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
      tabstave_start_x = note_stave.getNoteStartX();
      this.artist.current_clef = opts.clef === 'none' ? 'treble' : opts.clef;
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
      tab_stave.setNoteStartX(tabstave_start_x);
      this.artist.last_y += tab_stave.getHeight() + this.artist.options.tab_stave_lower_spacing;
    }

    this.artist.closeBends();

    const beam_groups = Vex.Flow.Beam.getDefaultBeamGroups(opts.time);
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

    this.artist.tuning.setTuning(opts.tuning);
    this.artist.key_manager.setKey(opts.key);
  }
}
