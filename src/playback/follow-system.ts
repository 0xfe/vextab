// Keep the active system in view on the playback clock, including inside scrolling embeds.

/** Find the containers that can move the score, innermost first. The page is the last scrollport. */
function scrollports(bar: SVGLineElement) {
  const ports: { element: HTMLElement; x: boolean; y: boolean }[] = [];
  for (let parent = bar.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.scrollingElement) break;
    if (!(parent instanceof HTMLElement)) continue;
    const style = getComputedStyle(parent);
    const x = /^(auto|scroll|overlay)$/.test(style.overflowX), y = /^(auto|scroll|overlay)$/.test(style.overflowY);
    if (x || y) ports.push({ element: parent, x, y });
  }
  ports.push({ element: document.scrollingElement as HTMLElement, x: true, y: true });
  return ports;
}

/** Move only as far as necessary. Align the start of a system too tall to fit. */
function nearest(start: number, end: number, near: number, far: number) {
  if (end - start >= far - near || start < near) return start - near;
  return Math.max(0, end - far);
}

/** Scroll in small frame-rate-independent steps. Stopping playback or disabling Follow stops all motion. */
export class SystemFollower {
  private ports: ReturnType<typeof scrollports> = [];
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private lastFrame = 0;
  private nextCheck = 0;

  update(bar: SVGLineElement, newSystem: boolean) {
    const now = performance.now();
    if (!newSystem && now < this.nextCheck) return;
    if (newSystem || !this.ports.length) this.ports = scrollports(bar);
    const dt = Math.min(40, this.lastFrame ? now - this.lastFrame : 16);
    const fraction = this.reducedMotion.matches ? 1 : 1 - Math.exp(-dt / 65);
    this.lastFrame = now;
    const bounds = bar.getBoundingClientRect();
    let { left, right, top, bottom } = bounds;
    let moving = false;
    for (const { element, x, y } of this.ports) {
      const page = element === document.scrollingElement;
      const box = page ? undefined : element.getBoundingClientRect();
      const sx = box ? box.width / (element.offsetWidth || 1) : 1;
      const sy = box ? box.height / (element.offsetHeight || 1) : 1;
      if (!sx || !sy) continue;
      const view = window.visualViewport;
      const vx = box ? box.left + element.clientLeft * sx : view?.offsetLeft ?? 0;
      const vy = box ? box.top + element.clientTop * sy : view?.offsetTop ?? 0;
      const width = page ? view?.width ?? element.clientWidth : element.clientWidth * sx;
      const height = page ? view?.height ?? element.clientHeight : element.clientHeight * sy;
      const dx = x ? nearest(left, right, vx + 12, vx + width - 12) / sx : 0;
      // Leave room for the floating controls and a little space around the outside staff lines.
      const pad = Math.min(68, height * .12);
      const dy = y ? nearest(top, bottom, vy + pad, vy + height - pad) / sy : 0;
      const goalX = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + dx));
      const goalY = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, element.scrollTop + dy));
      const mx = goalX - element.scrollLeft, my = goalY - element.scrollTop;
      if (Math.abs(mx) >= 1 || Math.abs(my) >= 1) {
        moving = true;
        const step = (delta: number) => Math.sign(delta) * Math.min(Math.abs(delta), Math.max(1, Math.abs(delta) * fraction));
        element.scrollBy({ left: step(mx), top: step(my), behavior: 'instant' });
      }
      // The outer port need only account for the displacement the inner one cannot supply.
      left -= mx * sx; right -= mx * sx;
      top -= my * sy; bottom -= my * sy;
    }
    // Recheck manual scrolling and viewport changes even during a sustained note.
    this.nextCheck = moving ? now : now + 120;
  }
}
