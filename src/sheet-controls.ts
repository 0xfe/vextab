// Keep sheet-mounted controls inside the portion of the score visible to the reader.

/** Only intersect axes an ancestor actually clips. Its client area excludes borders and scrollbars. */
function clippingParents(sheet: HTMLElement) {
  const parents: { element: HTMLElement; x: boolean; y: boolean }[] = [];
  for (let element = sheet.parentElement; element && element !== document.documentElement; element = element.parentElement) {
    const style = getComputedStyle(element);
    const x = style.overflowX !== 'visible', y = style.overflowY !== 'visible';
    if (x || y) parents.push({ element, x, y });
  }
  return parents;
}

/** Compute the visible edges in viewport pixels, then convert to local overlay coordinates.
 * Reading both rectangles handles scaled SVGs, high-DPI canvases and zoomed parents. */
export function followVisibleSheet(sheet: HTMLElement, surface: Element, overlay: HTMLElement, controls: HTMLElement, inset: number) {
  const parents = clippingParents(sheet);
  const viewport = window.visualViewport;
  let frame = 0;
  function place() {
    frame = 0;
    const rect = surface.getBoundingClientRect(), origin = overlay.getBoundingClientRect();
    if (!origin.width || !origin.height) return;
    const sx = overlay.offsetWidth / origin.width, sy = overlay.offsetHeight / origin.height;
    const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0;
    let left = Math.max(rect.left, vx), top = Math.max(rect.top, vy);
    let right = Math.min(rect.right, vx + (viewport?.width ?? document.documentElement.clientWidth));
    let bottom = Math.min(rect.bottom, vy + (viewport?.height ?? document.documentElement.clientHeight));
    for (const { element, x, y } of parents) {
      const box = element.getBoundingClientRect();
      const scaleX = box.width / (element.offsetWidth || 1), scaleY = box.height / (element.offsetHeight || 1);
      const startX = box.left + element.clientLeft * scaleX, startY = box.top + element.clientTop * scaleY;
      if (x) { left = Math.max(left, startX); right = Math.min(right, startX + element.clientWidth * scaleX); }
      if (y) { top = Math.max(top, startY); bottom = Math.min(bottom, startY + element.clientHeight * scaleY); }
    }
    // Leave off-screen controls in normal tab order. Focus can scroll their sheet back into view.
    if (right <= left || bottom <= top) {
      controls.style.inset = '0';
      return;
    }
    // A large requested margin yields to the two 32px buttons on a small visible slice.
    const padX = Math.min(inset, Math.max(0, ((right - left) * sx - 70) / 2));
    const padY = Math.min(inset, Math.max(0, ((bottom - top) * sy - 32) / 2));
    controls.style.padding = padY + 'px ' + padX + 'px';
    controls.style.setProperty('--control-y-inset', padY + 'px');
    controls.style.inset = [
      (top - origin.top) * sy, (origin.right - right) * sx,
      (origin.bottom - bottom) * sy, (left - origin.left) * sx,
    ].map(n => n + 'px').join(' ');
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(place); }
  // Keep scroll work proportional to visible sheets, including on long tutorial pages.
  let events: AbortController;
  const observe = new IntersectionObserver(entries => {
    if (entries[entries.length - 1].isIntersecting) {
      if (!events) {
        events = new AbortController();
        const options = { signal: events.signal, passive: true };
        document.addEventListener('scroll', schedule, { ...options, capture: true });
        window.addEventListener('resize', schedule, options);
        viewport?.addEventListener('scroll', schedule, options);
        viewport?.addEventListener('resize', schedule, options);
      }
      schedule();
    } else {
      events?.abort();
      events = undefined;
      controls.style.inset = '0';
    }
  });
  const sizes = new ResizeObserver(schedule);
  for (const target of [sheet, ...parents.map(p => p.element)]) sizes.observe(target);
  observe.observe(surface);
  place();
  return () => {
    events?.abort();
    observe.disconnect();
    sizes.disconnect();
    cancelAnimationFrame(frame);
  };
}
