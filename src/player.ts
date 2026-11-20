// Public playback controller for parsed scores and fixed-layout Artist embeds.
import Artist from './artist';
import { projectScoreV2 } from './score/grammar2/project';
import type { ScoreV2 } from './score/grammar2/model';
import type { ParsedScore } from './score/model';
import { PlaybackAnimation, anticipation } from './playback/animation';
import { artistGeometry, scoreSurfaces, type Geometry } from './playback/geometry';
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
  /** Zero-based v2 instrument to play. Omit to play all instruments together. */
  partIndex?: number;
  playback?: PlaybackPlugin;
  /** Place transport buttons here while keeping the cursor on the score. */
  controls?: HTMLElement;
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
  private ensemble?: ParsedScore[];
  private generation = 0;
  private geometry?: () => Geometry;
  private animation?: PlaybackAnimation;
  private mark?: (id: string) => void;
  private readonly options: PlayerOptions;

  /** A parsed score can play headlessly. An Artist supplies its most recently drawn rows. */
  constructor(source: Artist | ParsedScore | ScoreV2, options: PlayerOptions = {}) {
    this.options = { instrument: 'acoustic_grand_piano', tempo: 120, show_controls: true,
      soundfont_url: '/soundfont/', overlay_class: 'vextab-player', ...options };
    if ('parts' in source) {
      const model = source;
      if (options.partIndex === undefined && model.parts.length > 1) {
        this.ensemble = model.parts.map((_, i) => projectScoreV2(model, i));
      }
      source = projectScoreV2(model, options.partIndex);
    }
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
    this.ensemble = undefined;
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
    this.geometry = undefined;
    if (this.artist?.player === this) this.artist.attachPlayer(null);
  }

  /** An embed may provide its SVG layout and a source-aware cursor callback. */
  render(surface?: HTMLCanvasElement | SVGSVGElement, mark?: (id: string) => void): void {
    this.removeControls();
    this.mark = mark;
    const layout = surface && scoreSurfaces.get(surface);
    this.geometry = layout && layout.score === this.score ? layout.read : undefined;
    const ctx = this.artist?.getPlayerData().context;
    const element = surface ?? ctx?.canvas ?? ctx?.svg;
    if (!element && !this.options.controls) throw new Error('Render the score before mounting playback controls');
    this.overlay = new PlayerOverlay(element, this.options.overlay_class, this.options.show_controls,
      () => { void this.play().catch(() => { /* play displays the error on this overlay. */ }); }, () => this.stop(), this.options.controls);
  }

  /** Move the cursor using score coordinates, including reflowed SVG note positions. */
  moveCursor(x: number, y: number): void { this.overlay?.moveCursor(x, y); }

  /** Start the selected instrument from the user's gesture. Failures are also shown on the controls. */
  async play(): Promise<void> {
    if (this.transport.active) return;
    const generation = ++this.generation;
    const { tempo, instrument, playback, soundfont_url } = this.options;
    const music = this.score ? scorePerformance(this.score, tempo, this.mark)
      : artistPerformance(this.artist, tempo);
    if (this.ensemble) {
      const parts = this.ensemble.slice(1).map(part => scorePerformance(part, tempo, this.mark));
      music.events = music.events.concat(...parts.map(p => p.events)).sort((a, b) => a.time - b.time);
    }
    const plugin = playback ?? (!this.artist || typeof MIDI === 'undefined' ? createWebAudioPlayback()
      : legacyMidiPlayback(String(instrument), soundfont_url, Player.INSTRUMENTS_LOADED));
    if (this.options.controls && !music.events.some(event => event.notes.length)) {
      this.overlay?.setStatus('This example has no pitched notes to play.');
      return;
    }
    this.overlay?.setPlaying(true);
    this.overlay?.setStatus('Loading instruments...');
    try {
      const geometry = this.geometry?.() ?? (this.artist && this.overlay ? artistGeometry(this.artist) : undefined);
      if (geometry?.size) this.animation = new PlaybackAnimation(this.overlay?.surface, music, geometry);
      await this.transport.play(plugin, programNumber(instrument), music, elapsed => {
        this.animation?.start(elapsed);
        this.overlay?.setStatus('');
        this.overlay?.setPlaying(true);
      }, this.animation ? anticipation : 0);
    } catch (error) {
      if (generation === this.generation) {
        this.overlay?.setPlaying(false);
        this.overlay?.setStatus(error instanceof Error ? error.message : String(error));
      }
      throw error;
    } finally {
      if (generation === this.generation) {
        this.animation?.stop();
        this.animation = undefined;
        this.overlay?.setPlaying(false);
      }
    }
  }

  /** Stop pending loads, sounding notes, and cursor updates for this player. */
  stop(): void {
    this.generation++;
    this.transport.stop();
    this.animation?.stop();
    this.animation = undefined;
    this.overlay?.setStatus('');
    this.overlay?.setPlaying(false);
  }
}

if (!Vex.Flow.Player) Vex.Flow.Player = Player;
