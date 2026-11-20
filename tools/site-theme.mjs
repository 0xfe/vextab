// Embed the local guide faces and their notices so the reports can be read offline.
import { readFileSync } from 'node:fs';
const read = (path, format) => readFileSync(new URL(path, import.meta.url), format);
const css = read('./site-theme.css', 'utf8').replace(
  /url\('([^']+\.(woff2|ttf))'\)/g,
  (_, path, format) => `url('data:font/${format};base64,${read(path, 'base64')}')`,
);
const notices = ['../guide/fonts/tangerine/OFL.txt', '../node_modules/@vexflow-fonts/academico/LICENSE.txt'];
export const siteTheme = notices.map((path) => '/*!\n' + read(path, 'utf8') + '\n*/\n').join('') + css;
