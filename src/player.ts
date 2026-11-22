// Public playback controller for parsed scores and fixed-layout Artist embeds.
import Artist from './artist';
import { selectedPart } from './score/conductor';
import { projectScoreV2 } from './score/grammar2/project';
import type { ScoreV2 } from './score/grammar2/model';
import type { ParsedScore } from './score/model';
import { PlaybackAnimation, anticipation } from './playback/animation';
import { artistGeometry, scoreSurfaces, type Geometry } from './playback/geometry';
import { createPerformer, type PerformerName, type PerformerProfile, type PerformanceBar, type SwingSetting } from './playback/performer';
import { sheetControlSettings, type SheetControls } from './playback/control-options.mts';
import { PlayerOverlay } from './player-overlay';
import { routedPlayback } from './playback/routing';
import { ensembleVisits } from './playback/visits';
import { artistPerformance, ensembleBars, scorePerformance } from './playback/performance';
import { PlaybackTransport, type PlaybackPlugin, type Performance } from './playback/transport';
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
  partId?: string;
  playback?: PlaybackPlugin;
  /** Configure or hide the sheet controls, or mount a transport in a separate host. */
  controls?: HTMLElement | boolean | SheetControls;
  tempo?: number;
  /** Override the written performer. Each play takes a fresh seed unless one is supplied. */
  performer?: PerformerName | PerformerProfile;
  seed?: number;
  /** Override the written swing directive for this performance. */
  swing?: SwingSetting;
  order?: 'written' | 'performed';
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
  private performanceTempo = 120;
  private sharedSurface = false;
  private geometry?: () => Geometry;
  private companions: { overlay: PlayerOverlay; read: () => Geometry; score: ParsedScore }[] = [];
  private animations: PlaybackAnimation[] = [];
  private mark?: (id: string) => void;
  private readonly options: PlayerOptions;

  /** A parsed score can play headlessly. An Artist supplies its most recently drawn rows. */
  constructor(source: Artist | ParsedScore | ScoreV2, options: PlayerOptions = {}) {
    this.options = { instrument: 'acoustic_grand_piano', tempo: 120, show_controls: true,
      soundfont_url: '/soundfont/', overlay_class: 'vextab-player', ...options };
    if ('parts' in source) {
      const model = source;
      if (options.partId === undefined && options.partIndex === undefined && model.parts.length > 1) {
        this.ensemble = model.parts.map((_, i) => projectScoreV2(model, i));
      }
      source = projectScoreV2(model, selectedPart(model, options));
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

  /** Apply a new tempo to future attacks and keep the playhead at its current beat. */
  setTempo(tempo: number): void {
    if (!Number.isFinite(tempo) || tempo <= 0) throw new RangeError('Tempo must be positive');
    this.options.tempo = tempo;
    this.overlay?.setTempo(tempo);
    if (this.transport.active) this.transport.setRate(tempo / this.performanceTempo);
  }

  setInstrument(instrument: string | number): void {
    programNumber(instrument);
    this.options.instrument = instrument;
    this.stop();
  }

  /** Reattach the Artist after a reset and invalidate any earlier play request. */
  reset(): void { this.artist?.attachPlayer(this); this.stop(); }

  /** Remove the whole overlay on redraw or when the source disables playback. */
  removeControls(): void {
    this.stop();
    this.overlay?.remove();
    this.overlay = undefined;
    for (const view of this.companions) view.overlay.remove();
    this.companions = [];
  }

  dispose(): void {
    this.removeControls();
    this.mark = undefined;
    this.geometry = undefined;
    if (this.artist?.player === this) this.artist.attachPlayer(null);
  }

  /** One transport drives all registered part surfaces. The first hosts the controls. */
  render(surface?: HTMLCanvasElement | SVGSVGElement, mark?: (id: string) => void,
    additional: readonly (HTMLCanvasElement | SVGSVGElement)[] = []): void {
    this.removeControls();
    this.mark = mark;
    const layout = surface && scoreSurfaces.get(surface);
    this.sharedSurface = !!this.ensemble && !!layout?.ensemble && this.ensemble.every((score, i) => layout.ensemble[i] === score);
    this.geometry = layout && layout.score === this.score ? layout.read : undefined;
    const ctx = this.artist?.getPlayerData().context;
    const element = surface ?? ctx?.canvas ?? ctx?.svg;
    const controls = this.options.controls;
    const toolbar = controls instanceof HTMLElement ? controls : undefined;
    if (!element && !toolbar) throw new Error('Render the score before mounting playback controls');
    const written = this.score?.playback?.controls;
    const custom = typeof controls === 'object' && !(controls instanceof HTMLElement) ? controls : undefined;
    const settings = sheetControlSettings({ ...written, ...custom });
    if ((controls === true || toolbar) && settings.visibility === 'off') settings.visibility = 'hover';
    const overlay = (target: HTMLCanvasElement | SVGSVGElement, buttons: boolean, host?: HTMLElement) =>
      new PlayerOverlay(target, this.options.overlay_class, buttons,
        () => { void this.play().catch(() => { /* play displays the error on the main overlay. */ }); }, () => this.stop(),
        this.options.tempo, bpm => this.setTempo(bpm), settings, host);
    this.overlay = overlay(element, this.options.show_controls && controls !== false && settings.visibility !== 'off', toolbar);
    const parts = new Set(this.ensemble);
    for (const target of additional) {
      const layout = scoreSurfaces.get(target);
      if (layout && parts.has(layout.score)) this.companions.push({ ...layout, overlay: overlay(target, false) });
    }
  }

  /** Move the cursor using score coordinates, including reflowed SVG note positions. */
  moveCursor(x: number, y: number): void { this.overlay?.moveCursor(x, y); }

  /** Start the selected instrument from the user's gesture. Failures are also shown on the controls. */
  async play(): Promise<void> {
    if (this.transport.active) return;
    const generation = ++this.generation;
    const { tempo, instrument, playback, soundfont_url } = this.options;
    this.performanceTempo = tempo;
    const ensemble = this.ensemble ?? (this.score ? [this.score] : []);
    const visits = ensembleVisits(ensemble, this.options.order === 'performed');
    const take = createPerformer(this.options.performer ?? this.score?.playback?.performer, this.options.seed,
      this.options.swing ?? this.score?.playback?.swing);
    const bars = ensemble.map((): PerformanceBar[] => []);
    const written = ensemble.length ? ensemble.map((score, i) =>
      scorePerformance(score, tempo, this.mark, visits.get(score), take, take.needsBeatGrid ? bars[i] : undefined))
      : [artistPerformance(this.artist, tempo)];
    const parts = take.perform(written, ensembleBars(bars), tempo);
    const first = parts[0];
    const performances = new Map<ParsedScore, Performance>(ensemble.map((score, i) => [score, parts[i]]));
    const music = parts.length === 1 ? first : {
      events: parts.flatMap(p => p.events).sort((a,b) => a.time - b.time),
      duration: Math.max(...parts.map(p => p.duration)),
    };
    const plugin = playback ?? (!this.artist || typeof MIDI === 'undefined' ? createWebAudioPlayback()
      : legacyMidiPlayback(String(instrument), soundfont_url, Player.INSTRUMENTS_LOADED, take.literal));
    if (this.overlay && !music.events.some(event => event.notes.length)) {
      this.overlay?.setStatus('This example has no pitched notes to play.');
      return;
    }
    this.overlay?.setPlaying(true);
    this.overlay?.setStatus('Loading instruments...');
    try {
      const geometry = this.geometry?.() ?? (this.artist && this.overlay ? artistGeometry(this.artist) : undefined);
      if (geometry?.size) this.animations.push(new PlaybackAnimation(this.overlay?.surface, this.sharedSurface ? music : first, geometry,
        (bar, newSystem) => this.overlay?.followSystem(bar, newSystem)));
      for (const view of this.companions) {
        const part = performances.get(view.score);
        if (part) this.animations.push(new PlaybackAnimation(view.overlay.surface, part, view.read()));
      }
      const fallback = programNumber(instrument);
      const programs = [...new Set(music.events.flatMap(e => e.notes.map(n => n.program ?? fallback)))];
      const routed = programs.some(p => p !== fallback) ? routedPlayback(plugin, programs) : plugin;
      await this.transport.play(routed, fallback, music, elapsed => {
        for (const animation of this.animations) animation.start(elapsed);
        this.overlay?.setStatus('');
        this.overlay?.setPlaying(true);
      }, this.animations.length ? anticipation : 0);
    } catch (error) {
      if (generation === this.generation) {
        this.overlay?.setPlaying(false);
        this.overlay?.setStatus(error instanceof Error ? error.message : String(error));
      }
      throw error;
    } finally {
      if (generation === this.generation) {
        this.stopAnimations();
        this.overlay?.setPlaying(false);
      }
    }
  }

  private stopAnimations(): void {
    for (const animation of this.animations) animation.stop();
    this.animations = [];
  }

  /** Stop pending loads, sounding notes, and cursor updates for this player. */
  stop(): void {
    this.generation++;
    this.transport.stop();
    this.stopAnimations();
    this.overlay?.setStatus('');
    this.overlay?.setPlaying(false);
  }
}

if (!Vex.Flow.Player) Vex.Flow.Player = Player;
