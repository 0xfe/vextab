// Mount the transport on the sheet and keep playback ink aligned with SVG or Canvas.

import type { SheetControls } from './playback/control-options.mts';
import { SystemFollower } from './playback/follow-system';
import { followVisibleSheet } from './sheet-controls';

/** Namespace for the Canvas cursor layer and SVG position markers. */
const svgNamespace = 'http://www.w3.org/2000/svg';
const idleDelay = 3000;

/** Native buttons support touch, keyboard and assistive technology without a custom input model. */
function button(label: string, className: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.setAttribute('aria-label', label);
  element.title = label;
  element.onclick = action;
  return element;
}

/** Own one score's controls, cursor and event listeners for the lifetime of this render. */
export class PlayerOverlay {
  private readonly root = document.createElement('div');
  surface?: SVGElement;
  private readonly status = document.createElement('span');
  private readonly controls: HTMLElement;
  private readonly listeners = new AbortController();
  private sheet?: HTMLElement;
  private untrack?: () => void;
  private revealTimer?: number;
  private hideAt = 0;
  private dismissHoverTempo?: () => void;
  private toggle?: HTMLButtonElement;
  private marker?: SVGCircleElement;
  private metronome?: HTMLButtonElement;
  private scrollButton?: HTMLButtonElement;
  private follower?: SystemFollower;
  private readout?: HTMLElement;
  private decrease?: HTMLButtonElement;
  private tempo: number;

  constructor(score: HTMLCanvasElement | SVGSVGElement | undefined, className: string, showControls: boolean,
    play: () => void, stop: () => void, tempo: number, changeTempo: (bpm: number) => void, settings: Required<SheetControls>, toolbar?: HTMLElement) {
    this.root.className = `vextab-transport ${className}`;
    this.controls = document.createElement(toolbar ? 'span' : 'div');
    this.controls.className = toolbar ? 'vextab-playback-controls' : 'vextab-sheet-controls';
    this.status.setAttribute('role', 'status');
    if (showControls) {
      this.toggle = button('Play', 'vextab-play', () => this.toggle.classList.contains('vextab-stop') ? stop() : play());
      this.setButton(false);
      if (toolbar) this.controls.append(this.toggle);
      else {
        const panel = document.createElement('div');
        panel.className = 'vextab-control-panel';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Playback');
        this.scrollButton = button('Auto-scroll', 'vextab-auto-scroll', () => this.setFollowing(!this.follower));
        this.setFollowing(settings.size !== 'mini');
        panel.append(this.toggle, this.addTempo(changeTempo), this.scrollButton);
        this.controls.append(panel);
        this.controls.dataset.position = settings.position;
        this.controls.dataset.visibility = settings.visibility;
        this.controls.style.setProperty('--control-inset', settings.inset + 'px');
      }
    }
    this.setTempo(tempo);
    this.controls.append(this.status);
    (toolbar ?? this.root).append(showControls || toolbar ? this.controls : this.status);
    if (score instanceof SVGSVGElement) this.surface = score;
    if (score && (!toolbar || score instanceof HTMLCanvasElement)) this.mountSheet(score, showControls && !toolbar, settings);
  }

  /** Follow only while the large panel is available, preserving the reader's position when switched off. */
  private setFollowing(enabled: boolean): void {
    this.follower = enabled ? new SystemFollower() : undefined;
    this.scrollButton.setAttribute('aria-pressed', String(enabled));
  }

  /** Use the primary playhead, which already spans the active stave or whole system. */
  followSystem(bar: SVGLineElement, newSystem: boolean): void {
    if (this.controls.dataset.size === 'large') this.follower?.update(bar, newSystem);
  }

