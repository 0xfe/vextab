// Script-tag adapter for archived examples that use the legacy or automatic Div entry.
import type Div from '../src/div';
import { scoreOptions } from './audio';
export { scoreOptions } from './audio';

const mode = (document.currentScript as HTMLScriptElement)?.dataset.mount;
if (mode) {
  const globals = window as typeof window & {
    VexTabDiv: { Div: typeof Div & { SEL: string } };
    vextab: { Div: typeof Div };
    VEXTAB_SEL_V3: string;
  };
  // Take over only the documented example page's auto-mount before DOM ready.
  const legacy = mode === 'legacy';
  const Embed = legacy ? globals.VexTabDiv.Div : globals.vextab.Div;
  if (legacy) globals.VexTabDiv.Div.SEL = '';
  else globals.VEXTAB_SEL_V3 = '';
  document.addEventListener('DOMContentLoaded', () => {
    for (const host of document.querySelectorAll<HTMLElement>(legacy ? '.vex-tabdiv' : '.vextab-auto')) {
      new Embed(host, scoreOptions(host));
    }
  });
}
