// DOM integration layer that renders VexTab inside a selected element, with optional editor UI.

/**
 * VexTab.Div renders VexTab code inside a DOM element, with optional
 * live-editing and error display support.
 */

import Vex from './vexflow';
import Artist from './artist';
import VexTab from './vextab';
import Player from './player';
import { parseScore } from './score/parse';
import { renderScore } from './score/layout';
import type { ParsedScore } from './score/model';

import './vextab.css';

class Div {
  // Host element + renderer state.
  private sel: string | HTMLElement;
  private code: string;
  private width: number;
  private scale: number;
  private rendererBackend: string;
  private flow: boolean;
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

    // Host sizing and renderer options from data attributes.
    this.width = parseInt($(sel).attr('width'), 10) || 400;
    this.scale = parseFloat($(sel).attr('scale')) || 1.0;
    this.rendererBackend = $(sel).attr('renderer') || 'svg';
    this.flow = $(sel).attr('layout') === 'flow';

    // Editor properties.
    this.editor = $(sel).attr('editor') || '';
    this.show_errors = $(sel).attr('show-errors') || '';
    this.editor_width = parseInt($(sel).attr('editor-width'), 10) || this.width;
    this.editor_height = parseInt($(sel).attr('editor-height'), 10) || 200;

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
      this.text_area.on('input', () => {
        if (this.timeoutID) window.clearTimeout(this.timeoutID);
        this.timeoutID = window.setTimeout(() => {
          if (this.code !== this.text_area.val()) {
            this.code = this.text_area.val();
            this.redraw();
          }
        }, 250);
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

    this.redraw();
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
    this.surface?.setAttribute('data-preview-stale', 'true');
    const prefix = this.surface ? 'Showing the last valid score. ' : '';
    this.editor_error?.text(prefix + error.message);
  }

  /** Only expose a flow score while its source matches the live editor, even during debounce. */
  getScore(): ParsedScore | undefined {
    if (this.current && this.current.score === this.candidate && !this.surface?.hasAttribute('data-preview-stale')
        && this.current.score.source === (this.text_area?.val() ?? this.code)) return this.current.score;
  }

  /** Rebuild flow geometry from the same parsed revision at a new width. */
  setWidth(width: number): this {
    if (!this.flow) throw new Error('setWidth requires layout="flow"');
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
    const layout = renderScore(next, score, { width: this.width });
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
        renderer.getContext().setBackgroundFillStyle($(next).css('background-color'));
        this.artist.draw(renderer);
      }
      this.surface?.remove();
      this.surface = next;
      this.editor_error?.empty();
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

(window as any).VEXTAB_SEL_V3 = 'div.vextab-auto';

/**
 * Start auto-rendering any VexTab elements found in the document.
 */
function start(sel?: string): void {
  // Emit version info for troubleshooting in the browser console.
  console.log('Running VexTab.Div:', __VERSION);
  $(sel || (window as any).VEXTAB_SEL_V3).forEach((s: any) => new Div(s));
}

$(() => { if ((window as any).VEXTAB_SEL_V3) { start(); } });

export default Div;

export {
  Div,
  Vex,
  Artist,
  VexTab,
  Player,
};
