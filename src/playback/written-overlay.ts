// Seek the guide's playback ink directly in written score time on SVG or Canvas.
import { wholeNotes, type ScoreLayoutMap, type ScoreLocation } from '../score/layout-map';
import type { ParsedScore } from '../score/model';
import type { Geometry, Point } from './geometry';
import { anticipation, glowOpacity, PlaybackInk, svg } from './ink';

/** A host clock supplies each position explicitly, including repeats, seeks and manual scrubbing. */
export interface PlaybackOverlay {
  /** An invalid address clears the ink. The optional tempo is in quarter notes per minute. */
  setPosition(location: ScoreLocation, tempo?: number): void;
  /** Hide the current position, for example during a count-in. */
  clear(): void;
  /** Release the layer. Subsequent calls have no effect. */
  dispose(): void;
}

/** Each written event owns its sounding head centers until the end of its duration. */
interface Pulse { start: number; end: number; heads: Point[] }

/** A voice's events are sequential, so one binary search finds a sustain even after a seek. */
function firstActive(voice: Pulse[], offset: number): number {
  let low = 0, high = voice.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (voice[mid].end <= offset) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Keep the original written measure and voice order. Repeats are the external clock's concern. */
function writtenPulses(scores: readonly ParsedScore[], geometry: Geometry): Pulse[][][] {
  const bars: Pulse[][][] = scores[0].measures.map(() => []);
  for (const score of scores) {
    for (const measure of score.measures) {
      for (const voice of measure.voices) {
        const pulses: Pulse[] = [];
        for (const event of voice.events) {
          const heads = geometry.get(event.id)?.heads;
          if (!heads?.length) continue;
          const start = wholeNotes(event.onset);
          pulses.push({ start, end: start + wholeNotes(event.duration), heads });
        }
        if (pulses.length) bars[measure.number - 1].push(pulses);
      }
    }
  }
  return bars;
}

/** Place transparent ink over the Canvas's displayed rectangle, including CSS zoom and scaling. */
function canvasLayer(canvas: HTMLCanvasElement, parent: HTMLElement) {
  const width = parseFloat(canvas.style.width), height = parseFloat(canvas.style.height);
  const paper = svg('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  paper.style.cssText = 'position:absolute;pointer-events:none;background:transparent;';
  parent.append(paper);
  let previous = '';
  return { paper, align() {
    const box = canvas.getBoundingClientRect(), container = parent.getBoundingClientRect();
    if (!container.width || !container.height) return;
    // Percentages keep the overlay in its parent's coordinates when ancestors are scaled.
    const rect = [100 * (box.left - container.left) / container.width, 100 * (box.top - container.top) / container.height,
      100 * box.width / container.width, 100 * box.height / container.height];
    const key = rect.join(',');
    if (key === previous) return;
    previous = key;
    [paper.style.left, paper.style.top, paper.style.width, paper.style.height] = rect.map(n => n + '%');
  } };
}

/** Render one position synchronously. No instrument, timer, or animation frame is needed. */
export function writtenPlaybackOverlay(container: HTMLElement, surface: SVGSVGElement | HTMLCanvasElement, map: ScoreLayoutMap,
  scores: readonly ParsedScore[], geometry: Geometry): PlaybackOverlay {
  const ink = new PlaybackInk();
  const bars = writtenPulses(scores, geometry);
  const canvas = surface instanceof HTMLCanvasElement ? canvasLayer(surface, container) : undefined;
  const paper = canvas?.paper ?? surface;
  const defaultTempo = scores[0].playback?.tempo ?? 120;
  let disposed = false;

  return {
    setPosition(location, tempo = defaultTempo) {
      if (disposed) return;
      if (!Number.isFinite(tempo) || tempo <= 0) throw new RangeError('Tempo must be positive');
      const at = map.positionAt(location);
      if (!at) { ink.layer.remove(); return; }
      canvas?.align();
      if (!ink.layer.parentNode) paper.append(ink.layer);
      ink.bar.setAttribute('transform', 'translate(' + at.x + ' 0)');
      ink.bar.setAttribute('y1', String(at.systemBounds.top));
      ink.bar.setAttribute('y2', String(at.systemBounds.bottom));

      const secondsPerWhole = 240 / tempo;
      const lookAhead = anticipation / secondsPerWhole;
      let used = 0;
      for (const voice of bars[at.measure - 1]) {
        for (let i = firstActive(voice, at.offset); i < voice.length; i++) {
          const pulse = voice[i];
          if (pulse.start > at.offset + lookAhead) break;
          const strength = glowOpacity((at.offset - pulse.start) * secondsPerWhole, 0, (pulse.end - pulse.start) * secondsPerWhole);
          if (strength > 0) for (const head of pulse.heads) ink.drawDot(used++, head, strength, ink.layer);
        }
      }
      ink.hideUnused(used);
    },
    clear() { ink.layer.remove(); },
    dispose() {
      disposed = true;
      ink.layer.remove();
      canvas?.paper.remove();
    },
  };
}
