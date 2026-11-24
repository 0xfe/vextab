// Loaded only for print and export. These outlines match the faces bundled in VexFlow.
import { parse } from 'opentype.js';
import type { SVGFont } from 'vexflow';
import bravura from '@vexflow-fonts/bravura/bravura.otf';
import academico from '@vexflow-fonts/academico/academico.otf';
import bold from '@vexflow-fonts/academico/academico-bold.otf';

const regular = parse(academico.buffer);
// Academico ships regular and bold. Browsers synthesize an oblique for italic score directions.
const obliqueSlope = Math.tan(14 * Math.PI / 180);
const italic: SVGFont['font'] = {
  charToGlyphIndex: character => regular.charToGlyphIndex(character),
  getAdvanceWidth: (text, size) => regular.getAdvanceWidth(text, size),
  getPath(text, x, baseline, size) {
    const path = regular.getPath(text, x, baseline, size);
    // Shear each outline about its baseline, including the control points of quadratic and cubic curves.
    for (const command of path.commands) {
      if ('x' in command) command.x += (baseline - command.y) * obliqueSlope;
      if ('x1' in command) command.x1 += (baseline - command.y1) * obliqueSlope;
      if ('x2' in command) command.x2 += (baseline - command.y2) * obliqueSlope;
    }
    return path;
  },
};

export const faces: SVGFont[] = [
  { family: 'Bravura', font: parse(bravura.buffer) },
  { family: 'Academico', font: regular },
  { family: 'Academico', style: 'italic', font: italic },
  { family: 'Academico', weight: 'bold', font: parse(bold.buffer) },
];
