// Loaded only for print and export. These outlines match the faces bundled in VexFlow.
import { parse } from 'opentype.js';
import type { SVGFont } from 'vexflow';
import bravura from '@vexflow-fonts/bravura/bravura.otf';
import academico from '@vexflow-fonts/academico/academico.otf';
import bold from '@vexflow-fonts/academico/academico-bold.otf';

export const faces: SVGFont[] = [
  { family: 'Bravura', font: parse(bravura.buffer) },
  { family: 'Academico', font: parse(academico.buffer) },
  { family: 'Academico', weight: 'bold', font: parse(bold.buffer) },
];
