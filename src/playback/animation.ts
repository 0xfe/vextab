// Animate a compact SVG layer from musical time. Snapshot engraving once and update only the moving ink.
import type { Geometry, PlaybackRow, Point } from './geometry';
import type { Performance } from './transport';

const ns = 'http://www.w3.org/2000/svg';
export const anticipation = 0.075; // Seconds from first visible colour to the attack.
let nextGradient = 0;

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

interface Pulse { time: number; end: number; heads: Point[]; row: PlaybackRow }
interface Anchor { time: number; x: number; row: PlaybackRow; slope: number; speed: number }

/** Pool the visible dots, and interpolate between the actual engraved attacks on each system. */
export class PlaybackAnimation {
  private readonly layer = svg('g', { class: 'vextab-playback-ink', 'pointer-events': 'none', 'aria-hidden': 'true' });
  private readonly bar = svg('line', { stroke: '#a8a8a8', 'stroke-opacity': .55, 'stroke-width': 3.5, 'stroke-linecap': 'round' });
  private readonly gradient = 'vextab-glow-' + ++nextGradient;
  private readonly dots: { node: SVGEllipseElement; point?: Point; opacity?: number }[] = [];
  private readonly anchors: Anchor[] = [];
  private readonly pulses: Pulse[] = [];
  private readonly active: Pulse[] = [];
  private anchor = 0;
  private pulse = 0;
  private frame = 0;
  private readonly pages = new Map<SVGSVGElement, SVGSVGElement>();
  private readonly printedRows = new Map<PlaybackRow, SVGGElement>();
  private row?: PlaybackRow;

  constructor(private surface: SVGElement | undefined, private music: Performance, geometry: Geometry,
    private follow?: (bar: SVGLineElement, newSystem: boolean) => void) {
    const gradient = svg('radialGradient', { id: this.gradient });
    // Let the engraved ink show through the center. Peak just outside it, then feather into the paper.
    for (const [offset, opacity] of [[0, .50], [.32, .72], [.52, .60], [.76, .22], [1, 0]]) {
      gradient.append(svg('stop', { offset, 'stop-color': 'currentColor', 'stop-opacity': opacity }));
    }
    const defs = svg('defs');
    defs.append(gradient);
    this.layer.append(defs, this.bar);
    for (const event of music.events) {
      const pos = geometry.get(event.source);
      if (!pos) continue;
      const { x, row, heads } = pos;
      const last = this.anchors[this.anchors.length - 1];
      // Voices on the same beat share one playhead; all their individual heads still glow.
      if (!last || Math.abs(last.time - event.time) > 0.000001) this.anchors.push({ time: event.time, x, row, slope: 0, speed: 0 });
      if (heads.length) this.pulses.push({ time: event.time, end: event.time + event.duration, heads, row });
    }
    // Harmonic-mean slopes keep velocity continuous at beats without overshooting the notes.
    this.anchors.forEach((entry, i) => {
      const next = this.anchors[i + 1];
      const width = (next?.row === entry.row ? next.x : entry.row.right) - entry.x;
      const duration = (next?.time ?? music.duration) - entry.time;
      entry.slope = duration > 0 ? width / duration : 0;
      const prior = this.anchors[i - 1];
      entry.speed = entry.slope;
      if (prior?.row === entry.row) {
        entry.speed = prior.slope * entry.slope > 0 ? 2 / (1 / prior.slope + 1 / entry.slope) : 0;
      }
    });
  }

  /** Each preview page gets a sibling overlay. Its downloadable SVG stays untouched. */
  private rowLayer(row: PlaybackRow): SVGGElement {
    const ink = row.printedMusic;
    if (!ink) {
      if (!this.layer.parentNode) this.surface?.append(this.layer);
      return this.layer;
    }
    const mounted = this.printedRows.get(row);
    if (mounted) return mounted;
    const paper = ink.ownerSVGElement;
    let overlay = this.pages.get(paper);
    if (!overlay) {
      const wrapper = document.createElement('div');
      wrapper.className = 'vextab-playback-page';
      paper.before(wrapper);
      overlay = svg('svg', { 'aria-hidden': 'true', class: 'vextab-playback-paper' });
      for (const attr of ['viewBox', 'width', 'height', 'preserveAspectRatio']) {
        if (paper.hasAttribute(attr)) overlay.setAttribute(attr, paper.getAttribute(attr));
      }
      overlay.style.cssText = 'pointer-events:none;background:transparent;border-color:transparent';
      wrapper.append(paper, overlay);
      this.pages.set(paper, overlay);
      if (!this.layer.parentNode) overlay.append(this.layer);
    }
    // Keep separate row groups so a new line can begin to glow before the bar wraps.
    const group = svg('g', { transform: [ink.parentElement, ink].map(g => g.getAttribute('transform') ?? '').join(' '),
      class: 'vextab-playback-ink', 'pointer-events': 'none' });
    overlay.append(group);
    this.printedRows.set(row, group);
    return group;
  }