  /** The wrapper follows the engraved surface through layout, zoom and responsive resizing. */
  private mountSheet(score: HTMLCanvasElement | SVGSVGElement, sheetControls: boolean, settings: Required<SheetControls>): void {
    const sheet = this.sheet = document.createElement('div');
    sheet.className = 'vextab-sheet';
    score.before(sheet);
    sheet.append(score, this.root);
    if (score instanceof HTMLCanvasElement) {
      const svg = document.createElementNS(svgNamespace, 'svg');
      svg.setAttribute('viewBox', `0 0 ${score.width} ${score.height}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('vextab-canvas-ink');
      this.surface = document.createElementNS(svgNamespace, 'g');
      this.surface.setAttribute('transform', score.getContext('2d').getTransform().toString());
      svg.append(this.surface);
      this.root.prepend(svg);
    }
    if (!sheetControls) return;
    this.controls.addEventListener('click', event => event.stopPropagation(), { signal: this.listeners.signal });
    if (this.controls.dataset.visibility === 'hover') {
      const reveal = () => this.reveal();
      reveal();
      for (const event of ['pointerenter', 'pointermove', 'pointerdown']) {
        sheet.addEventListener(event, reveal, { passive: true, signal: this.listeners.signal });
      }
    }
    this.untrack = followVisibleSheet(sheet, score, this.root, this.controls, settings);
  }

  /** Movement extends the deadline. Use a single timer even for a high-frequency mouse. */
  private reveal(): void {
    this.hideAt = performance.now() + idleDelay;
    if (this.revealTimer !== undefined) return;
    this.controls.setAttribute('data-visible', '');
    const hideWhenIdle = () => {
      const remaining = this.hideAt - performance.now();
      if (remaining > 0) {
        this.revealTimer = window.setTimeout(hideWhenIdle, remaining);
        return;
      }
      this.revealTimer = undefined;
      this.dismissHoverTempo?.();
      this.controls.removeAttribute('data-visible');
    };
    this.revealTimer = window.setTimeout(hideWhenIdle, idleDelay);
  }

  /** Open the tempo stepper on hover or activation and keep it open as focus moves inside. */
  private addTempo(change: (bpm: number) => void): HTMLElement {
    const group = document.createElement('div');
    group.className = 'vextab-tempo';
    const panel = document.createElement('div');
    panel.className = 'vextab-tempo-stepper';
    // Listen outside the sheet only while the stepper is open.
    const dismissOutside = (event: PointerEvent) => {
      if (!group.contains(event.target as Node)) expand(false);
    };
    const expand = (open: boolean, fromHover = false) => {
      this.dismissHoverTempo = open && fromHover ? () => {
        if (!group.querySelector(':focus-visible')) expand(false);
      } : undefined;
      if (open) document.addEventListener('pointerdown', dismissOutside, { signal: this.listeners.signal });
      else document.removeEventListener('pointerdown', dismissOutside);
      panel.inert = !open;
      this.metronome.setAttribute('aria-expanded', String(open));
    };
    this.metronome = button('Adjust tempo', 'vextab-metronome', () => expand(panel.inert));
    this.decrease = button('Decrease tempo', 'vextab-step', () => change(Math.max(1, this.tempo - 5)));
    this.decrease.textContent = '−';
    const increase = button('Increase tempo', 'vextab-step', () => change(this.tempo + 5));
    increase.textContent = '+';
    this.readout = document.createElement('span');
    this.readout.className = 'vextab-bpm';
    this.readout.setAttribute('aria-live', 'polite');
    panel.append(this.decrease, this.readout, increase);
    group.append(this.metronome, panel);
    expand(false);

    group.onpointerenter = event => { if (event.pointerType === 'mouse' && panel.inert) expand(true, true); };
    group.onpointerleave = event => {
      if (event.pointerType === 'mouse' && !group.querySelector(':focus-visible')) expand(false);
    };
    group.addEventListener('focusout', event => { if (!group.contains(event.relatedTarget as Node)) expand(false); });
    group.onkeydown = event => {
      if (event.key === 'Escape') {
        this.metronome.focus();
        expand(false);
      }
    };
    return group;
  }

  /** Reflect source tempo and subsequent changes from either the API or the sheet. */
  setTempo(tempo: number): void {
    this.tempo = tempo;
    if (!this.readout) return;
    this.readout.textContent = tempo + ' BPM';
    this.metronome.setAttribute('aria-description', this.readout.textContent);
    this.decrease.disabled = tempo <= 1;
  }

  /** Keep the soundfont loading message available to screen readers. */
  setStatus(message: string): void {
    this.status.textContent = message;
  }

  /** Show the active transport state and clear the marker on stop. */
  setPlaying(playing: boolean): void {
    this.root.toggleAttribute('data-playing', playing);
    this.setButton(playing);
    if (!playing) { this.marker?.remove(); this.marker = undefined; }
  }

  /** Keep keyboard focus on the same button during loading, playback and cancellation. */
  private setButton(playing: boolean): void {
    if (!this.toggle) return;
    const label = playing ? 'Stop' : 'Play';
    if (this.controls.classList.contains('vextab-playback-controls')) this.toggle.textContent = label;
    this.toggle.title = label;
    this.toggle.setAttribute('aria-label', label);
    this.toggle.className = playing ? 'vextab-stop' : 'vextab-play';
  }

  /** Retain the point-marker API for hosts that supply their own position callbacks. */
  moveCursor(x: number, y: number): void {
    if (!this.surface) return;
    if (!this.marker) {
      this.marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      this.marker.setAttribute('r', '6');
      this.marker.classList.add('vextab-playback-marker');
      this.marker.setAttribute('fill', 'currentColor');
      this.marker.setAttribute('opacity', '.45');
      this.marker.setAttribute('pointer-events', 'none');
      this.surface.append(this.marker);
    }
    this.marker.setAttribute('cx', String(x));
    this.marker.setAttribute('cy', String(y));
  }

  /** Drop the cursor, controls, and their event handlers when the score is replaced. */
  remove(): void {
    this.untrack?.();
    this.listeners.abort();
    window.clearTimeout(this.revealTimer);
    this.marker?.remove();
    this.controls.remove();
    this.root.remove();
    // Restore the original score node, including any listeners owned by its renderer.
    if (this.sheet) this.sheet.replaceWith(...this.sheet.childNodes);
  }
}
