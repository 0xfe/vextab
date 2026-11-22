// DOM integration layer that renders VexTab inside a selected element, with optional editor UI.

/**
 * VexTab.Div renders VexTab code inside a DOM element, with optional
 * live-editing and error display support.
 */

import Vex from './vexflow';
import Artist from './artist';
import VexTab from './vextab';
import Player, { type PlayerOptions } from './player';
import { isPerformerName } from './playback/profiles.mts';
import { createWebAudioPlayback } from './playback/web-audio';
import type { PlaybackPlugin } from './playback/transport';
import type { SourceRange } from './score/source';
import type { ScoreReadingEvent } from 'vexflow';
import { projectScoreV2 } from './score/grammar2/project';
import { parseScore, ScoreV2Error } from './score/parse';
import { selectedPart, type PartSelector } from './score/conductor';
import { renderScore, renderConductor, type Part } from './score/layout';
import type { ParsedScore } from './score/model';
import type { ScoreV2 } from './score/grammar2/model';

import { setFretPaper } from './score/color';

// Webpack embeds the stylesheet here. Consumers of the declarations need no CSS loader.
declare const require: (asset: './vextab.css') => void;
require('./vextab.css');

/** Prefer standard data attributes, including the original editor dimension spellings. */
function embedAttribute(host: HTMLElement, name: string, legacyName?: string): string | null {
  return host.getAttribute(`data-${name}`)
    || (legacyName ? host.getAttribute(`data-${legacyName}`) : null)
    || host.getAttribute(name);
}

/** A grand staff needs the shared measure formatter. An explicit embed layout wins. */
export function usesFlowLayout(host: HTMLElement, source: string): boolean {
  const layout = embedAttribute(host, 'layout');
  return layout === 'flow' || (!layout && /^[ \t]*piano(?:\s|$)/m.test(source));
}

/** Host integrations can supply an instrument without loading any synthesizer into VexTab. */
export interface DivOptions {
  language?: 1 | 2;
  partIndex?: number;
  partId?: string;
  view?: 'parts' | 'conductor';
  playback?: PlaybackPlugin;
  /** Choose performed order to follow repeat signs and endings. */
  order?: 'written' | 'performed';
  performer?: PlayerOptions['performer'];
  seed?: number;
  /** Enable sheet playback even when the source omits player=true. */
  player?: boolean;
  /** Always offer playback for this embed and place its controls in this host. */
  playbackControls?: HTMLElement;
}

class Div {
  private player?: Player;
  private readonly playback: PlaybackPlugin;
  private readonly enablePlayer: boolean;
  private readonly playbackControls?: HTMLElement;
  // Host element + renderer state.
  private sel: string | HTMLElement;
  private code: string;
  private width: number;
  private autoWidth: boolean;
  private scale: number;
  private rendererBackend: string;
  private flow: boolean;
  private readonly grammar2: boolean;
  private partIndex?: number;
  private partId?: string;
  private conductor: boolean;
  private readonly performer: DivOptions['performer'];
  private readonly seed?: number;
  private readonly order: DivOptions['order'];
  private part: Part = 'score';
  private observer?: ResizeObserver;
  private resizeFrame?: number;
  private disposed = false;
  private composing = false;
  private diagnostic?: SourceRange;
  private candidate?: ParsedScore;
  private document?: ScoreV2;
  private current?: { score: ParsedScore; layouts: ReturnType<typeof renderScore>[] };
  private surface: HTMLElement | null = null;

  // Optional editor UI state.
  private editor: string;
  private show_errors: string;
  private editor_width: number;
  private editor_height: number;
  private text_area: any = null;
  private editor_error: any = null;
  private timeoutID: any = null;

  // Parser + renderer helpers.
  private artist: Artist;
  private parser: VexTab<1>;