  /** Move the playhead to the coordinate system of the next stave or system. */
  private moveToRow(row: PlaybackRow) {
    const group = this.rowLayer(row);
    group.prepend(this.bar);
    this.bar.setAttribute('y1', String(row.top));
    this.bar.setAttribute('y2', String(row.bottom));
    this.row = row;
  }

  /** Only the playhead and currently sounding or approaching heads change between frames. */
  start(elapsed: () => number) {
    if (!this.anchors.length) return;
    const draw = () => {
      const time = elapsed();
      while (this.anchor + 1 < this.anchors.length && this.anchors[this.anchor + 1].time <= time) this.anchor++;
      const here = this.anchors[this.anchor];
      const newSystem = here.row !== this.row;
      if (newSystem) this.moveToRow(here.row);
      this.drawBar(time, here, this.anchors[this.anchor + 1]);
      this.follow?.(this.bar, newSystem);
      this.drawHeads(time);
      this.frame = requestAnimationFrame(draw);
    };
    draw();
  }

  /** Cubic Hermite interpolation lands on each attack at its exact musical time. */
  private drawBar(time: number, here: Anchor, next?: Anchor) {
    const sameRow = next?.row === here.row;
    const distance = (sameRow ? next.x : here.row.right) - here.x;
    const span = (next?.time ?? this.music.duration) - here.time;
    const t = span > 0 ? Math.max(0, Math.min(1, (time - here.time) / span)) : 0;
    const endSpeed = sameRow ? next.speed : here.slope;
    const ease = (1 - t) * (here.speed * span - distance) + t * (distance - endSpeed * span);
    const x = here.x + t * distance + t * (1 - t) * ease;
    this.bar.setAttribute('transform', 'translate(' + x + ' 0)');
  }

  /** Compact the active set in place. Frame work scales with audible polyphony. */
  private drawHeads(time: number) {
    while (this.pulse < this.pulses.length && this.pulses[this.pulse].time <= time + anticipation) {
      this.active.push(this.pulses[this.pulse++]);
    }
    let alive = 0, used = 0;
    for (const p of this.active) {
      if (p.end <= time) continue;
      this.active[alive++] = p;
      const length = p.end - p.time;
      const rise = Math.min(anticipation, length / 2);
      const fade = Math.min(.14, length / 2);
      const opacity = Math.min(1, (time - p.time + rise) / rise, (p.end - time) / fade);
      if (opacity > 0) for (const point of p.heads) this.drawDot(used++, point, opacity, p.row);
    }
    this.active.length = alive;
    for (let i = used; i < this.dots.length; i++) {
      const dot = this.dots[i];
      if (dot.opacity !== 0) dot.node.setAttribute('opacity', '0');
      dot.opacity = 0;
    }
  }

  /** Reuse each ellipse and leave sustained notes alone between frames. */
  private drawDot(index: number, point: Point, opacity: number, row: PlaybackRow) {
    let dot = this.dots[index];
    if (!dot) {
      dot = { node: svg('ellipse', { rx: 17, ry: 13, fill: 'url(#' + this.gradient + ')', stroke: 'none' }) };
      this.dots.push(dot);
    }
    if (dot.point !== point) {
      const group = this.rowLayer(row);
      if (dot.node.parentNode !== group) group.append(dot.node);
      dot.node.setAttribute('cx', String(point.x));
      dot.node.setAttribute('cy', String(point.y));
      dot.point = point;
    }
    if (dot.opacity !== opacity) dot.node.setAttribute('opacity', String(opacity));
    dot.opacity = opacity;
  }

  /** Stop schedules no further frames and restores the untouched printed page. */
  stop() {
    cancelAnimationFrame(this.frame);
    this.layer.remove();
    for (const [paper, overlay] of this.pages) overlay.parentElement?.replaceWith(paper);
  }
}
