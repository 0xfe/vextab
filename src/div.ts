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

  private editor: string;
  private show_errors: string;
  private editor_width: number;
  private editor_height: number;
  private text_area: any = null;
  private editor_error: any = null;
  private timeoutID: any = null;

  private artist: Artist;
  private parser: VexTab;

  constructor(sel: string) {
    this.sel = sel;
    if (!this.sel) {
      throw new Error(`VexTab.Div: invalid selector: ${sel}`);
    }

    // Grab code and clear tabdiv.
    this.code = $(sel).text();
    $(sel).empty();

    if ($(sel).css('position') === 'static') {
      $(sel).css('position', 'relative');
    }

    // Tabdiv properties.
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
          // Draw only if code changed.
          if (this.code !== this.text_area.val()) {
            this.code = this.text_area.val();
            this.redraw();
          }
        }, 250);
      });
    } else if (this.show_errors === 'true') {
      this.editor_error = $('<div></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
    }

    // Initialize parser.
    this.artist = new Artist(10, 0, this.width, { scale: this.scale });
    this.parser = new VexTab(this.artist);

    this.redraw();
  }

  redraw(): this {
    Vex.BM('Total render time: ', () => {
      this.parse();
      this.draw();
    });

    return this;
  }

  private drawInternal(): this {
    if (!this.parser.isValid()) return this;
    return this.artist.draw(this.renderer);
  }

  private parseInternal(): this {
    try {
      this.artist.reset();
      this.parser.reset();
      this.parser.parse(this.code);
      if (this.editor_error) this.editor_error.empty();
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

  parse(): this {
    Vex.BM('Parse time: ', () => { this.parseInternal(); });
    return this;
  }

  draw(): this {
    Vex.BM('Draw time: ', () => { this.drawInternal(); });
    return this;
  }
}

(window as any).VEXTAB_SEL_V3 = 'div.vextab-auto';

function start(sel?: string): void {
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
