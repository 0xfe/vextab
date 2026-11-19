// Script-tag entry. Automatically mount modern VexTab embeds after the document is ready.
import Div from './div';
export * from './browser';
export { default } from './div';

(window as any).VEXTAB_SEL_V3 = 'div.vextab-auto';
$(() => {
  const selector = (window as any).VEXTAB_SEL_V3;
  if (selector) $(selector).forEach((host: HTMLElement) => new Div(host));
});
