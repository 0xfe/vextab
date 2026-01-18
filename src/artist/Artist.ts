// Central orchestration layer for building VexFlow structures from VexTab input.
import Vex from '../vexflow';
import * as _ from '../utils';

import { ArtistRenderer } from './ArtistRenderer';
import { ArticulationBuilder } from './ArticulationBuilder';
import { NoteBuilder } from './NoteBuilder';
import { StaveBuilder } from './StaveBuilder';
import { TextBuilder } from './TextBuilder';

/**
 * Configuration options accepted by the Artist constructor.
 */
export type ArtistOptions = {
  // Default font family for text annotations.
  font_face: string;
  // Default font size (in px).
  font_size: number;
  // Optional font style (e.g., italic).
  font_style: string | null;
  // Additional spacing below the last stave.
  bottom_spacing: number;
  // Gap between tab and text staves.
  tab_stave_lower_spacing: number;
  // Gap between note and text staves.
  note_stave_lower_spacing: number;
  // Render scaling factor.
  scale: number;
};

/**
 * Map of VexTab customization values, normalized to strings/numbers.
 */
export type CustomizationMap = Record<string, string | number | null>;

/**
 * Represents a grouped pair of staves and their voice/note collections.
 */
export type StaveGroup = {
  // Tab stave (if enabled).
  tab: any | null;
  // Notation stave (if enabled).
  note: any | null;
  // Voices assigned to the tab stave.
  tab_voices: any[];
  // Voices assigned to the note stave.
  note_voices: any[];
  // Notes for tab stave.
  tab_notes: any[];
  // Notes for notation stave.
  note_notes: any[];
  // Text voices aligned with this stave group.
  text_voices: any[];
  // Beam groups collected for formatting.
  beam_groups: any;
};

/**
 * Artist orchestrates the VexFlow rendering pipeline. It tracks mutable state
 * (staves, durations, bends, fonts) while delegating focused work to helper
 * classes. The helper classes keep the implementation readable without
 * changing the public VexTab API.
 */
export default class Artist {
  // Enables verbose logging for debugging.
  static DEBUG = false;
  // Hide the VexTab logo when true.
  static NOLOGO = false;

  // Core configuration + user customization state.
  // Immutable options set at construction.
  options: ArtistOptions;
  // Mutable overrides set by VexTab options.
  customizations: CustomizationMap = {};

  // VexFlow helpers.
  // VexFlow helpers for tuning, key, and note math.
  tuning: any;
  key_manager: any;
  music_api: any;

  // Rendered output + annotation state.
  // Rendered output + annotation state.
  staves: StaveGroup[] = [];
  tab_articulations: any[] = [];
  stave_articulations: any[] = [];
  player_voices: any[] = [];

  // Current render cursor / note state.
  // Current render cursor / note state.
  last_y = 0;
  current_duration = 'q';
  current_clef = 'treble';
  current_bends: Record<string, any[]> = {};
  current_octave_shift = 0;
  bend_start_index: number | null = null;
  bend_start_strings: number[] | null = null;

  // Render status and optional Player overlay.
  rendered = false;
  renderer_context: any = null;
  player: any | null = null;

  // Component helpers keep this class lean.
  // Component helpers keep this class lean.
  renderer: ArtistRenderer;
  articulations: ArticulationBuilder;
  notes: NoteBuilder;
  stavesBuilder: StaveBuilder;
  text: TextBuilder;

  // Render origin and width.
  x: number;
  y: number;
  width: number;

  /**
   * Construct an Artist with initial layout coordinates and options.
   * Design note: we keep defaults here to isolate configuration in one place.
   */
  constructor(x: number, y: number, width: number, options?: Partial<ArtistOptions>) {
    this.x = x;
    this.y = y;
    this.width = width;

    // Defaults reflect legacy VexTab behavior.
    this.options = {
      font_face: 'Arial',
      font_size: 10,
      font_style: null,
      bottom_spacing: 20 + (Artist.NOLOGO ? 0 : 10),
      tab_stave_lower_spacing: 10,
      note_stave_lower_spacing: 0,
      scale: 1.0,
    };

    if (options) {
      // Allow callers to override defaults without changing the API shape.
      _.extend(this.options, options);
    }

    // Compose helper objects for focused responsibilities.
    this.renderer = new ArtistRenderer(this);
    this.articulations = new ArticulationBuilder(this);
    this.notes = new NoteBuilder(this);
    this.stavesBuilder = new StaveBuilder(this);
    this.text = new TextBuilder(this);

    this.reset();
  }

  /**
   * Conditional logging helper.
   */
  log(...args: any[]): void {
    // Keep logs guarded to avoid noisy production output.
    if (Artist.DEBUG && console) {
      console.log('(Vex.Flow.Artist)', ...args);
    }
  }

  /**
   * Reset the Artist's internal state prior to a new parse/render cycle.
   * Design note: this is intentionally comprehensive to avoid stale state leaks.
   */
  reset(): void {
    // Core helpers used for fret/notation logic.
    this.tuning = new Vex.Flow.Tuning();
    this.key_manager = new Vex.Flow.KeyManager('C');
    this.music_api = new Vex.Flow.Music();

    // User customizations that can be changed by VexTab options.
    this.customizations = {
      'font-size': this.options.font_size,
      'font-face': this.options.font_face,
      'font-style': this.options.font_style,
      'annotation-position': 'bottom',
      scale: this.options.scale,
      width: this.width,
      'stave-distance': 0,
      space: 0,
      player: 'false',
      tempo: 120,
      instrument: 'acoustic_grand_piano',
      accidentals: 'standard',
      'tab-stems': 'false',
      'tab-stem-direction': 'up',
      'beam-rests': 'true',
      'beam-stemlets': 'true',
      'beam-middle-only': 'false',
      'connector-space': 5,
    };

    // Generated elements.
    this.staves = [];
    this.tab_articulations = [];
    this.stave_articulations = [];

    // Voices for player overlay.
    this.player_voices = [];

    // Current state.
    this.last_y = this.y;
    this.current_duration = 'q';
    this.current_clef = 'treble';
    this.current_bends = {};
    this.current_octave_shift = 0;
    this.bend_start_index = null;
    this.bend_start_strings = null;
    this.rendered = false;
    this.renderer_context = null;
  }

