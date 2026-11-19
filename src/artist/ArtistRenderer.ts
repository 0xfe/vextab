// Layout and rendering engine for Artist state, responsible for VexFlow formatting and drawing.
import { inkStyle } from '../score/color';
import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from './Artist';
import type { StaveGroup, VoiceSettings } from './Artist';
import { Annotation, Beam, Formatter, Fraction, TextNote, Voice } from 'vexflow';

/**
 * ArtistRenderer is responsible for layout + drawing. It takes the in-memory
 * staves/notes arrays and uses VexFlow formatters to position and render
 * everything to the given renderer.
 */
export class ArtistRenderer {
  // Artist instance provides staves, notes, and render options.
  private artist: Artist;

  /**
   * Create a renderer tied to a specific Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  /** Strip a terminal bar from the layout copy. Keep the authored voice intact for redraws. */
  private prepareStave(stave: any, voices: any[][]): any[][] {
    if (!stave) return [];
    const bars = Vex.Flow.Barline.type;
    let end = bars.SINGLE;
    const timed = voices.map(notes => {
      const last = _.last(notes);
      if (last instanceof Vex.Flow.BarNote && last.getType() !== bars.REPEAT_BEGIN) {
        end = last.getType();
        return notes.slice(0, -1);
      }
      return notes;
    });
    stave.setEndBarType(end);
    return timed;
  }

  /** Resolve stems and beam policy for a single voice and projection. */
  private makeBeams(notes: any[], settings: VoiceSettings, group: StaveGroup, index: number, tab: boolean): Beam[] {
    const options = settings.options;
    if (tab && options['tab-stems'] !== 'true') return [];
    let direction: number | undefined;
    if (settings.direction === 'top') direction = 1;
    else if (settings.direction === 'bottom') direction = -1;
    else if (group.voiceSettings.length > 1) direction = index === 0 ? 1 : -1;
    else if (tab) direction = options['tab-stem-direction'] === 'down' ? -1 : 1;

    for (const note of notes) {
      if (direction && note.setStemDirection) note.setStemDirection(direction);
    }
    if (options.beams === 'off') return [];
    if (options.beams === 'explicit') {
      return settings.groups.map(([from, to]) => {
        const beam = new Beam(notes.slice(from, to), direction === undefined);
        beam.renderOptions.showStemlets = options['beam-stemlets'] === 'true';
        return beam;
      });
    }
    return Beam.generateBeams(notes, {
      groups: group.beam_groups,
      stemDirection: direction,
      beamRests: options['beam-rests'] === 'true',
      showStemlets: options['beam-stemlets'] === 'true',
      beamMiddleOnly: options['beam-middle-only'] === 'true',
    });
  }

  /** Align upper tab labels across strings and independently of lower articulations. */
  private alignTopAnnotations(voice: Voice, stave: any): void {
    const lanes: Annotation[][] = [];
    for (const note of voice.getTickables()) {
      const upper = note.getModifiers().filter((mark): mark is Annotation =>
        mark instanceof Annotation && mark.getVerticalJustification() === Annotation.VerticalJustify.TOP);
      upper.forEach((mark, i) => {
        mark.setLayoutBaseline(undefined);
        (lanes[i] ??= []).push(mark);
      });
    }
    let baseline = stave.getYForLine(-1);
    for (const lane of lanes) {
      for (const mark of lane) baseline = Math.min(baseline, mark.computeY().y);
      for (const mark of lane) mark.setLayoutBaseline(baseline);
      baseline -= Math.max(...lane.map(mark => mark.computeY().textHeight));
    }
  }

  /** Fixed-row formatting gives each barline a slot. Supply the corresponding
   * text slots even when a sustained syllable crosses a bar. Keep authored |text. */
  private alignTextBars(notes: any[], reference: any[]): any[] {
    const bars: Fraction[] = [];
    let time = new Fraction(0, 1);
    for (const note of reference) {
      if (note.shouldIgnoreTicks()) bars.push(time.clone());
      else time.add(note.getTicks());
    }
    if (!bars.length) return notes;
    const aligned = [];
    time = new Fraction(0, 1);
    let index = 0;
    for (const note of notes) {
      while (index < bars.length && !bars[index].greaterThan(time)) {
        // An explicit text bar already provides the slot at this onset.
        const authored = bars[index++].equals(time) && note.shouldIgnoreTicks();
        if (authored) break;
        aligned.push(new TextNote({ text: '', duration: 'b', ignoreTicks: true }));
      }
      aligned.push(note);
      if (!note.shouldIgnoreTicks()) time.add(note.getTicks());
    }
    return aligned;
  }

