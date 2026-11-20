// Public playback controller for parsed scores and fixed-layout Artist embeds.
import Artist from './artist';
import type { ParsedScore } from './score/model';
import { PlayerOverlay } from './player-overlay';
import { artistPerformance, scorePerformance } from './playback/performance';
import { PlaybackTransport, type PlaybackPlugin } from './playback/transport';
import { createWebAudioPlayback } from './playback/web-audio';
import { legacyMidiPlayback } from './playback/legacy-midi';
import Vex from './vexflow';

/** General MIDI programs supported by historical instrument names. Numeric programs are also accepted. */
const programs: Record<string, number> = { acoustic_grand_piano: 0, acoustic_guitar_nylon: 24, acoustic_guitar_steel: 25,
  electric_guitar_jazz: 26, distortion_guitar: 30, electric_bass_finger: 33, electric_bass_pick: 34, trumpet: 56,
  brass_section: 61, soprano_sax: 64, alto_sax: 65, tenor_sax: 66, baritone_sax: 67, flute: 73, synth_drum: 118 };

function programNumber(instrument: string | number) {
  const program = /^\d+$/.test(String(instrument)) ? Number(instrument) : programs[instrument];
  if (!Number.isInteger(program) || program < 0 || program > 127) throw new RangeError('Invalid instrument: ' + instrument);
  return program;
}

/** One plugin instance may open independent sessions for multiple players. */
export interface PlayerOptions {
  playback?: PlaybackPlugin;
  tempo?: number;
  instrument?: string | number;
  show_controls?: boolean;
  overlay_class?: string;
  soundfont_url?: string;
}

export default class Player {
  static DEBUG = false;
  static INSTRUMENTS_LOADED: Record<string, boolean> = {};
  private readonly transport = new PlaybackTransport();
  private overlay?: PlayerOverlay;
  private artist?: Artist;
  private score?: ParsedScore;
  private generation = 0;
  private mark?: (id: string) => void;
  private readonly options: PlayerOptions;

  /** A parsed score can play headlessly. An Artist supplies its most recently drawn rows. */
  constructor(source: Artist | ParsedScore, options: PlayerOptions = {}) {
    this.options = { instrument: 'acoustic_grand_piano', tempo: 120, show_controls: true,
      soundfont_url: '/soundfont/', overlay_class: 'vextab-player', ...options };
    if ('measures' in source) {
      this.score = source;
      this.options.tempo = options.tempo ?? source.playback?.tempo ?? 120;
      this.options.instrument = options.instrument ?? source.playback?.instrument ?? 'acoustic_grand_piano';
    }
    else this.artist = source;
    this.setTempo(this.options.tempo);
    this.setInstrument(this.options.instrument);
    this.reset();
  }

  /** Swap Artists and release the previous score and controls. */
  setArtist(artist: Artist): void {
    this.dispose();
    this.score = undefined;
    this.artist = artist;
    this.reset();
  }

  setTempo(tempo: number): void {
    if (!Number.isFinite(tempo) || tempo <= 0) throw new RangeError('Tempo must be positive');
    this.options.tempo = tempo;
    this.stop();
  }

  setInstrument(instrument: string | number): void {
    programNumber(instrument);
    this.options.instrument = instrument;
    this.stop();
  }

  /** Reattach the Artist after a reset and invalidate any earlier play request. */
  reset(): void { this.artist?.attachPlayer(this); this.stop(); }

  /** Remove the whole overlay on redraw or when the source disables playback. */
  removeControls(): void { this.stop(); this.overlay?.remove(); this.overlay = undefined; }

  dispose(): void {
    this.removeControls();
    this.mark = undefined;
    if (this.artist?.player === this) this.artist.attachPlayer(null);
  }

  /** An embed may provide its SVG layout and a source-aware cursor callback. */
  render(surface?: HTMLCanvasElement | SVGSVGElement, mark?: (id: string) => void): void {
    this.removeControls();
    this.mark = mark;
    const ctx = this.artist?.getPlayerData().context;
    const element = surface ?? ctx?.canvas ?? ctx?.svg;
    if (!element) throw new Error('Render the score before mounting playback controls');
    this.overlay = new PlayerOverlay(element, this.options.overlay_class, this.options.show_controls,
      () => { void this.play().catch(() => { /* play displays the error on this overlay. */ }); }, () => this.stop());
  }

  /** Move the cursor using score coordinates, including reflowed SVG note positions. */
  moveCursor(x: number, y: number): void { this.overlay?.moveCursor(x, y); }

  /** Start the selected instrument from the user's gesture. Failures are also shown on the controls. */
  async play(): Promise<void> {
    if (this.transport.active) return;
    const generation = ++this.generation;
    const { tempo, instrument, playback, soundfont_url } = this.options;
    const music = this.score ? scorePerformance(this.score, tempo, this.mark)
      : artistPerformance(this.artist, tempo, glyph => this.moveCursor(glyph.getAbsoluteX() + 4, glyph.getStave().getYForLine(2)));
    const plugin = playback ?? (!this.artist || typeof MIDI === 'undefined' ? createWebAudioPlayback()
      : legacyMidiPlayback(String(instrument), soundfont_url, Player.INSTRUMENTS_LOADED));
    this.overlay?.setStatus('Loading instruments...');
    try {
      await this.transport.play(plugin, programNumber(instrument), music, () => {
        this.overlay?.setStatus('');
        this.overlay?.setPlaying(true);
      });
      if (generation === this.generation) this.overlay?.setPlaying(false);
    } catch (error) {
      if (generation === this.generation) {
        this.overlay?.setPlaying(false);
        this.overlay?.setStatus(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  /** Stop pending loads, sounding notes, and cursor updates for this player. */
  stop(): void {
    this.generation++;
    this.transport.stop();
    this.overlay?.setStatus('');
    this.overlay?.setPlaying(false);
  }
}

if (!Vex.Flow.Player) Vex.Flow.Player = Player;