  /**
   * Construct the Div renderer and immediately render the initial markup.
   * Design note: we read once from the DOM and then manage our own state.
   */
  constructor(sel: string | HTMLElement, options: DivOptions = {}) {
    this.order = options.order;
    this.enablePlayer = options.player || !!options.playbackControls;
    this.playbackControls = options.playbackControls;
    this.playback = options.playback ?? createWebAudioPlayback();
    this.sel = sel;
    if (!this.sel) {
      throw new Error(`VexTab.Div: invalid selector: ${sel}`);
    }

    // Read initial markup and clear the container so we own rendering.
    this.code = $(sel).text();
    $(sel).empty();

    if ($(sel).css('position') === 'static') {
      $(sel).css('position', 'relative');
    }

    const host = $(sel)[0] as HTMLElement;
    const name = embedAttribute(host, 'performer');
    if (options.performer !== undefined) this.performer = options.performer;
    else if (name) {
      if (!isPerformerName(name)) throw new RangeError('Unknown performer: ' + name);
      this.performer = name;
    }
    this.seed = options.seed;
    const width = embedAttribute(host, 'width');
    this.width = parseInt(width, 10) || 400;
    this.scale = parseFloat(embedAttribute(host, 'scale')) || 1.0;
    this.rendererBackend = embedAttribute(host, 'renderer') || 'svg';
    const language = options.language ?? Number(embedAttribute(host, 'language') ?? 2);
    if (language !== 1 && language !== 2) throw new RangeError('Expected VexTab language 1 or 2');
    this.grammar2 = language === 2;
    this.partIndex = options.partIndex;
    this.partId = options.partId ?? embedAttribute(host, 'part-id') ?? undefined;
    this.conductor = (options.view ?? embedAttribute(host, 'view')) === 'conductor';
    if (this.conductor && (!this.grammar2 || this.partIndex !== undefined || this.partId !== undefined))
      throw new Error('The conductor view requires a complete v2 score');
    this.flow = this.grammar2 || usesFlowLayout(host, this.code);
    host.classList.toggle('vextab-flow', this.flow);

    this.editor = embedAttribute(host, 'editor') || '';
    this.show_errors = embedAttribute(host, 'show-errors') || '';
    this.editor_width = parseInt(embedAttribute(host, 'editor-width', 'editor_width'), 10) || this.width;
    this.editor_height = parseInt(embedAttribute(host, 'editor-height', 'editor_height'), 10) || 200;

    if (this.editor === 'true') {
      // Build editor UI and debounce renders to avoid thrashing.
      this.text_area = $('<textarea aria-label="VexTab source"></textarea>').addClass('editor')
        .val(this.code);
      this.code = this.text_area.val(); // The browser normalizes textarea newlines to LF.
      this.editor_error = $('<div role="status"></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
      $(sel).append($('<p/>')).append(this.text_area);
      this.text_area.width(this.editor_width);
      this.text_area.height(this.editor_height);
      this.text_area.on('compositionstart.vextab', () => {
        this.composing = true;
        window.clearTimeout(this.timeoutID);
      });
      this.text_area.on('compositionend.vextab', () => { this.composing = false; this.scheduleEdit(); });
      this.text_area.on('input.vextab', () => this.scheduleEdit());
      this.text_area.on('keydown.vextab', (event: KeyboardEvent) => {
        if (!this.composing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          this.run();
        }
      });
    } else if (this.show_errors === 'true') {
      // Error display without the editor UI.
      this.editor_error = $('<div role="status"></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
    }

    // Initialize parser and renderer.
    if (!this.flow) {
      this.artist = new Artist(10, 0, this.width, { scale: this.scale });
      this.parser = new VexTab(this.artist, { language: 1 });
    }

    this.autoWidth = this.flow && embedAttribute(host, 'layout') !== 'fixed' && (width === null || width === 'auto');
    if (this.autoWidth && host.clientWidth > 20) this.width = host.clientWidth;
    this.redraw();
    // Embedded music fonts can finish after the first synchronous draw.
    if (document.fonts.status === 'loading') {
      void document.fonts.ready.then(() => { if (!this.disposed) this.redraw(); });
    }
    if (this.autoWidth) {
      this.observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        // A new score changes host height. Draw outside the observer delivery cycle.
        cancelAnimationFrame(this.resizeFrame);
        if (width > 20 && width !== this.width) {
          this.resizeFrame = requestAnimationFrame(() => {
            this.width = width;
            this.draw();
          });
        }
      });
      this.observer.observe(host);
    }
  }

