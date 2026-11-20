// Preserve the original VexTabDiv global and markup using the current renderer.
import './auto';
import ModernDiv, { type DivOptions, Artist, Vex, VexTab } from './div';

/** Adapter for pages that use the original class, attributes, and canvas default. */
class Div extends ModernDiv {
  static SEL = '.vex-tabdiv';

  constructor(selector: string | HTMLElement, options?: DivOptions) {
    const host = $(selector);
    for (const name of ['width', 'height']) {
      const legacy = host.attr(`editor_${name}`);
      if (legacy && !host.attr(`editor-${name}`)) host.attr(`editor-${name}`, legacy);
    }
    if (!host.attr('renderer')) {
      host.attr('renderer', 'VEXTAB_USE_SVG' in window || 'Raphael' in window ? 'svg' : 'canvas');
    }
    super(selector, options);
  }

  /** Render the elements selected by older integrations on document ready. */
  static start(): void {
    $(Div.SEL).forEach((host: HTMLElement) => new Div(host));
  }
}

const Flow = Vex.Flow;
Flow.TabDiv = Div;
$(() => { if (Div.SEL) Div.start(); });

export { Artist, Div, Flow, VexTab };

export { Player, createWebAudioPlayback, createSpessaSynthPlayback } from './browser';
