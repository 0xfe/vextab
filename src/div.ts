// DOM integration layer that renders VexTab inside a selected element, with optional editor UI.

/**
 * VexTab.Div renders VexTab code inside a DOM element, with optional
 * live-editing and error display support.
 */

import Vex from './vexflow';
import Artist from './artist';
import VexTab from './vextab';
import Player from './player';

import './vextab.css';

class Div {
  // Host element + renderer state.
  private sel: string;
  private code: string;
  private width: number;
  private height: number;
  private scale: number;
  private rendererBackend: string;
  private canvas: any;
  private renderer: any;
  private ctx_sel: any;
  private ctx: any;

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
  constructor(sel: string) {
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
    this.height = parseInt($(sel).attr('height'), 10) || 200;
    this.scale = parseFloat($(sel).attr('scale'), 10) || 1.0;
    this.rendererBackend = $(sel).attr('renderer') || 'svg';

    if (this.rendererBackend.toLowerCase() === 'canvas') {
      this.canvas = $('<canvas></canvas>').addClass('vex-canvas');
      $(sel).append(this.canvas);
      this.renderer = new Vex.Flow.Renderer(this.canvas[0], Vex.Flow.Renderer.Backends.CANVAS);
    } else {
      this.canvas = $('<div></div>').addClass('vex-canvas');
      $(sel).append(this.canvas);
      this.renderer = new Vex.Flow.Renderer(this.canvas[0], Vex.Flow.Renderer.Backends.SVG);
    }

    // Cache the render context and apply scale/background.
    this.ctx_sel = $(sel).find('.vex-canvas');
    this.renderer.resize(this.width, this.height);
    this.ctx = this.renderer.getContext();
    this.ctx.setBackgroundFillStyle(this.ctx_sel.css('background-color'));
    this.ctx.scale(this.scale, this.scale);

    // Editor properties.
    this.editor = $(sel).attr('editor') || '';
    this.show_errors = $(sel).attr('show-errors') || '';
    this.editor_width = parseInt($(sel).attr('editor-width'), 10) || this.width;
    this.editor_height = parseInt($(sel).attr('editor-height'), 10) || 200;

    if (this.editor === 'true') {
      // Build editor UI and debounce renders to avoid thrashing.
      this.text_area = $('<textarea></textarea>').addClass('editor')
        .val(this.code);
      this.editor_error = $('<div></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
      $(sel).append($('<p/>')).append(this.text_area);
      this.text_area.width(this.editor_width);
      this.text_area.height(this.editor_height);
      this.text_area.keyup(() => {
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
      this.editor_error = $('<div></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
    }

    // Initialize parser and renderer.
    this.artist = new Artist(10, 0, this.width, { scale: this.scale });
    this.parser = new VexTab(this.artist);

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

  /**
   * Draw if parsing succeeded; otherwise do nothing to avoid stale output.
   */
  private drawInternal(): this {
    if (!this.parser.isValid()) return this;
    return this.artist.draw(this.renderer);
  }

  /**
   * Parse the current VexTab code and surface any errors in the UI.
   * Design note: we keep errors in-band (DOM) so the editor experience is clear.
   */
  private parseInternal(): this {
    try {
      // Reset state before parsing so errors never leak a partial render.
      this.artist.reset();
      this.parser.reset();
      this.parser.parse(this.code);
      if (this.editor_error) this.editor_error.empty();
    } catch (e: any) {
      if (this.editor_error) {
        // Render parse errors into the UI for user feedback.
        this.editor_error.empty();
        this.editor_error.append(
          $('<div></div>').addClass('text').html(
            `<h3>Oops!</h3> ${e.message.replace(/(?:\r\n|\r|\n)/g, '<br>')}`,
          ),
        );
      }
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
  // eslint-disable-next-line
  console.log('Running VexTab.Div:', __VERSION, __BRANCH, __COMMITHASH);
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
