// Apply narrow fixes for stock VexFlow 5.10 engraving regressions identified by the repertoire tests.
const path = require('node:path');

/** An upstream update must either remove the workaround or still match exactly one site. */
function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error('Review the VexFlow engraving workaround at ' + from);
  return source.replace(from, to);
}

module.exports = function engravingCompatibility(source) {
  if (path.basename(this.resourcePath) === 'engravinggeometry.js') {
    // vexflow/vexflow#472. A harmony on the notation stave also measures the companion TAB stave.
    source = replaceOnce(source, "import { TextNote }", "import { TabNote } from './tabnote.js';\nimport { TextNote }");
    return replaceOnce(source, 'else if (kind === TextNote', 'else if (owner instanceof TabNote) {\n' +
      '                shape.parts.push(...owner.getFretInk());\n' +
      '                children(owner.getModifiers());\n' +
      '            }\n            else if (kind === TextNote');
  }
  // vexflow/vexflow#471. Give the open end of a TAB slur the same clearance search as a pitched continuation.
  source = replaceOnce(source, 'ends(a, start, true) : [a]', 'ends(a, start, true) : continuationEnds(a.x, a.y, f, ink)');
  source = replaceOnce(source, 'ends(b, end, false) : [b]', 'ends(b, end, false) : continuationEnds(b.x, b.y, f, ink)');
  // A slur leaves its own head. The modifiers on both endpoints still participate in collision detection.
  source = replaceOnce(source, 'const ink = slurInk(events, exclude);', 'const ink = slurInk(events, exclude, span);');
  // Fingered chords and beams can obstruct the first choice at the end of the stem.
  // Try the neighboring staff-space positions before giving up an explicitly requested side.
  source = replaceOnce(source, 'return options;', `const attachment = options[0];
    for (const delta of [0.3, 0.6, 1]) options.push({ x: attachment.x, y: attachment.y + sign * f.space * delta });
    return options;`);
  source = replaceOnce(source, '[0.5, 1, 1.75, 2.5]', '[0.5, 1, 1.75, 2.5, 1.1, 3.1]');
  // vexflow/vexflow#473. An undirected single-system slur can clear a beam on the opposite side. Keep authored sides fixed.
  const finish = 'return fitSlurEndpoints(f, left, right, ink);\n}\nexport function fitTabSlur';
  return replaceOnce(source, finish, `if (fitSlurEndpoints(f, left, right, ink)) return true;
    if (f.part !== 'single' || span.spec.side) return false;
    const trial = { ...f, above: !f.above };
    const opposite = { ...span, spec: { ...span.spec, side: trial.above ? 'above' : 'below' } };
    if (!fitPitchedSlur(trial, opposite, events, exclude)) return false;
    Object.assign(f, trial);
    return true;
}
export function fitTabSlur`);
};