  /** Stop observing an embed when a host removes it or replaces the editor. */
  dispose(): void {
    this.disposed = true;
    this.player?.dispose();
    this.observer?.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    window.clearTimeout(this.timeoutID);
    this.text_area?.off('.vextab');
  }

  /** Wait for a complete IME composition before parsing the edited source. */
  private scheduleEdit(): void {
    window.clearTimeout(this.timeoutID);
    this.player?.removeControls();
    if (!this.composing) this.timeoutID = window.setTimeout(() => this.run(), 250);
  }

  /** Engrave the live editor contents immediately. */
  run(): this {
    window.clearTimeout(this.timeoutID);
    if (this.disposed || this.composing) return this;
    this.code = this.text_area?.val() ?? this.code;
    return this.redraw();
  }

  /** Reader IDs are valid only for the current, successfully drawn source revision. */
  getReadingEvents(): readonly ScoreReadingEvent[] {
    return this.getScore() ? this.current.layouts.flatMap(layout => layout.navigation.events) : [];
  }

  /** Return the current source diagnostic, including a located engraving warning. */
  getDiagnosticRange(): SourceRange | undefined {
    return !this.disposed && this.code === (this.text_area?.val() ?? this.code) ? this.diagnostic : undefined;
  }

  /** Select the precise compiler diagnostic in the editor that produced it. */
  selectError(): boolean {
    const range = this.getDiagnosticRange();
    if (!range || !this.text_area) return false;
    this.text_area[0].focus();
    this.text_area[0].setSelectionRange(range.start, range.end);
    return true;
  }

  /** Return the current parsed v2 document, including when just its conductor layout fails. */
  getScoreDocument(): ScoreV2 | undefined {
    return !this.disposed && this.document?.source === (this.text_area?.val() ?? this.code) ? this.document : undefined;
  }

  /** Switch between the conductor and an instrument while retaining the live editor contents. */
  setInstrumentView(target: 'conductor' | PartSelector, part: Part = 'score'): this {
    if (!this.grammar2) throw new Error('Instrument selection requires a v2 score');
    this.conductor = target === 'conductor';
    this.partIndex = target === 'conductor' ? undefined : target.partIndex;
    this.partId = target === 'conductor' ? undefined : target.partId;
    this.part = target === 'conductor' ? 'score' : part;
    return this.run();
  }

  /** Change the projection without rewriting the score or losing the current editor revision. */
  setPart(part: Part): this {
    if (!this.flow) throw new Error('setPart requires layout="flow"');
    this.part = part;
    return this.draw();
  }

  /**
   * Parse and draw the current code in one pass for convenience.
   */
  redraw(): this {
    // Wrap parse/draw with VexFlow benchmarking to support legacy timing logs.
    Vex.BM('Total render time: ', () => {
      this.parse();
      this.draw();
    });

    return this;
  }

  /** Report errors as text and identify the last successfully drawn score. */
  private reportError(error: Error): void {
    this.player?.removeControls();
    this.diagnostic = error instanceof ScoreV2Error ? { start: error.range[0], end: error.range[1], line: error.line, column: error.column - 1 }
      : (error as Error & { range?: SourceRange }).range;
    this.surface?.setAttribute('data-preview-stale', 'true');
    const prefix = this.surface ? 'Showing the last valid score. ' : '';
    this.editor_error?.text(prefix + error.message);
    $(this.sel)[0].dispatchEvent(new Event('vextab-render'));
  }

