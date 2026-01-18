import Vex from '../vexflow';
import * as _ from 'lodash';

import { ArtistRenderer } from './ArtistRenderer';
import { ArticulationBuilder } from './ArticulationBuilder';
import { NoteBuilder } from './NoteBuilder';
import { StaveBuilder } from './StaveBuilder';
import { TextBuilder } from './TextBuilder';

export type ArtistOptions = {
  font_face: string;
  font_size: number;
  font_style: string | null;
  bottom_spacing: number;
  tab_stave_lower_spacing: number;
  note_stave_lower_spacing: number;
  scale: number;
};

export type CustomizationMap = Record<string, string | number | null>;

export type StaveGroup = {
  tab: any | null;
  note: any | null;
  tab_voices: any[];
  note_voices: any[];
  tab_notes: any[];
  note_notes: any[];
  text_voices: any[];
  beam_groups: any;
};

/**
 * Artist orchestrates the VexFlow rendering pipeline. It tracks mutable state
 * (staves, durations, bends, fonts) while delegating focused work to helper
 * classes. The helper classes keep the implementation readable without
 * changing the public VexTab API.
 */
export default class Artist {
  static DEBUG = false;
  static NOLOGO = false;

  // Core configuration + user customization state.
  options: ArtistOptions;
  customizations: CustomizationMap = {};

  // VexFlow helpers.
  tuning: any;
  key_manager: any;
  music_api: any;

  // Rendered output + annotation state.
  staves: StaveGroup[] = [];
  tab_articulations: any[] = [];
  stave_articulations: any[] = [];
  player_voices: any[] = [];

  // Current render cursor / note state.
  last_y = 0;
  current_duration = 'q';
  current_clef = 'treble';
  current_bends: Record<string, any[]> = {};
  current_octave_shift = 0;
  bend_start_index: number | null = null;
  bend_start_strings: number[] | null = null;

  rendered = false;
  renderer_context: any = null;
  player: any | null = null;

  // Component helpers keep this class lean.
  renderer: ArtistRenderer;
  articulations: ArticulationBuilder;
  notes: NoteBuilder;
  stavesBuilder: StaveBuilder;
  text: TextBuilder;

  x: number;
  y: number;
  width: number;

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
      _.extend(this.options, options);
    }

    this.renderer = new ArtistRenderer(this);
    this.articulations = new ArticulationBuilder(this);
    this.notes = new NoteBuilder(this);
    this.stavesBuilder = new StaveBuilder(this);
    this.text = new TextBuilder(this);

    this.reset();
  }

  log(...args: any[]): void {
    if (Artist.DEBUG && console) {
      console.log('(Vex.Flow.Artist)', ...args);
    }
  }

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

  attachPlayer(player: any): void {
    this.player = player;
  }

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

    this.last_y += parseInt(String(this.customizations.space), 10);
    if (this.customizations.player === 'true') {
      this.last_y += 15;
    }
  }

  getPlayerData(): { voices: any[]; context: any; scale: number } {
    return {
      voices: this.player_voices,
      context: this.renderer_context,
      scale: Number(this.customizations.scale),
    };
  }

  // --- Public API used by VexTab (delegates to helper classes) ---

  render(renderer: any): void {
    this.renderer.render(renderer);
  }

  draw(renderer: any): void {
    this.render(renderer);
  }

  isRendered(): boolean {
    return this.rendered;
  }

  isLogoHidden(): boolean {
    return Artist.NOLOGO;
  }

  setDuration(time: string, dot = false): void {
    this.notes.setDuration(time, dot);
  }

  addBar(type: string): void {
    this.stavesBuilder.addBar(type);
  }

  makeTuplets(tuplets: number, notes?: number): void {
    this.articulations.makeTuplets(tuplets, notes);
  }

  addAnnotations(annotations: string[]): void {
    this.articulations.addAnnotations(annotations);
  }

  addArticulations(articulations: Array<string | null>): void {
    this.articulations.addArticulations(articulations);
  }

  addDecorator(decorator?: string | null): void {
    this.articulations.addDecorator(decorator || null);
  }

  addRest(params: Record<string, string>): void {
    this.notes.addRest(params);
  }

  addChord(chord: any[], chord_articulation?: string | null, chord_decorator?: string | null): void {
    this.notes.addChord(chord, chord_articulation || null, chord_decorator || null);
  }

  addNote(note: any): void {
    this.notes.addNote(note);
  }

  addTextVoice(): void {
    this.text.addTextVoice();
  }

  setTextFont(font: string): void {
    this.text.setTextFont(font);
  }

  addTextNote(
    text: string,
    position = 0,
    justification: 'center' | 'left' | 'right' = 'center',
    smooth = true,
    ignore_ticks = false,
  ): void {
    this.text.addTextNote(text, position, justification, smooth, ignore_ticks);
  }

  addVoice(options?: Record<string, string>): void {
    this.stavesBuilder.addVoice(options || {});
  }

  addStave(element: string, options: Record<string, string>): void {
    this.stavesBuilder.addStave(element, options);
  }

  openBends(first_note: any, last_note: any, first_indices: number[], last_indices: number[]): void {
    this.articulations.openBends(first_note, last_note, first_indices, last_indices);
  }

  closeBends(offset = 1): void {
    this.articulations.closeBends(offset);
  }

  runCommand(line: string, lineNumber = 0, column = 0): void {
    this.log('runCommand: ', line);
    const words = line.split(/\s+/);
    switch (words[0]) {
      case 'octave-shift':
        this.current_octave_shift = parseInt(words[1], 10);
        this.log('Octave shift: ', this.current_octave_shift);
        break;
      default:
        throw new Vex.RERR('ArtistError', `Invalid command '${words[0]}' at line ${lineNumber} column ${column}`);
    }
  }
}