  /**
   * Attach a playback helper to the Artist.
   */
  attachPlayer(player: any): void {
    this.player = player;
  }

  /**
   * Apply user-provided options and validate known keys.
   */
  setOptions(options: Record<string, string>): void {
    this.log('setOptions: ', options);

    // Only allow known customization keys.
    const validOptions = _.keys(this.customizations);
    _.forEach(options, (value, key) => {
      if (validOptions.includes(key)) {
        this.customizations[key] = value;
      } else {
        throw new Vex.RERR('ArtistError', `Invalid option '${key}'`);
      }
    });

    // Apply vertical spacing immediately so subsequent staves start lower.
    this.last_y += parseInt(String(this.customizations.space), 10);
    if (this.customizations.player === 'true') {
      // Reserve extra space for playback controls.
      this.last_y += 15;
    }
  }

  /**
   * Return data used by the Player overlay.
   */
  getPlayerData(): { voices: any[]; context: any; scale: number } {
    return {
      voices: this.player_voices,
      context: this.renderer_context,
      scale: Number(this.customizations.scale),
    };
  }

  // --- Public API used by VexTab (delegates to helper classes) ---

  /**
   * Render the currently parsed score using the provided renderer.
   */
  render(renderer: any): void {
    this.renderer.render(renderer);
  }

  /**
   * Backwards-compatible alias for render().
   */
  draw(renderer: any): void {
    this.render(renderer);
  }

  /**
   * Whether render() has been called and finished.
   */
  isRendered(): boolean {
    return this.rendered;
  }

  /**
   * Whether the logo is suppressed via global flag.
   */
  isLogoHidden(): boolean {
    return Artist.NOLOGO;
  }

  /**
   * Set the duration used for subsequent notes.
   */
  setDuration(time: string, dot = false): void {
    this.notes.setDuration(time, dot);
  }

  /**
   * Add a barline to the current stave group.
   */
  addBar(type: string): void {
    this.stavesBuilder.addBar(type);
  }

  /**
   * Build tuplets for the current voice.
   */
  makeTuplets(tuplets: number, notes?: number): void {
    this.articulations.makeTuplets(tuplets, notes);
  }

  /**
   * Add annotations that will be attached to upcoming notes.
   */
  addAnnotations(annotations: string[]): void {
    this.articulations.addAnnotations(annotations);
  }

  /**
   * Add articulations that will be attached to upcoming notes.
   */
  addArticulations(articulations: Array<string | null>): void {
    this.articulations.addArticulations(articulations);
  }

  /**
   * Add a decorator (e.g., segno/coda) to upcoming notes.
   */
  addDecorator(decorator?: string | null): void {
    this.articulations.addDecorator(decorator || null);
  }

  /**
   * Add a rest with the given parameters.
   */
  addRest(params: Record<string, string>): void {
    this.notes.addRest(params);
  }

  /**
   * Add a chord built from multiple note definitions.
   */
  addChord(chord: any[], chord_articulation?: string | null, chord_decorator?: string | null): void {
    this.notes.addChord(chord, chord_articulation || null, chord_decorator || null);
  }

  /**
   * Add a single note.
   */
  addNote(note: any): void {
    this.notes.addNote(note);
  }

  /**
   * Add a new text voice (for lyric or annotation lines).
   */
  addTextVoice(): void {
    this.text.addTextVoice();
  }

  /**
   * Set the font used for subsequent text notes.
   */
  setTextFont(font: string): void {
    this.text.setTextFont(font);
  }

  /**
   * Add a text note to the current text voice.
   */
  addTextNote(
    text: string,
    position = 0,
    justification: 'center' | 'left' | 'right' = 'center',
    smooth = true,
    ignore_ticks = false,
  ): void {
    this.text.addTextNote(text, position, justification, smooth, ignore_ticks);
  }

  /**
   * Add a new voice to the current stave group.
   */
  addVoice(options?: Record<string, string>): void {
    this.stavesBuilder.addVoice(options || {});
  }

  /**
   * Add a new stave (notation, tablature, or both) to the score.
   */
  addStave(element: string, options: Record<string, string>): void {
    this.stavesBuilder.addStave(element, options);
  }

  /**
   * Open a bend span between notes (used for tab bends).
   */
  openBends(first_note: any, last_note: any, first_indices: number[], last_indices: number[]): void {
    this.articulations.openBends(first_note, last_note, first_indices, last_indices);
  }

  /**
   * Close any open bend spans.
   */
  closeBends(offset = 1): void {
    this.articulations.closeBends(offset);
  }

  /**
   * Handle dot-prefixed VexTab commands (e.g., octave-shift).
   */
  runCommand(line: string, lineNumber = 0, column = 0): void {
    this.log('runCommand: ', line);
    const words = line.split(/\s+/);
    switch (words[0]) {
      case 'octave-shift':
        // Apply octave changes to playback pitch only.
        this.current_octave_shift = parseInt(words[1], 10);
        this.log('Octave shift: ', this.current_octave_shift);
        break;
      default:
        throw new Vex.RERR('ArtistError', `Invalid command '${words[0]}' at line ${lineNumber} column ${column}`);
    }
  }
}
