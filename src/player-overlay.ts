// Mount the transport on the sheet and keep playback ink aligned with SVG or Canvas.

/** Namespace for the Canvas cursor layer and SVG position markers. */
const svgNamespace = 'http://www.w3.org/2000/svg';

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
  private revealTimer?: number;
  private toggle?: HTMLButtonElement;
  private marker?: SVGCircleElement;
  private metronome?: HTMLButtonElement;
  private readout?: HTMLElement;
  private decrease?: HTMLButtonElement;
  private tempo: number;

  constructor(score: HTMLCanvasElement | SVGSVGElement | undefined, className: string, showControls: boolean,
    play: () => void, stop: () => void, tempo: number, changeTempo: (bpm: number) => void, toolbar?: HTMLElement) {
    this.root.className = `vextab-transport ${className}`;
    this.controls = document.createElement(toolbar ? 'span' : 'div');
    this.controls.className = toolbar ? 'vextab-playback-controls' : 'vextab-sheet-controls';
    this.status.setAttribute('role', 'status');
    if (showControls) {
      this.toggle = button('Play', 'vextab-play', () => this.toggle.classList.contains('vextab-stop') ? stop() : play());
      this.controls.append(this.toggle);
      this.setButton(false);
      if (!toolbar) this.addTempo(changeTempo);
    }
    this.setTempo(tempo);
    this.controls.append(this.status);
    (toolbar ?? this.root).append(showControls || toolbar ? this.controls : this.status);
    if (score instanceof SVGSVGElement) this.surface = score;
    if (score && (!toolbar || score instanceof HTMLCanvasElement)) this.mountSheet(score);
  }

  /** The wrapper follows the engraved surface through layout, zoom and responsive resizing. */
  private mountSheet(score: HTMLCanvasElement | SVGSVGElement): void {
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
    // Let touch users reveal the controls by tapping the sheet after they fade.
    sheet.addEventListener('pointerdown', () => this.reveal(), { signal: this.listeners.signal });
    this.controls.addEventListener('click', event => event.stopPropagation());
    this.reveal();
  }

  /** Keep the initial and touch previews visible for three seconds. Hover and focus use CSS. */
  private reveal(): void {
    this.controls.setAttribute('data-visible', '');
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => this.controls.removeAttribute('data-visible'), 3000);
  }

  /** Open the tempo stepper on hover or activation and keep it open as focus moves inside. */
  private addTempo(change: (bpm: number) => void): void {
    const group = document.createElement('div');
    group.className = 'vextab-tempo';
    const panel = document.createElement('div');
    panel.className = 'vextab-tempo-stepper';
    // Listen outside the sheet only while the stepper is open.
    const dismissOutside = (event: PointerEvent) => {
      if (!group.contains(event.target as Node)) expand(false);
    };
    const expand = (open: boolean) => {
      if (open) document.addEventListener('pointerdown', dismissOutside, { signal: this.listeners.signal });
      else document.removeEventListener('pointerdown', dismissOutside);
      panel.hidden = !open;
      this.metronome.setAttribute('aria-expanded', String(open));
    };
    this.metronome = button('Adjust tempo', 'vextab-metronome', () => expand(!!panel.hidden));
    this.decrease = button('Decrease tempo', 'vextab-step', () => change(Math.max(1, this.tempo - 5)));
    this.decrease.textContent = '−';
    const increase = button('Increase tempo', 'vextab-step', () => change(this.tempo + 5));
    increase.textContent = '+';
    this.readout = document.createElement('span');
    this.readout.className = 'vextab-bpm';
    this.readout.setAttribute('aria-live', 'polite');
    panel.append(this.decrease, this.readout, increase);
    group.append(this.metronome, panel);
    this.controls.append(group);
    expand(false);

    group.onpointerenter = event => { if (event.pointerType === 'mouse') expand(true); };
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
    this.listeners.abort();
    window.clearTimeout(this.revealTimer);
    this.marker?.remove();
    this.controls.remove();
    this.root.remove();
    // Restore the original score node, including any listeners owned by its renderer.
    if (this.sheet) this.sheet.replaceWith(...this.sheet.childNodes);
  }
}
