// src/artist/TextBuilder.ts
// Text voice builder for lyric/annotation staves in the VexTab layout.

import Vex from '../vexflow'; // VexFlow shim for TextNote classes.
import * as _ from '../utils'; // Utility helpers for collection access.
import type Artist from './Artist'; // Artist type for shared state.

/**
 * TextBuilder manages text voices (lyrics/annotations in a text stave).
 */
export class TextBuilder {
  private artist: Artist; // Owning Artist instance.

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
    const parts = font.match(/([^-]*)-([^-]*)-([^.]*)/); // Parse face-size-style format.
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
    const voices = _.last(this.artist.staves)!.text_voices; // Current text voices.
    if (_.isEmpty(voices)) {
      throw new Vex.RERR('ArtistError', "Can't add text note without text voice");
    }

    const font_face = this.artist.customizations['font-face']; // Font family for text notes.
    const font_size = this.artist.customizations['font-size']; // Font size for text notes.
    const font_style = this.artist.customizations['font-style']; // Font style for text notes.

    let just = Vex.Flow.TextNote.Justification.CENTER; // Default justification.
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

    const duration = ignore_ticks ? 'b' : this.artist.current_duration; // "b" makes a bar-sized spacer.

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

    if (text.startsWith('#')) {
      struct.glyph = text.slice(1); // Glyph name without the leading '#'.
      struct.text = ''; // No text when using glyphs.
      struct.font = null; // Glyphs use their own font in VexFlow.
    }

    const note = new Vex.Flow.TextNote(struct)
      .setLine(position)
      .setJustification(just);

    _.last(voices)!.push(note); // Append to the current text voice.
  }
}
