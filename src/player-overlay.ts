// Keyboard controls and a transparent cursor for SVG and Canvas playback.

/** Mount a score cursor and keyboard controls, optionally in a host-provided toolbar. */
export class PlayerOverlay {
  private readonly root = document.createElement('div');
  surface?: SVGElement;
  private readonly status = document.createElement('span');
  private readonly controls: HTMLElement;
  private toggle?: HTMLButtonElement;
  private marker?: SVGCircleElement;

  constructor(score: HTMLCanvasElement | SVGSVGElement | undefined, className: string, showControls: boolean,
    play: () => void, stop: () => void, toolbar?: HTMLElement) {
    this.controls = toolbar ? document.createElement('span') : this.root;
    this.root.className = `vextab-transport ${className}`;
    this.status.setAttribute('role', 'status');
    if (toolbar) {
      this.controls.className = 'vextab-playback-controls';
      toolbar.append(this.controls);
      if (showControls) this.addToggle(play, stop);
    } else if (showControls) {
      this.addButton('Stop', stop);
      this.addButton('Play', play);
    }
    this.controls.append(this.status);
    if (score instanceof SVGSVGElement) this.surface = score;
    if (score && (!toolbar || score instanceof HTMLCanvasElement)) this.placeOverlay(score);
  }

  /** Keep a single focusable button available while loading and playing. */
  private addToggle(play: () => void, stop: () => void): void {
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.onclick = () => this.toggle.classList.contains('vextab-stop') ? stop() : play();
    this.controls.append(this.toggle);
    this.setButton(false);
  }

  /** Align controls and an independent SVG ink layer to a Canvas backing store. */
  private placeOverlay(score: HTMLCanvasElement | SVGSVGElement): void {
    const bounds = score.getBoundingClientRect();
    score.after(this.root);
    // Compare the score with the overlay's own origin in the same containing block.
    this.root.style.left = this.root.style.top = '0px';
    const origin = this.root.getBoundingClientRect();
    this.root.style.left = `${bounds.left - origin.left}px`;
    this.root.style.top = `${bounds.top - origin.top}px`;
    this.root.style.width = `${bounds.width}px`;
    this.root.style.height = `${bounds.height}px`;
    if (score instanceof HTMLCanvasElement) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${score.width} ${score.height}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('vextab-canvas-ink');
      this.surface = document.createElementNS(svg.namespaceURI, 'g') as SVGGElement;
      this.surface.setAttribute('transform', score.getContext('2d').getTransform().toString());
      svg.append(this.surface);
      this.root.prepend(svg);
    }
  }

  /** Use ordinary buttons for pointer, keyboard, and assistive-technology activation. */
  private addButton(label: 'Play' | 'Stop', action: () => void): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vextab-${label.toLowerCase()}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.onclick = action;
    this.root.append(button);
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
    this.toggle.textContent = playing ? 'Stop' : 'Play';
    this.toggle.setAttribute('aria-label', this.toggle.textContent);
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
    this.marker?.remove();
    this.controls.remove();
    if (this.controls !== this.root) this.root.remove();
  }
}