  /** Create fresh layout voices for each projection and align them on one timeline. */
  private formatAndRender(ctx: any, group: StaveGroup, tabNotes: any[][], scoreNotes: any[][]): Voice[] {
    const beams: Beam[] = [];
    const voices = (projection: any[][], stave: any, tab: boolean) => projection.flatMap((notes, i) => {
      if (!notes.length) return [];
      notes.forEach(note => note.setStave(stave));
      const voice = new Voice(group.meter).setMode(Voice.Mode.SOFT).addTickables(notes);
      beams.push(...this.makeBeams(notes, group.voiceSettings[i], group, i, tab));
      return [voice];
    });
    const tab_stave = group.tab;
    const score_stave = group.note;
    const tab_voices = voices(tabNotes, tab_stave, true);
    const score_voices = voices(scoreNotes, score_stave, false);
    const format_stave = score_stave || tab_stave;
    const text_stave = format_stave;
    const text_notes = group.text_voices;
    const text_voices = text_notes.filter(notes => notes.length).map(notes => {
      const aligned = this.alignTextBars(notes, scoreNotes[0] ?? tabNotes[0] ?? []);
      aligned.forEach(note => note.setStave(text_stave));
      return new Voice(group.meter).setMode(Voice.Mode.SOFT).addTickables(aligned);
    });
    const formatter = new Formatter();
    const allVoices = [...tab_voices, ...score_voices, ...text_voices];
    for (const voices of [tab_voices, score_voices, text_voices]) {
      if (voices.length) formatter.joinVoices(voices);
    }
    if (allVoices.length) {
      formatter.formatToStave(allVoices, format_stave, { alignRests: score_voices.length > 1 });
    }

    for (const voice of tab_voices) {
      this.alignTopAnnotations(voice, tab_stave);
      voice.draw(ctx, tab_stave);
    }
    for (const voice of score_voices) voice.draw(ctx, score_stave);
    for (const beam of beams) beam.setContext(ctx).draw();
    for (const voice of text_voices) voice.draw(ctx, text_stave);
    if (tab_stave && score_stave) {
      new Vex.Flow.StaveConnector(score_stave, tab_stave)
        .setType(Vex.Flow.StaveConnector.type.BRACKET).setContext(ctx).draw();
    }
    return score_stave ? score_voices : tab_voices;
  }

  /**
   * Render the complete score using the provided VexFlow renderer instance.
   * Design note: we recompute layout on every render to match current options.
   */
  render(renderer: any): void {
    const artist = this.artist;
    artist.log('Render: ', artist.options);
    artist.closeBends();

    // Resize to match the computed layout height and scale.
    renderer.resize(
      Number(artist.customizations.width) * Number(artist.customizations.scale),
      (artist.last_y + artist.options.bottom_spacing) * Number(artist.customizations.scale),
    );

    // Prepare a fresh render context per draw.
    const ctx = renderer.getContext();
    // SVG resize composes the old transform. Set an absolute viewBox for every draw.
    if (ctx.setViewBox) ctx.setViewBox(0, 0, Number(artist.customizations.width), artist.last_y + artist.options.bottom_spacing);
    else ctx.scale(Number(artist.customizations.scale), Number(artist.customizations.scale));
    ctx.clear();
    ctx.setFont(artist.options.font_face, artist.options.font_size, '');

    // Cache context for the Player overlay.
    artist.renderer_context = ctx;

    artist.player_voices = [];
    const drawStave = (stave: StaveGroup) => {
      if (stave.note) artist.notes.applyAccidentals(stave);
      const tabNotes = this.prepareStave(stave.tab, stave.tab_voices);
      const scoreNotes = this.prepareStave(stave.note, stave.note_voices);
      if (stave.tab && stave.note) {
        const start = Math.max(stave.tab.getNoteStartX(), stave.note.getNoteStartX());
        stave.tab.setNoteStartX(start);
        stave.note.setNoteStartX(start);
      }
      if (stave.tab) stave.tab.setContext(ctx).draw();
      if (stave.note) stave.note.setContext(ctx).draw();
      const voices = this.formatAndRender(ctx, stave, tabNotes, scoreNotes);
      artist.player_voices.push(voices);
    };
    for (const stave of artist.staves) {
      if (!stave.color) {
        drawStave(stave);
        continue;
      }
      // Native glyphs inherit the row foreground. An explicit note or label can override it.
      const defaults = ctx.getDefaultStyle();
      ctx.save();
      try {
        ctx.setDefaultStyle(inkStyle(stave.color)).setStrokeStyle(stave.color).setFillStyle(stave.color);
        drawStave(stave);
      } finally {
        ctx.setDefaultStyle(defaults);
        ctx.restore();
      }
    }

    artist.log('Rendering tab articulations.');
    artist.tab_articulations.forEach((articulation) => articulation.setContext(ctx).drawWithStyle());

    artist.log('Rendering note articulations.');
    artist.stave_articulations.forEach((articulation) => articulation.setContext(ctx).drawWithStyle());

    // Synchronize the Player overlay (if enabled).
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
  }
}
