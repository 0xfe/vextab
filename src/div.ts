// DOM integration layer that renders VexTab inside a selected element, with optional editor UI.

/**
 * VexTab.Div renders VexTab code inside a DOM element, with optional
 * live-editing and error display support.
 */

import Vex from './vexflow';
import Artist from './artist';
import VexTab from './vextab';
import Player from './player';
import type { SourceRange } from './score/source';
import type { ScoreReadingEvent } from 'vexflow';
import { parseScore } from './score/parse';
import { renderScore, type Part } from './score/layout';
import type { ParsedScore } from './score/model';

// Webpack embeds the stylesheet here. Consumers of the declarations need no CSS loader.
declare const require: (asset: './vextab.css') => void;
require('./vextab.css');

/** Prefer standard data attributes, including the original editor dimension spellings. */
function embedAttribute(host: HTMLElement, name: string, legacyName?: string): string | null {
  return host.getAttribute(`data-${name}`)
    || (legacyName ? host.getAttribute(`data-${legacyName}`) : null)
    || host.getAttribute(name);
}

class Div {
  // Host element + renderer state.
  private sel: string | HTMLElement;
  private code: string;
  private width: number;
  private scale: number;
  private rendererBackend: string;
  private flow: boolean;
  private part: Part = 'score';
  private observer?: ResizeObserver;
  private disposed = false;
  private composing = false;
  private diagnostic?: SourceRange;
  private candidate?: ParsedScore;
  private current?: { score: ParsedScore; layout: ReturnType<typeof renderScore> };
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
  private parser: VexTab;

  /**
   * Construct the Div renderer and immediately render the initial markup.
   * Design note: we read once from the DOM and then manage our own state.
   */
  constructor(sel: string | HTMLElement) {
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
    const width = embedAttribute(host, 'width');
    this.width = parseInt(width, 10) || 400;
    this.scale = parseFloat(embedAttribute(host, 'scale')) || 1.0;
    this.rendererBackend = embedAttribute(host, 'renderer') || 'svg';
    this.flow = embedAttribute(host, 'layout') === 'flow';
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
      this.parser = new VexTab(this.artist);
    }

    const autoWidth = this.flow && (width === null || width === 'auto');
    if (autoWidth && host.clientWidth > 20) this.width = host.clientWidth;
    this.redraw();
    // Embedded music fonts can finish after the first synchronous draw.
    if (document.fonts.status === 'loading') {
      void document.fonts.ready.then(() => { if (!this.disposed) this.draw(); });
    }
    if (autoWidth) {
      this.observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        if (width > 20 && width !== this.width) {
          this.width = width;
          this.draw();
        }
      });
      this.observer.observe(host);
    }
  }

  /** Stop observing an embed when a host removes it or replaces the editor. */
  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    window.clearTimeout(this.timeoutID);
    this.text_area?.off('.vextab');
  }

  /** Wait for a complete IME composition before parsing the edited source. */
  private scheduleEdit(): void {
    window.clearTimeout(this.timeoutID);
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
    return this.getScore() ? this.current.layout.navigation.events : [];
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
    this.diagnostic = (error as Error & { range?: SourceRange }).range;
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
    this.width = width;
    return this.draw();
  }

  /** Accept either a musical ID or a projection ID from the current layout. */
  selectSource(id: string, revision: ParsedScore): boolean {
    const score = this.getScore();
    const range = score && score === revision && this.current.layout.rangeFor(id, score.source);
    if (!range || !this.text_area) return false;
    const editor = this.text_area[0] as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(range.start, range.end);
    return true;
  }

  /** Convert pointer coordinates through the SVG transform, including CSS scaling. */
  private drawFlow(next: HTMLElement): void {
    if (this.rendererBackend.toLowerCase() !== 'svg' || this.scale !== 1) {
      throw new Error('Flow layout requires SVG at scale 1. Use width to reflow.');
    }
    const score = this.candidate;
    const layout = renderScore(next, score, { width: this.width, part: this.part });
    if (this.text_area) next.addEventListener('click', event => {
      const svg = next.querySelector('svg');
      const transform = svg.getScreenCTM();
      if (!transform) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      const hit = layout.hitTest(point.x, point.y);
      if (hit) this.selectSource(hit.id, score);
    });
    this.current = { score, layout };
  }

  /** Commit a new surface only after engraving succeeds, including Canvas pixels. */
  private drawInternal(): this {
    if (this.flow ? !this.candidate : !this.parser.isValid()) return this;
    const canvas = this.rendererBackend.toLowerCase() === 'canvas';
    const next = document.createElement(canvas ? 'canvas' : 'div');
    next.className = 'vex-canvas';
    const host = $(this.sel)[0] as HTMLElement;
    host.insertBefore(next, host.firstChild);
    try {
      if (this.flow) this.drawFlow(next);
      else {
        const backend = canvas ? Vex.Flow.Renderer.Backends.CANVAS : Vex.Flow.Renderer.Backends.SVG;
        const renderer = new Vex.Flow.Renderer(next, backend);
        if (!canvas) {
          // SVG clears strings by painting over them. Keep VexFlow's white default
          // when the computed paper color has alpha (rgba or modern CSS slash syntax).
          const paper = getComputedStyle(next).backgroundColor;
          if (paper && !paper.startsWith('rgba(') && !paper.includes('/')) {
            renderer.getContext().setBackgroundFillStyle(paper);
          }
        }
        this.artist.draw(renderer);
        if (canvas) {
          const summary = this.artist.staves.map((group, i) => {
            const voices = group.tab ? group.tab_voices : group.note_voices;
            const lines = voices.map((notes, v) => 'Voice ' + (v + 1) + '. ' + notes
              .filter(note => !note.shouldIgnoreTicks()).map(note => {
                const positions = note.getPositions?.();
                const pitch = note.isRest() ? 'rest' : positions?.map(p => 'string ' + p.str + ' fret ' + p.fret).join(', ')
                  ?? note.getKeys().join(', ');
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
      const warnings = this.flow ? this.current.layout.diagnostics : [];
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
        this.candidate = parseScore(this.code);
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
