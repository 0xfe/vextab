// Fit native TAB clefs to the staff for https://github.com/vexflow/vexflow/issues/373.
import { Clef, TabStave, VexFlow, type Stave } from 'vexflow';

/** Center actual glyph ink between the outside strings. Preserve the six-string engraving. */
function fit(clef: Clef, strings: number, spacing: number, lineWidth: number) {
  const center = (strings - 1) / 2;
  clef.line = center;
  clef.setYShift(0);
  clef.setText(strings <= 4 ? VexFlow.Glyphs.fourStringTabClef : VexFlow.Glyphs.sixStringTabClef);
  const ink = clef.getTextInk(0, 0);
  // Fit between the inner edges of the rules, including SVG's half-pixel stroke alignment.
  const height = Math.max(1, (strings - 1) * spacing - lineWidth);
  if (ink.h > height) clef.setFontSize(clef.fontSizeInPoints * height / ink.h);
  const fitted = clef.getTextInk(0, 0);
  clef.setYShift(-fitted.y - fitted.h / 2);
}

/** Apply after system layout installs its repeated clefs and before either drawing backend runs. */
export function fitTabClefs(stave: Stave) {
  if (!(stave instanceof TabStave) || stave.getNumLines() === 6) return;
  for (const modifier of stave.getModifiers(undefined, Clef.CATEGORY)) {
    const clef = modifier as Clef;
    if (clef.getType() === 'tab') fit(clef, stave.getNumLines(), stave.getSpacingBetweenLines(), stave.getStyle().lineWidth ?? 1);
  }
}

/** Publication owns its native staves. Its exported glyph baselines use the same line-2.5 origin. */
export function fitPrintedTabClefs(svg: SVGSVGElement, strings: number) {
  if (strings === 6) return;
  const stave = new TabStave(0, 0, 1);
  const spacing = stave.getSpacingBetweenLines();
  for (const text of svg.querySelectorAll('.vf-clef text')) {
    if (text.textContent !== VexFlow.Glyphs.sixStringTabClef) continue;
    const clef = new Clef('tab').setFontSize(text.getAttribute('font-size'));
    fit(clef, strings, spacing, stave.getStyle().lineWidth ?? 1);
    text.textContent = clef.getText();
    text.setAttribute('font-size', clef.getFontSize());
    const y = Number(text.getAttribute('y')) + (clef.line - 2.5) * spacing + clef.getYShift();
    text.setAttribute('y', String(y));
  }
}
