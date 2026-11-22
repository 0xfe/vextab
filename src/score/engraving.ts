// Select bundled engraving faces for a single synchronous VexFlow rendering pass.
import { VexFlow } from 'vexflow';
import type { ScoreLayout } from './grammar2/model';

/** Default face for VexTab's fixed-layout renderer. */
export const scoreFont = 'Academico';

/** Supplemental markings use the same first-choice families as native VexFlow elements. */
export const scoreTextFont = () => VexFlow.getTextFonts()[0];
export const scoreMusicFont = () => VexFlow.getFonts()[0];

/** Petaluma Script ships with one weight. Use its drawn strokes when emphasizing headings. */
export const headingWeight = () => scoreTextFont() === 'Petaluma Script' ? 'normal' : 'bold';

/** VexFlow stores its font stacks globally. Restore the host's complete stacks after each draw. */
export function withScoreFonts<T>(font: ScoreLayout['font'], draw: () => T): T {
  if (!font) return draw();
  const music = VexFlow.getFonts(), text = VexFlow.getTextFonts();
  try {
    if (font === 'Petaluma') VexFlow.setFonts('Petaluma', 'Petaluma Script');
    else VexFlow.setFonts('Bravura', scoreFont);
    return draw();
  } finally {
    VexFlow.setFonts(...music);
    VexFlow.setTextFonts(...text);
  }
}
