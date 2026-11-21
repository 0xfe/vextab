// Expose scoped publication and draw callbacks in the bundled VexFlow ESM build.
// Native Publication still measures the ink, paginates it and owns all page output.
const path = require('node:path');

/** Fail the build if an upstream change invalidates a callback location. */
function replaceOnce(source, original, replacement) {
  if (source.split(original).length !== 2) throw new Error('Review the VexFlow publication adapter at ' + original);
  return source.replace(original, replacement);
}

/** Use the same typed-note preparation in a fresh part or cue as in the interactive score. */
module.exports = function publicationHooks(source) {
  // VexFlow already positions and draws a hyphen from the verse annotation. Its
  // 5.7 validator only admits this anchor on an extender, leaving a hyphen in a separate lane.
  if (path.basename(this.resourcePath) === 'continuouslayout.js') {
    return replaceOnce(source, "span.kind !== 'lyric' ||", "(span.kind !== 'lyric' && span.kind !== 'hyphen') ||");
  }
  if (path.basename(this.resourcePath) === 'factory.js') {
    const point = 'const defaults = ctx.getDefaultStyle();';
    return replaceOnce(source, point, 'options.afterFormat?.();\n        ' + point);
  }
  const part = 'const { ctx, factory, score } = compose(host, spec, options.noteHooks);';
  source = replaceOnce(source, 'return { ctx, factory, score };', 'return { ctx, factory, score, builder: easyScore.builder };');
  source = replaceOnce(source, part, part.replace('ctx, factory, score', 'ctx, factory, score, builder'));
  source = replaceOnce(source, '\n            factory.draw();',
    '\n            if (options.drawComposition) options.drawComposition(spec, score, factory, builder); else factory.draw();');
  // VexTab authors one-bar cues. Leave native ranged insets on their own alignment and drawing path.
  source = replaceOnce(source, 'addInsetFragment(host, spec, hooks,', 'addInsetFragment(host, spec, options,');
  source = replaceOnce(source, 'addInsetFragment(host, spec, o.noteHooks,', 'addInsetFragment(host, spec, o,');
  const inset = 'const inset = compose(host, insetSpec, hooks, region.transpose);';
  source = replaceOnce(source, inset, 'if (hosts.length === 1 && options.insetSpans) insetSpec.continuous.spans = options.insetSpans(insetSpec);\n    ' +
    inset.replace('insetSpec, hooks', 'insetSpec, options.noteHooks'));
  return replaceOnce(source, '    inset.factory.draw();',
    '    if (hosts.length === 1 && options.drawComposition) options.drawComposition(insetSpec, inset.score, inset.factory, inset.builder, first); else inset.factory.draw();');
};
