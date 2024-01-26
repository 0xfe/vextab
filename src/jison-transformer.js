// From mermaid
// https://github.com/mermaid-js/mermaid/blob/develop/.vite/jisonTransformer.ts
import jison from 'jison';

export const transformJison = (src) => {
  const parser = new jison.Generator(src, {
    moduleType: 'js',
    'token-stack': true,
  });
  const source = parser.generate({ moduleMain: '() => {}' });
  const exporter = `
	parser.parser = parser;
	export { parser };
	export default parser;
	`;
  return `${source} ${exporter}`;
};