// Measure painted SVG text in its local score coordinates for browser engraving checks.

/** Use the element's actual face and baseline so the bounds also work inside printed systems. */
export function textInk(text: SVGTextElement) {
  const style = getComputedStyle(text), context = document.createElement('canvas').getContext('2d');
  context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
  const m = context.measureText(text.textContent), x = Number(text.getAttribute('x')), y = Number(text.getAttribute('y'));
  return { left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight,
    top: y - m.actualBoundingBoxAscent, bottom: y + m.actualBoundingBoxDescent };
}
