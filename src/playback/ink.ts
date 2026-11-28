// Draw the bar and pooled notehead glows shared by transport and written-position overlays.
import type { Point } from './geometry';

const ns = 'http://www.w3.org/2000/svg';
export const anticipation = 0.075; // Seconds from first visible colour to the attack.
let nextGradient = 0;

/** Create one SVG engraving overlay element in the correct namespace. */
export function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

/** Pulse strength in seconds, rising just before the attack and fading toward release. */
export function glowOpacity(time: number, start: number, end: number): number {
  const length = end - start;
  if (length <= 0) return 0;
  const rise = Math.min(anticipation, length / 2);
  const fade = Math.min(.14, length / 2);
  return Math.max(0, Math.min(1, (time - start + rise) / rise, (end - time) / fade));
}

/** Own the visible SVG elements for one overlay. Callers place them in screen or page coordinates. */
export class PlaybackInk {
  readonly layer = svg('g', { class: 'vextab-playback-ink', color: 'var(--vextab-playback-tint, #fff600)', 'pointer-events': 'none', 'aria-hidden': 'true' });
  readonly bar = svg('line', { stroke: '#a8a8a8', 'stroke-opacity': .55, 'stroke-width': 3.5, 'stroke-linecap': 'round' });
  private readonly gradient = 'vextab-glow-' + ++nextGradient;
  private readonly dots: { node: SVGEllipseElement; point?: Point; opacity?: number }[] = [];

  constructor() {
    const gradient = svg('radialGradient', { id: this.gradient });
    // Let the engraved ink show through the center. Peak just outside it, then feather into the paper.
    for (const [offset, opacity] of [[0, .50], [.32, .72], [.52, .60], [.76, .22], [1, 0]]) {
      gradient.append(svg('stop', { offset, 'stop-color': 'currentColor', 'stop-opacity': opacity }));
    }
    const defs = svg('defs');
    defs.append(gradient);
    this.layer.append(defs, this.bar);
  }

  /** Reuse each ellipse and leave sustained notes alone between frames. */
  drawDot(index: number, point: Point, opacity: number, group: SVGGElement) {
    let dot = this.dots[index];
    if (!dot) {
      dot = { node: svg('ellipse', { rx: 17, ry: 13, fill: 'url(#' + this.gradient + ')', stroke: 'none' }) };
      this.dots.push(dot);
    }
    if (dot.point !== point) {
      if (dot.node.parentNode !== group) group.append(dot.node);
      dot.node.setAttribute('cx', String(point.x));
      dot.node.setAttribute('cy', String(point.y));
      dot.point = point;
    }
    if (dot.opacity !== opacity) dot.node.setAttribute('opacity', String(opacity));
    dot.opacity = opacity;
  }

  /** Hide pooled ellipses that the current position no longer uses. */
  hideUnused(used: number): void {
    for (let i = used; i < this.dots.length; i++) {
      const dot = this.dots[i];
      if (dot.opacity !== 0) dot.node.setAttribute('opacity', '0');
      dot.opacity = 0;
    }
  }
}
