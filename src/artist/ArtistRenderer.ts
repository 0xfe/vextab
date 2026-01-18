import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from './Artist';

/**
 * ArtistRenderer is responsible for layout + drawing. It takes the in-memory
 * staves/notes arrays and uses VexFlow formatters to position and render
 * everything to the given renderer.
 */
export class ArtistRenderer {
  private artist: Artist;

  constructor(artist: Artist) {
    this.artist = artist;
  }

  private parseBool(value: any): boolean {
    return String(value) === 'true';
  }

  private formatAndRender(
    ctx: any,
    tab: { stave: any; voices: any[] } | null,
    score: { stave: any; voices: any[] } | null,
    text_notes: any[][],
    customizations: Record<string, any>,
    options: { beam_groups: any },
  ): any[] {
    const tab_stave = tab ? tab.stave : null;
    const score_stave = score ? score.stave : null;

    const tab_voices: any[] = [];
    const score_voices: any[] = [];
    const text_voices: any[] = [];
    let beams: any[] = [];
    let format_stave: any = null;
    let text_stave: any = null;

    const beam_config: Record<string, any> = {
      beam_rests: this.parseBool(customizations['beam-rests']),
      show_stemlets: this.parseBool(customizations['beam-stemlets']),
      beam_middle_only: this.parseBool(customizations['beam-middle-only']),
      groups: options.beam_groups,
    };

    if (tab) {
      const multi_voice = tab.voices.length > 1;
      tab.voices.forEach((notes, i) => {
        if (_.isEmpty(notes)) return;
        _.each(notes, (note) => note.setStave(tab_stave));
        const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
          .setMode(Vex.Flow.Voice.Mode.SOFT);
        voice.addTickables(notes);
        tab_voices.push(voice);

        if (customizations['tab-stems'] === 'true') {
          if (multi_voice) {
            beam_config.stem_direction = i === 0 ? 1 : -1;
          } else {
            beam_config.stem_direction = customizations['tab-stem-direction'] === 'down' ? -1 : 1;
          }

          beam_config.beam_rests = false;
          beams = beams.concat(Vex.Flow.Beam.generateBeams(voice.getTickables(), beam_config));
        }
      });

      format_stave = tab_stave;
      text_stave = tab_stave;
    }

    beam_config.beam_rests = this.parseBool(customizations['beam-rests']);

    if (score) {
      const multi_voice = score.voices.length > 1;
      score.voices.forEach((notes, i) => {
        if (_.isEmpty(notes)) return;
        const stem_direction = i === 0 ? 1 : -1;
        _.each(notes, (note) => note.setStave(score_stave));

        const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
          .setMode(Vex.Flow.Voice.Mode.SOFT);
        voice.addTickables(notes);
        score_voices.push(voice);

        if (multi_voice) {
          beam_config.stem_direction = stem_direction;
          beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config));
        } else {
          beam_config.stem_direction = null;
          beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config));
        }
      });

      format_stave = score_stave;
      text_stave = score_stave;
    }

    text_notes.forEach((notes) => {
      if (_.isEmpty(notes)) return;
      _.each(notes, (voice) => voice.setStave(text_stave));
      const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
        .setMode(Vex.Flow.Voice.Mode.SOFT);
      voice.addTickables(notes);
      text_voices.push(voice);
    });

    if (format_stave) {
      let format_voices: any[] = [];
      const formatter = new Vex.Flow.Formatter();
      let align_rests = false;

      if (tab) {
        if (!_.isEmpty(tab_voices)) {
          formatter.joinVoices(tab_voices);
        }
        format_voices = tab_voices;
      }

      if (score) {
        if (!_.isEmpty(score_voices)) {
          formatter.joinVoices(score_voices);
        }
        format_voices = format_voices.concat(score_voices);
        if (score_voices.length > 1) {
          align_rests = true;
        }
      }

      if (!_.isEmpty(text_notes) && !_.isEmpty(text_voices)) {
        formatter.joinVoices(text_voices);
        format_voices = format_voices.concat(text_voices);
      }

      if (!_.isEmpty(format_voices)) {
        formatter.formatToStave(format_voices, format_stave, { align_rests });
      }

      if (tab) {
        _.each(tab_voices, (voice) => voice.draw(ctx, tab_stave));
      }
      if (score) {
        _.each(score_voices, (voice) => voice.draw(ctx, score_stave));
      }
      _.each(beams, (beam) => beam.setContext(ctx).draw());
      if (!_.isEmpty(text_notes)) {
        _.each(text_voices, (voice) => voice.draw(ctx, text_stave));
      }

      if (tab && score) {
        new Vex.Flow.StaveConnector(score.stave, tab.stave)
          .setType(Vex.Flow.StaveConnector.type.BRACKET)
          .setContext(ctx)
          .draw();
      }

      return score ? score_voices : tab_voices;
    }

    return [];
  }

  render(renderer: any): void {
    const artist = this.artist;
    artist.log('Render: ', artist.options);
    artist.closeBends();

    renderer.resize(
      Number(artist.customizations.width) * Number(artist.customizations.scale),
      (artist.last_y + artist.options.bottom_spacing) * Number(artist.customizations.scale),
    );

    const ctx = renderer.getContext();
    ctx.scale(Number(artist.customizations.scale), Number(artist.customizations.scale));
    ctx.clear();
    ctx.setFont(artist.options.font_face, artist.options.font_size, '');

    artist.renderer_context = ctx;

    const setBar = (stave: any, notes: any[]) => {
      const last_note = _.last(notes);
      if (last_note instanceof Vex.Flow.BarNote) {
        notes.pop();
        stave.setEndBarType(last_note.getType());
        stave.formatted = true;
      }
    };

    artist.staves.forEach((stave) => {
      artist.log('Rendering staves.');
      if (stave.tab) setBar(stave.tab, stave.tab_notes);
      if (stave.note) setBar(stave.note, stave.note_notes);

      if (stave.tab) stave.tab.setContext(ctx).draw();
      if (stave.note) stave.note.setContext(ctx).draw();

      stave.tab_voices.push(stave.tab_notes);
      stave.note_voices.push(stave.note_notes);

      const voices = this.formatAndRender(
        ctx,
        stave.tab ? { stave: stave.tab, voices: stave.tab_voices } : null,
        stave.note ? { stave: stave.note, voices: stave.note_voices } : null,
        stave.text_voices,
        artist.customizations,
        { beam_groups: stave.beam_groups },
      );

      artist.player_voices.push(voices);
    });

    artist.log('Rendering tab articulations.');
    artist.tab_articulations.forEach((articulation) => articulation.setContext(ctx).draw());

    artist.log('Rendering note articulations.');
    artist.stave_articulations.forEach((articulation) => articulation.setContext(ctx).draw());

    if (artist.player) {
      if (artist.customizations.player === 'true') {
        artist.player.setTempo(parseInt(String(artist.customizations.tempo), 10));
        artist.player.setInstrument(String(artist.customizations.instrument));
        artist.player.render();
      } else {
        artist.player.removeControls();
      }
    }

    artist.rendered = true;

    if (!artist.isLogoHidden()) {
      const LOGO = 'vexflow.com';
      const width = ctx.measureText(LOGO).width;
      ctx.save();
      ctx.setFont('Times', 10, 'italic');
      ctx.fillText(LOGO, (Number(artist.customizations.width) - width) / 2, artist.last_y + 25);
      ctx.restore();
    }
  }
}
