/**
 * VexFlow TabDiv
 * Copyright Mohit Muthanna 2010 <mohit@muthanna.com>
 */

import Vex from 'vexflow';
import Artist from './artist.coffee';
import VexTab from './vextab.coffee';

import './vextab.css';

class Div {
  constructor(sel) {
    this.sel = sel;
    if (!this.sel) {
      throw new Error(`VexTab.Div: invalid selector: ${sel}`);
    }

    // Grab code and clear tabdiv
    this.code = $(sel).text();
    $(sel).empty();

    if ($(sel).css('position') === 'static') {
      $(sel).css('position', 'relative');
    }

    // Get tabdiv properties
    this.width = parseInt($(sel).attr('width'), 10) || 400;
    this.height = parseInt($(sel).attr('height'), 10) || 200;
    this.scale = parseFloat($(sel).attr('scale'), 10) || 1.0;
    this.rendererBackend = $(sel).attr('renderer') || 'svg';

    // Raphael is deprecated. Use SVG if it's defined.
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

    // Grab editor properties
    this.editor = $(sel).attr('editor') || '';
    this.show_errors = $(sel).attr('show-errors') || '';
    this.editor_width = parseInt($(sel).attr('editor-width'), 10) || this.width;
    this.editor_height = parseInt($(sel).attr('editor-height'), 10) || 200;

    const that = this;
    if (this.editor === 'true') {
      this.text_area = $('<textarea></textarea>').addClass('editor')
        .val(this.code);
      this.editor_error = $('<div></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
      $(sel).append($('<p/>')).append(this.text_area);
      this.text_area.width(this.editor_width);
      this.text_area.height(this.editor_height);
      this.text_area.keyup(() => {
        if (that.timeoutID) window.clearTimeout(that.timeoutID);
        that.timeoutID = window.setTimeout(() => {
        // Draw only if code changed
          if (that.code !== that.text_area.val()) {
            that.code = that.text_area.val();
            that.redraw();
          }
        }, 250);
      });
    } if (this.show_errors === 'true') {
      this.editor_error = $('<div></div>').addClass('editor-error');
      $(sel).append($('<p/>')).append(this.editor_error);
    }

    // Initialize parser.
    this.artist = new Artist(10, 0, this.width, { scale: this.scale });
    this.parser = new VexTab(this.artist);

    this.redraw();
  }

  redraw() {
    const that = this;
    Vex.BM('Total render time: ', () => {
      that.parse(); that.draw();
    });

    return this;
  }

  drawInternal() {
    if (!this.parser.isValid()) return this;
    return this.artist.draw(this.renderer);
  }

  parseInternal() {
    try {
      this.artist.reset();
      this.parser.reset();
      this.parser.parse(this.code);
      this.editor_error.empty();
    } catch (e) {
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

  parse() {
    Vex.BM('Parse time: ', () => { this.parseInternal(); });
    return this;
  }

  draw() {
    Vex.BM('Draw time: ', () => { this.drawInternal(); });
    return this;
  }
}

window.VEXTAB_SEL_V3 = 'div.vextab-auto';

function start(sel) {
  // eslint-disable-next-line
  console.log('Running VexTab.Div:', __VERSION, __BRANCH, __COMMITHASH);
  $(sel || window.VEXTAB_SEL_V3).forEach((s) => new Div(s));
}

$(() => { if (window.VEXTAB_SEL_V3) { start(); } });

export default Div;
