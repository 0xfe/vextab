// Native controls and a transparent Canvas cursor for the optional MIDI player.

/** Stack interactive controls and a cursor above the host's fixed-layout Canvas score. */
export class PlayerOverlay {
  private readonly root = document.createElement('div');
  private readonly cursor = document.createElement('canvas');
  private readonly status = document.createElement('span');
  private readonly context: CanvasRenderingContext2D;

  /** Copy the score's dimensions and transform, including its device-pixel ratio. */
  constructor(score: HTMLCanvasElement, className: string, showControls: boolean, play: () => void, stop: () => void) {
    this.root.className = `vextab-transport ${className}`;
    this.root.style.left = `${score.offsetLeft}px`;
    this.root.style.top = `${score.offsetTop}px`;
    this.root.style.width = score.style.width || `${score.width}px`;
    this.root.style.height = score.style.height || `${score.height}px`;

    this.cursor.width = score.width;
    this.cursor.height = score.height;
    this.cursor.setAttribute('aria-hidden', 'true');
    this.context = this.cursor.getContext('2d');
    this.context.setTransform(score.getContext('2d').getTransform());
    this.root.append(this.cursor);
    if (showControls) {
      this.addButton('Stop', stop);
      this.addButton('Play', play);
    }
    this.status.setAttribute('role', 'status');
    this.root.append(this.status);
    score.after(this.root);
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
  setLoading(loading: boolean): void {
    this.status.textContent = loading ? 'Loading instruments...' : '';
  }

  /** Show the active transport state and clear the marker on stop. */
  setPlaying(playing: boolean): void {
    this.root.toggleAttribute('data-playing', playing);
    if (!playing) this.clearCursor();
  }

  /** Paint the marker at the current note's coordinates in the score. */
  moveCursor(x: number, y: number): void {
    this.clearCursor();
    this.context.fillStyle = 'rgba(51, 102, 153, 0.2)';
    this.context.fillRect(x - 6.5, y - 42.5, 13, 85);
  }

  /** Clear all backing pixels regardless of the score's current zoom. */
  private clearCursor(): void {
    this.context.save();
    this.context.resetTransform();
    this.context.clearRect(0, 0, this.cursor.width, this.cursor.height);
    this.context.restore();
  }

  /** Drop the cursor, controls, and their event handlers when the score is replaced. */
  remove(): void {
    this.root.remove();
  }
}
