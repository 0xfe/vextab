// src/artist/Artist.ts
// Central orchestration layer for building VexFlow structures from VexTab input.

import Vex from '../vexflow'; // VexFlow shim for rendering + errors.
import * as _ from '../utils'; // Lightweight utility helpers.

import { ArtistRenderer } from './ArtistRenderer';
import { ArticulationBuilder } from './ArticulationBuilder';
import { NoteBuilder } from './NoteBuilder';
import { StaveBuilder } from './StaveBuilder';
import { TextBuilder } from './TextBuilder';

/**
 * Configuration options accepted by the Artist constructor.
 */
export type ArtistOptions = {
  font_face: string; // Default font family for text annotations.
  font_size: number; // Default font size (in px).
  font_style: string | null; // Optional font style (e.g., italic).
  bottom_spacing: number; // Additional spacing below the last stave.
  tab_stave_lower_spacing: number; // Gap between tab and text staves.
  note_stave_lower_spacing: number; // Gap between note and text staves.
  scale: number; // Render scaling factor.
};

/**
 * Map of VexTab customization values, normalized to strings/numbers.
 */
export type CustomizationMap = Record<string, string | number | null>;

/**
 * Represents a grouped pair of staves and their voice/note collections.
 */
export type StaveGroup = {
  tab: any | null; // Tab stave (if enabled).
  note: any | null; // Notation stave (if enabled).
  tab_voices: any[]; // Voices assigned to the tab stave.
  note_voices: any[]; // Voices assigned to the note stave.
  tab_notes: any[]; // Notes for tab stave.
  note_notes: any[]; // Notes for notation stave.
  text_voices: any[]; // Text voices aligned with this stave group.
  beam_groups: any; // Beam groups collected for formatting.
};

/**
 * Artist orchestrates the VexFlow rendering pipeline. It tracks mutable state
 * (staves, durations, bends, fonts) while delegating focused work to helper
 * classes. The helper classes keep the implementation readable without
 * changing the public VexTab API.
 */
export default class Artist {
  static DEBUG = false; // Enables verbose logging.
  static NOLOGO = false; // Hide the VexTab logo when true.

  // Core configuration + user customization state.
  options: ArtistOptions; // Immutable options set at construction.
  customizations: CustomizationMap = {}; // Mutable overrides set by VexTab options.

  // VexFlow helpers.
  tuning: any; // Vex.Flow.Tuning instance for tab string mapping.
  key_manager: any; // Vex.Flow.KeyManager for pitch computations.
  music_api: any; // Vex.Flow.Music helper for note parsing.

  // Rendered output + annotation state.
  staves: StaveGroup[] = []; // Collection of rendered stave groups.
  tab_articulations: any[] = []; // Tab articulations pending for attachment.
  stave_articulations: any[] = []; // Notation articulations pending for attachment.
  player_voices: any[] = []; // Voices collected for playback rendering.

  // Current render cursor / note state.
  last_y = 0; // Current vertical cursor for the next stave.
  current_duration = 'q'; // Current duration token (quarter note by default).
  current_clef = 'treble'; // Current clef for notation staves.
  current_bends: Record<string, any[]> = {}; // Pending bend segments keyed by string.
  current_octave_shift = 0; // Octave shift applied via command.
  bend_start_index: number | null = null; // Index of the bend start note in a chord.
  bend_start_strings: number[] | null = null; // Strings for bend start in a chord.

  rendered = false; // Whether a render pass has completed.
  renderer_context: any = null; // Cached VexFlow context from the renderer.
  player: any | null = null; // Optional playback helper.

  // Component helpers keep this class lean.
  renderer: ArtistRenderer; // Layout + rendering coordinator.
  articulations: ArticulationBuilder; // Builder for articulations and decorations.
  notes: NoteBuilder; // Builder for notes/chords/rests.
  stavesBuilder: StaveBuilder; // Builder for staves and voices.
  text: TextBuilder; // Builder for text annotations.

  x: number; // Render origin X.
  y: number; // Render origin Y.
  width: number; // Render width.

  /**
   * Construct an Artist with initial layout coordinates and options.
   * Design note: we keep defaults here to isolate configuration in one place.
   */
  constructor(x: number, y: number, width: number, options?: Partial<ArtistOptions>) {
    this.x = x;
    this.y = y;
    this.width = width;

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
      _.extend(this.options, options); // Apply caller-specified overrides.
    }

    this.renderer = new ArtistRenderer(this); // Rendering/layout coordinator.
    this.articulations = new ArticulationBuilder(this); // Articulation builder.
    this.notes = new NoteBuilder(this); // Note builder.
    this.stavesBuilder = new StaveBuilder(this); // Stave builder.
    this.text = new TextBuilder(this); // Text builder.

    this.reset();
  }

  /**
   * Conditional logging helper.
   */
  log(...args: any[]): void {
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
    this.tuning = new Vex.Flow.Tuning(); // Default to standard tuning.
    this.key_manager = new Vex.Flow.KeyManager('C'); // Default key center.
    this.music_api = new Vex.Flow.Music(); // Helper for pitch math.

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
    this.staves = []; // Clear stave groups.
    this.tab_articulations = []; // Clear tab articulations.
    this.stave_articulations = []; // Clear notation articulations.

    // Voices for player overlay.
    this.player_voices = []; // Clear player voice list.

    // Current state.
    this.last_y = this.y; // Reset layout cursor.
    this.current_duration = 'q'; // Reset duration.
    this.current_clef = 'treble'; // Reset clef.
    this.current_bends = {}; // Reset bend tracking.
    this.current_octave_shift = 0; // Reset octave shift.
    this.bend_start_index = null; // Reset bend state.
    this.bend_start_strings = null; // Reset bend state.
    this.rendered = false; // Mark as not yet rendered.
    this.renderer_context = null; // Clear cached renderer context.
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
    const validOptions = _.keys(this.customizations); // All permitted option keys.
    _.forEach(options, (value, key) => {
      if (validOptions.includes(key)) {
        this.customizations[key] = value;
      } else {
        throw new Vex.RERR('ArtistError', `Invalid option '${key}'`);
      }
    });

    this.last_y += parseInt(String(this.customizations.space), 10); // Apply extra spacing.
    if (this.customizations.player === 'true') {
      this.last_y += 15; // Extra room for player controls.
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
    const words = line.split(/\s+/); // Tokenize the command line.
    switch (words[0]) {
      case 'octave-shift':
        this.current_octave_shift = parseInt(words[1], 10); // Apply octave shift.
        this.log('Octave shift: ', this.current_octave_shift);
        break;
      default:
        throw new Vex.RERR('ArtistError', `Invalid command '${words[0]}' at line ${lineNumber} column ${column}`);
    }
  }
}