  /** Only expose a flow score while its source matches the live editor, even during debounce. */
  getScore(): ParsedScore | undefined {
    if (!this.disposed && this.current && this.current.score === this.candidate && !this.surface?.hasAttribute('data-preview-stale')
        && this.current.score.source === (this.text_area?.val() ?? this.code)) return this.current.score;
  }

  /** Rebuild flow geometry from the same parsed revision at a new width. */
  setWidth(width: number): this {
    if (!this.flow) throw new Error('setWidth requires layout="flow"');
    this.observer?.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.autoWidth = false;
    this.width = width;
    return this.draw();
  }

  /** Accept either a musical ID or a projection ID from the current layout. */
  selectSource(id: string, revision: ParsedScore): boolean {
    const score = this.getScore();
    const range = score && score === revision && this.current.layouts.map(layout => layout.rangeFor(id, score.source)).find(Boolean);
    if (!range || !this.text_area) return false;
    const editor = this.text_area[0] as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(range.start, range.end);
    return true;
  }

  /** Bind editor selection to this surface and its current instrument or conductor geometry. */
  private drawView(host: HTMLElement, score: ParsedScore | ScoreV2, revision: ParsedScore) {
    const renderer = this.rendererBackend.toLowerCase() === 'canvas' ? 'canvas' : 'svg';
    // The formatter takes engraving units. A scaled, auto-width score can fit more
    // music in the host's CSS pixels. An authored page width fixes its system breaks.
    const available = Math.max(21, this.width / (score.layout?.scale ?? 1));
    const width = this.autoWidth ? score.layout?.width ?? available : this.width;
    const layout = 'parts' in score
      ? renderConductor(host, score, { width, renderer })
      : renderScore(host, score, { width, part: this.part, renderer });
    const surface = host.querySelector<HTMLCanvasElement | SVGSVGElement>('svg, canvas');
    if (this.text_area) surface.addEventListener('click', (event: MouseEvent) => {
      let point: DOMPoint;
      if (surface instanceof SVGSVGElement) {
        const transform = surface.getScreenCTM();
        if (!transform) return;
        point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      } else {
        const rect = surface.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        point = new DOMPoint((event.clientX - rect.left) * surface.clientWidth / rect.width,
          (event.clientY - rect.top) * surface.clientHeight / rect.height);
      }
      const hit = layout.hitTest(point.x, point.y);
      if (hit) this.selectSource(hit.id, revision);
    });
    return { layout, surface };
  }

  /** Mount the conductor, the selected part, or independent parts in source order. */
  private drawFlow(next: HTMLElement): void {
    if (!this.grammar2 && (this.rendererBackend.toLowerCase() !== 'svg' || this.scale !== 1)) {
      throw new Error('Flow layout requires SVG at scale 1. Use width to reflow.');
    }
    const score = this.candidate, documentScore = this.document;
    const ensemble = documentScore && this.part === 'score' && this.partId === undefined && this.partIndex === undefined && documentScore.parts.length > 1;
    const drawings = () => {
      if (this.conductor && this.part === 'score') return [this.drawView(next, documentScore, score)];
      if (!ensemble) return [this.drawView(next, score, score)];
      return documentScore.parts.map((_, i) => {
        const host = next.appendChild(document.createElement('div'));
        return this.drawView(host, projectScoreV2(documentScore, i), score);
      });
    };
    const mounted = drawings();
    if (this.grammar2 && this.scale !== 1) next.style.zoom = String(this.scale);
    this.player?.dispose();
    this.player = undefined;
    if (this.enablePlayer || score.playback?.enabled) {
      const player = this.player = new Player(ensemble ? documentScore : mounted[0].layout.score, {
        playback: this.playback, controls: this.playbackControls, performer: this.performer, seed: this.seed, order: this.order,
      });
      player.render(mounted[0].surface, undefined, mounted.slice(1).map(d => d.surface));
    }
    this.current = { score, layouts: mounted.map(d => d.layout) };
  }

