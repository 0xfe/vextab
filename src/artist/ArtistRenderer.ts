// src/artist/ArtistRenderer.ts
// Layout and rendering engine for Artist state, responsible for VexFlow formatting and drawing.

import Vex from '../vexflow'; // VexFlow shim for render classes.
import * as _ from '../utils'; // Utility helpers for iteration/sorting.
import type Artist from './Artist'; // Artist type for the owning context.

/**
 * ArtistRenderer is responsible for layout + drawing. It takes the in-memory
 * staves/notes arrays and uses VexFlow formatters to position and render
 * everything to the given renderer.
 */
export class ArtistRenderer {
  private artist: Artist; // Owning Artist instance with rendered state.

  /**
   * Create a renderer tied to a specific Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  /**
   * Coerce string/boolean-like values into a strict boolean.
   */
  private parseBool(value: any): boolean {
    return String(value) === 'true';
  }

  /**
   * Format and render a stave group (tab/notation/text) using VexFlow formatters.
   * Design note: we centralize formatting here to keep Artist.render() readable.
   */
  private formatAndRender(
    ctx: any,
    tab: { stave: any; voices: any[] } | null,
    score: { stave: any; voices: any[] } | null,
    text_notes: any[][],
    customizations: Record<string, any>,
    options: { beam_groups: any },
  ): any[] {
    const tab_stave = tab ? tab.stave : null; // Tab stave to render.
    const score_stave = score ? score.stave : null; // Notation stave to render.

    const tab_voices: any[] = []; // Tab voices built from notes.
    const score_voices: any[] = []; // Notation voices built from notes.
    const text_voices: any[] = []; // Text voices built from text notes.
    let beams: any[] = []; // Beam objects created for beamed groups.
    let format_stave: any = null; // Stave used for formatting alignment.
    let text_stave: any = null; // Stave for text notes (tab or score).

    const beam_config: Record<string, any> = {
      beam_rests: this.parseBool(customizations['beam-rests']),
      show_stemlets: this.parseBool(customizations['beam-stemlets']),
      beam_middle_only: this.parseBool(customizations['beam-middle-only']),
      groups: options.beam_groups,
    };

    if (tab) {
      const multi_voice = tab.voices.length > 1; // Whether to split stems for multiple voices.
      tab.voices.forEach((notes, i) => {
        if (_.isEmpty(notes)) return;
        _.each(notes, (note) => note.setStave(tab_stave));
        const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
          .setMode(Vex.Flow.Voice.Mode.SOFT);
        voice.addTickables(notes);
        tab_voices.push(voice);

        if (customizations['tab-stems'] === 'true') {
          if (multi_voice) {
            beam_config.stem_direction = i === 0 ? 1 : -1; // Up for first voice, down for second.
          } else {
            beam_config.stem_direction = customizations['tab-stem-direction'] === 'down' ? -1 : 1; // Respect tab-stem-direction.
          }

          beam_config.beam_rests = false; // Tab stems typically ignore rests.
          beams = beams.concat(Vex.Flow.Beam.generateBeams(voice.getTickables(), beam_config)); // Generate beams.
        }
      });

      format_stave = tab_stave;
      text_stave = tab_stave;
    }

    beam_config.beam_rests = this.parseBool(customizations['beam-rests']);

    if (score) {
      const multi_voice = score.voices.length > 1; // Determine multi-voice formatting.
      score.voices.forEach((notes, i) => {
        if (_.isEmpty(notes)) return;
        const stem_direction = i === 0 ? 1 : -1; // Alternate stem direction per voice.
        _.each(notes, (note) => note.setStave(score_stave));

        const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
          .setMode(Vex.Flow.Voice.Mode.SOFT);
        voice.addTickables(notes);
        score_voices.push(voice);

        if (multi_voice) {
          beam_config.stem_direction = stem_direction;
          beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config)); // Generate beams with forced stem direction.
        } else {
          beam_config.stem_direction = null;
          beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config)); // Allow VexFlow to choose stem direction.
        }
      });

      format_stave = score_stave;
      text_stave = score_stave;
    }

    text_notes.forEach((notes) => {
      if (_.isEmpty(notes)) return;
      _.each(notes, (voice) => voice.setStave(text_stave)); // Attach text notes to the chosen stave.
      const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
        .setMode(Vex.Flow.Voice.Mode.SOFT);
      voice.addTickables(notes);
      text_voices.push(voice);
    });

    if (format_stave) {
      let format_voices: any[] = []; // List of voices to format together.
      const formatter = new Vex.Flow.Formatter(); // VexFlow formatter.
      let align_rests = false; // Whether to align rests across voices.

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
          align_rests = true; // Multi-voice scores benefit from rest alignment.
        }
      }

      if (!_.isEmpty(text_notes) && !_.isEmpty(text_voices)) {
        formatter.joinVoices(text_voices);
        format_voices = format_voices.concat(text_voices);
      }

      if (!_.isEmpty(format_voices)) {
        formatter.formatToStave(format_voices, format_stave, { align_rests }); // Compute x positions.
      }

      if (tab) {
        _.each(tab_voices, (voice) => voice.draw(ctx, tab_stave)); // Draw tab voices.
      }
      if (score) {
        _.each(score_voices, (voice) => voice.draw(ctx, score_stave)); // Draw notation voices.
      }
      _.each(beams, (beam) => beam.setContext(ctx).draw()); // Draw beams.
      if (!_.isEmpty(text_notes)) {
        _.each(text_voices, (voice) => voice.draw(ctx, text_stave)); // Draw text voices.
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

  /**
   * Render the complete score using the provided VexFlow renderer instance.
   * Design note: we recompute layout on every render to match current options.
   */
  render(renderer: any): void {
    const artist = this.artist;
    artist.log('Render: ', artist.options);
    artist.closeBends(); // Ensure pending bends are flushed.

    renderer.resize(
      Number(artist.customizations.width) * Number(artist.customizations.scale),
      (artist.last_y + artist.options.bottom_spacing) * Number(artist.customizations.scale),
    );

    const ctx = renderer.getContext(); // VexFlow rendering context.
    ctx.scale(Number(artist.customizations.scale), Number(artist.customizations.scale)); // Apply scale.
    ctx.clear(); // Clear previous render.
    ctx.setFont(artist.options.font_face, artist.options.font_size, ''); // Apply default font.

    artist.renderer_context = ctx; // Share context with Player overlay.

    const setBar = (stave: any, notes: any[]) => {
      const last_note = _.last(notes); // Inspect the last note for barline markers.
      if (last_note instanceof Vex.Flow.BarNote) {
        notes.pop(); // Remove the bar note from tickables.
        stave.setEndBarType(last_note.getType()); // Apply end barline.
        stave.formatted = true; // Prevent formatter from reformatting barline.
      }
    };

    artist.staves.forEach((stave) => {
      artist.log('Rendering staves.');
      if (stave.tab) setBar(stave.tab, stave.tab_notes); // Apply tab barline.
      if (stave.note) setBar(stave.note, stave.note_notes); // Apply notation barline.

      if (stave.tab) stave.tab.setContext(ctx).draw(); // Draw tab stave.
      if (stave.note) stave.note.setContext(ctx).draw(); // Draw notation stave.

      stave.tab_voices.push(stave.tab_notes); // Append tab notes to voices list.
      stave.note_voices.push(stave.note_notes); // Append note notes to voices list.

      const voices = this.formatAndRender(
        ctx,
        stave.tab ? { stave: stave.tab, voices: stave.tab_voices } : null,
        stave.note ? { stave: stave.note, voices: stave.note_voices } : null,
        stave.text_voices,
        artist.customizations,
        { beam_groups: stave.beam_groups },
      );

      artist.player_voices.push(voices); // Accumulate voices for playback.
    });

    artist.log('Rendering tab articulations.');
    artist.tab_articulations.forEach((articulation) => articulation.setContext(ctx).draw()); // Draw tab articulations.

    artist.log('Rendering note articulations.');
    artist.stave_articulations.forEach((articulation) => articulation.setContext(ctx).draw()); // Draw notation articulations.

    if (artist.player) {
      if (artist.customizations.player === 'true') {
        artist.player.setTempo(parseInt(String(artist.customizations.tempo), 10)); // Sync tempo.
        artist.player.setInstrument(String(artist.customizations.instrument)); // Sync instrument.
        artist.player.render(); // Build overlay.
      } else {
        artist.player.removeControls(); // Remove overlay controls if disabled.
      }
    }

    artist.rendered = true; // Mark render complete.

    if (!artist.isLogoHidden()) {
      const LOGO = 'vexflow.com'; // Attribution text.
      const width = ctx.measureText(LOGO).width; // Centering width.
      ctx.save();
      ctx.setFont('Times', 10, 'italic');
      ctx.fillText(LOGO, (Number(artist.customizations.width) - width) / 2, artist.last_y + 25); // Draw centered logo.
      ctx.restore();
    }
  }
}
