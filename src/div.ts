// src/div.ts
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
  private sel: string; // CSS selector or element reference for the host container.
  private code: string; // Current VexTab source code to render.
  private width: number; // Render area width (in CSS pixels).
  private height: number; // Render area height (in CSS pixels).
  private scale: number; // Scaling factor applied to the rendering context.
  private rendererBackend: string; // Backend name: "svg" or "canvas".
  private canvas: any; // DOM node for the render surface.
  private renderer: any; // Vex.Flow.Renderer instance.
  private ctx_sel: any; // Cached selection for the render surface.
  private ctx: any; // VexFlow rendering context (SVG or Canvas).

  private editor: string; // Whether to show the live editor UI.
  private show_errors: string; // Whether to show errors without editor UI.
  private editor_width: number; // Editor width in pixels.
  private editor_height: number; // Editor height in pixels.
  private text_area: any = null; // Textarea DOM node for live editing.
  private editor_error: any = null; // Error output container for parse errors.
  private timeoutID: any = null; // Debounce timer ID for editor updates.

  private artist: Artist; // Artist instance that builds VexFlow objects.
  private parser: VexTab; // VexTab parser instance for source code.

  /**
   * Construct the Div renderer and immediately render the initial markup.
   * Design note: we read once from the DOM and then manage our own state.
   */
  constructor(sel: string) {
    this.sel = sel;
    if (!this.sel) {
      throw new Error(`VexTab.Div: invalid selector: ${sel}`);
    }

    // Grab code and clear tabdiv.
    this.code = $(sel).text(); // Initial VexTab code from the element contents.
    $(sel).empty(); // Clear the element so we can inject canvas/editor UI.

    if ($(sel).css('position') === 'static') {
      $(sel).css('position', 'relative');
    }

    // Tabdiv properties.
    this.width = parseInt($(sel).attr('width'), 10) || 400; // Target width.
    this.height = parseInt($(sel).attr('height'), 10) || 200; // Target height.
    this.scale = parseFloat($(sel).attr('scale'), 10) || 1.0; // Render scale.
    this.rendererBackend = $(sel).attr('renderer') || 'svg'; // Backend choice.

    if (this.rendererBackend.toLowerCase() === 'canvas') {
      this.canvas = $('<canvas></canvas>').addClass('vex-canvas'); // Canvas surface.
      $(sel).append(this.canvas); // Attach render surface to DOM.
      this.renderer = new Vex.Flow.Renderer(this.canvas[0], Vex.Flow.Renderer.Backends.CANVAS); // Canvas backend.
    } else {
      this.canvas = $('<div></div>').addClass('vex-canvas'); // SVG surface.
      $(sel).append(this.canvas); // Attach render surface to DOM.
      this.renderer = new Vex.Flow.Renderer(this.canvas[0], Vex.Flow.Renderer.Backends.SVG); // SVG backend.
    }

    this.ctx_sel = $(sel).find('.vex-canvas'); // Cached canvas selection.
    this.renderer.resize(this.width, this.height); // Set render surface size.
    this.ctx = this.renderer.getContext(); // Obtain rendering context.
    this.ctx.setBackgroundFillStyle(this.ctx_sel.css('background-color')); // Match container background.
    this.ctx.scale(this.scale, this.scale); // Apply scale factor for all drawing.

    // Editor properties.
    this.editor = $(sel).attr('editor') || ''; // Editor flag.
    this.show_errors = $(sel).attr('show-errors') || ''; // Error-only flag.
    this.editor_width = parseInt($(sel).attr('editor-width'), 10) || this.width; // Editor width.
    this.editor_height = parseInt($(sel).attr('editor-height'), 10) || 200; // Editor height.

    if (this.editor === 'true') {
      this.text_area = $('<textarea></textarea>').addClass('editor')
        .val(this.code); // Textarea initialized with existing code.
      this.editor_error = $('<div></div>').addClass('editor-error'); // Error display container.
      $(sel).append($('<p/>')).append(this.editor_error);
      $(sel).append($('<p/>')).append(this.text_area);
      this.text_area.width(this.editor_width); // Editor width from attributes.
      this.text_area.height(this.editor_height); // Editor height from attributes.
      this.text_area.keyup(() => {
        if (this.timeoutID) window.clearTimeout(this.timeoutID); // Debounce previous renders.
        this.timeoutID = window.setTimeout(() => {
          // Draw only if code changed.
          if (this.code !== this.text_area.val()) {
            this.code = this.text_area.val(); // Update source with user edits.
            this.redraw(); // Re-parse and re-render.
          }
        }, 250);
      });
    } else if (this.show_errors === 'true') {
      this.editor_error = $('<div></div>').addClass('editor-error'); // Error container without editor.
      $(sel).append($('<p/>')).append(this.editor_error);
    }

    // Initialize parser.
    this.artist = new Artist(10, 0, this.width, { scale: this.scale }); // Artist builds VexFlow data.
    this.parser = new VexTab(this.artist); // Parser compiles VexTab into Artist calls.

    this.redraw();
  }

  /**
   * Parse and draw the current code in one pass for convenience.
   */
  redraw(): this {
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
      this.artist.reset(); // Clear previous rendering state.
      this.parser.reset(); // Reset parser state for a clean parse.
      this.parser.parse(this.code); // Parse the VexTab source into Artist commands.
      if (this.editor_error) this.editor_error.empty(); // Clear any prior errors.
    } catch (e: any) {
      if (this.editor_error) {
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
    Vex.BM('Parse time: ', () => { this.parseInternal(); });
    return this;
  }

  /**
   * Public wrapper around drawInternal() with benchmark timing.
   */
  draw(): this {
    Vex.BM('Draw time: ', () => { this.drawInternal(); });
    return this;
  }
}

// Default CSS selector used by legacy VexTab auto-render.
(window as any).VEXTAB_SEL_V3 = 'div.vextab-auto';

/**
 * Start auto-rendering any VexTab elements found in the document.
 */
function start(sel?: string): void {
  // eslint-disable-next-line
  console.log('Running VexTab.Div:', __VERSION, __BRANCH, __COMMITHASH);
  $(sel || (window as any).VEXTAB_SEL_V3).forEach((s: any) => new Div(s));
}

// Auto-initialize when the DOM is ready and VEXTAB_SEL_V3 is configured.
$(() => { if ((window as any).VEXTAB_SEL_V3) { start(); } });

export default Div;

export {
  Div, // DOM helper class (named export for compatibility).
  Vex, // VexFlow shim export for legacy consumers.
  Artist, // Artist renderer export.
  VexTab, // Parser/renderer API export.
  Player, // Playback overlay export.
};
