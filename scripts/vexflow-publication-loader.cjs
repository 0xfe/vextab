// Expose two scoped draw callbacks in the bundled VexFlow 5.7 ESM build.
// Native Publication still measures the ink, paginates it and owns all page output.
const path = require('node:path');

/** Fail the build if an upstream change invalidates a callback location. */
function replaceOnce(source, original, replacement) {
  if (source.split(original).length !== 2) throw new Error('Review the VexFlow publication adapter at ' + original);
  return source.replace(original, replacement);
}

/** Use the same typed-note preparation in a fresh part or cue as in the interactive score. */
module.exports = function publicationHooks(source) {
  if (path.basename(this.resourcePath) === 'factory.js') {
    const point = 'const defaults = ctx.getDefaultStyle();';
    return replaceOnce(source, point, 'options.afterFormat?.();\n        ' + point);
  }
  const part = 'const { ctx, factory, score } = compose(host, spec, options.noteHooks);';
  source = replaceOnce(source, 'return { ctx, factory, score };', 'return { ctx, factory, score, builder: easyScore.builder };');
  const inset = 'const inset = compose(host, insetSpec, o.noteHooks);';
  source = replaceOnce(source, part + '\n            factory.draw();', part.replace('ctx, factory, score', 'ctx, factory, score, builder') +
    '\n            if (options.drawComposition) options.drawComposition(spec, score, factory, builder); else factory.draw();');
  return replaceOnce(source, inset + '\n        inset.factory.draw();', inset +
    '\n        if (o.drawComposition) o.drawComposition(insetSpec, inset.score, inset.factory, inset.builder, r.measure); else inset.factory.draw();');
};
