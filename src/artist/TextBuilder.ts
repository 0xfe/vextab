import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from './Artist';

/**
 * TextBuilder manages text voices (lyrics/annotations in a text stave).
 */
export class TextBuilder {
  private artist: Artist;

  constructor(artist: Artist) {
    this.artist = artist;
  }

  addTextVoice(): void {
    _.last(this.artist.staves)!.text_voices.push([]);
  }

  setTextFont(font: string): void {
    if (!font) return;
    const parts = font.match(/([^-]*)-([^-]*)-([^.]*)/);
    if (parts) {
      this.artist.customizations['font-face'] = parts[1];
      this.artist.customizations['font-size'] = parseInt(parts[2], 10);
      this.artist.customizations['font-style'] = parts[3];
    }
  }

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

    const font_face = this.artist.customizations['font-face'];
    const font_size = this.artist.customizations['font-size'];
    const font_style = this.artist.customizations['font-style'];

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
