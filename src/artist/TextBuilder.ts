// Text voice builder for lyric/annotation staves in the VexTab layout.
import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from './Artist';

/**
 * TextBuilder manages text voices (lyrics/annotations in a text stave).
 */
export class TextBuilder {
  // Owning Artist instance, used for shared state and customizations.
  private artist: Artist;

  /**
   * Create a text builder bound to an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  /**
   * Start a new text voice in the current stave group.
   */
  addTextVoice(): void {
    _.last(this.artist.staves)!.text_voices.push([]);
  }

  /**
   * Update font customizations based on a "face-size-style" string.
   */
  setTextFont(font: string): void {
    if (!font) return;
    // Parse the "face-size-style" convention used by VexTab text commands.
    const parts = font.match(/([^-]*)-([^-]*)-([^.]*)/);
    if (parts) {
      this.artist.customizations['font-face'] = parts[1];
      this.artist.customizations['font-size'] = parseInt(parts[2], 10);
      this.artist.customizations['font-style'] = parts[3];
    }
  }

  /**
   * Add a text note to the current text voice.
   * Design note: glyph syntax (#...) is supported for symbol-only notes.
   */
  addTextNote(
    text: string,
    position = 0,
    justification: 'center' | 'left' | 'right' = 'center',
    smooth = true,
    ignore_ticks = false,
  ): void {
    const voices = _.last(this.artist.staves)!.text_voices;
    if (_.isEmpty(voices)) {
      throw new Vex.RERR('ArtistError', "Can't add text note without text voice");
    }

    // Pull active font options from the Artist customization map.
    const font_face = this.artist.customizations['font-face'];
    const font_size = this.artist.customizations['font-size'];
    const font_style = this.artist.customizations['font-style'];

    // Map justification labels into VexFlow's enum.
    let just = Vex.Flow.TextNote.Justification.CENTER;
    switch (justification) {
      case 'center':
        just = Vex.Flow.TextNote.Justification.CENTER;
        break;
      case 'left':
        just = Vex.Flow.TextNote.Justification.LEFT;
        break;
      case 'right':
        just = Vex.Flow.TextNote.Justification.RIGHT;
        break;
      default:
        just = Vex.Flow.TextNote.Justification.CENTER;
        break;
    }

    // "b" creates a bar-sized spacer when ticks are ignored.
    const duration = ignore_ticks ? 'b' : this.artist.current_duration;

    const struct: any = {
      text,
      duration,
      smooth,
      ignore_ticks,
      font: {
        family: font_face,
        size: font_size,
        weight: font_style,
      },
    };

    // Glyph syntax uses TextNote glyphs instead of text rendering.
    if (text.startsWith('#')) {
      struct.glyph = text.slice(1);
      struct.text = '';
      struct.font = null;
    }

    const note = new Vex.Flow.TextNote(struct)
      .setLine(position)
      .setJustification(just);

    _.last(voices)!.push(note);
  }
}
