// Portable outlines for the handwritten edition, loaded only when a Petaluma score is exported.
import { parse } from 'opentype.js';
import type { SVGFont } from 'vexflow';
import petaluma from '@vexflow-fonts/petaluma/petaluma.otf';
import script from '@vexflow-fonts/petalumascript/petalumascript.otf';

export const faces: SVGFont[] = [
  { family: 'Petaluma', font: parse(petaluma.buffer) },
  { family: 'Petaluma Script', font: parse(script.buffer) },
];