  /** Commit a new surface only after engraving succeeds, including Canvas pixels. */
  private drawInternal(): this {
    if (this.flow ? !this.candidate : !this.parser.isValid()) return this;
    const canvas = this.rendererBackend.toLowerCase() === 'canvas';
    const next = document.createElement(canvas && !this.flow ? 'canvas' : 'div');
    next.className = 'vex-canvas';
    const host = $(this.sel)[0] as HTMLElement;
    host.insertBefore(next, host.firstChild);
    try {
      if (this.flow) this.drawFlow(next);
      else {
        const backend = canvas ? Vex.Flow.Renderer.Backends.CANVAS : Vex.Flow.Renderer.Backends.SVG;
        const renderer = new Vex.Flow.Renderer(next, backend);
        if (!canvas) setFretPaper(renderer.getContext(), next);
        if (this.enablePlayer) this.artist.customizations.player = 'true';
        if (!this.player && this.artist.customizations.player === 'true') {
          this.player = new Player(this.artist, { playback: this.playback, controls: this.playbackControls, performer: this.performer, seed: this.seed });
        }
        this.artist.draw(renderer);
        if (canvas) {
          const summary = this.artist.staves.map((group, i) => {
            const voices = group.tab ? group.tab_voices : group.note_voices;
            const lines = voices.map((notes, v) => 'Voice ' + (v + 1) + '. ' + notes
              .filter(note => !note.shouldIgnoreTicks()).map(note => {
                const positions = note.getPositions?.();
                // A drum's written key encodes its staff position. Read its instrument name aloud.
                const drums = group.note?.getClef() === 'percussion'
                  ? note.notation?.filter(mark => mark.kind === 'unpitched').map(mark => mark.label) : undefined;
                const heads = drums?.length ? drums : positions?.map(p => 'string ' + p.str + ' fret ' + p.fret);
                const pitch = note.isRest() ? 'rest' : (heads ?? note.getKeys()).join(', ');
                return pitch + ' (' + note.getDuration() + ')';
              }).join('. '));
            return 'Stave ' + (i + 1) + ', meter ' + group.meter + '. ' + lines.join('. ');
          }).join('. ');
          next.setAttribute('role', 'img');
          next.setAttribute('aria-label', summary);
          next.textContent = summary;
        }
      }
      this.surface?.remove();
      this.surface = next;
      const warnings = this.flow ? this.current.layouts.flatMap(layout => layout.diagnostics) : [];
      this.diagnostic = warnings[0]?.range;
      this.editor_error?.text(warnings.map(d => {
        const where = d.range ? ' (line ' + d.range.line + ', column ' + d.range.column + ')' : '';
        return (d.code === 'RowOverflow' ? 'Bar ' + d.measures.join(', ') + ' exceeds this width' : d.code) + where;
      }).join('\n'));
      host.dispatchEvent(new Event('vextab-render'));
    } catch (error) {
      next.remove();
      this.reportError(error);
    }
    return this;
  }

  /** Reset the construction state before parsing each editor revision. */
  private parseInternal(): this {
    try {
      if (this.flow) {
        this.candidate = undefined;
        this.document = this.grammar2 ? parseScore(this.code) : undefined;
        this.candidate = this.document ? projectScoreV2(this.document, selectedPart(this.document, { partId: this.partId, partIndex: this.partIndex })) : parseScore(this.code, { language: 1 });
      } else {
        this.artist.reset();
        this.parser.parse(this.code);
      }
    } catch (error) {
      this.reportError(error);
    }
    return this;
  }

  /**
   * Public wrapper around parseInternal() with benchmark timing.
   */
  parse(): this {
    // Benchmark parse to keep logs comparable with legacy builds.
    Vex.BM('Parse time: ', () => { this.parseInternal(); });
    return this;
  }

  /**
   * Public wrapper around drawInternal() with benchmark timing.
   */
  draw(): this {
    // Benchmark draw to keep logs comparable with legacy builds.
    Vex.BM('Draw time: ', () => { this.drawInternal(); });
    return this;
  }
}

export default Div;
export { Div, Vex, Artist, VexTab, Player };
