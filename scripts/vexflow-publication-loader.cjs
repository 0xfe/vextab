// Adapt publication, grand-staff spacing and draw callbacks in the pinned VexFlow ESM build.
// Native Publication still measures the ink, paginates it and owns all page output.
const path = require('node:path');

/** Fail the build if an upstream change invalidates a callback location. */
function replaceOnce(source, original, replacement) {
  if (source.split(original).length !== 2) throw new Error('Review the VexFlow publication adapter at ' + original);
  return source.replace(original, replacement);
}

/** Route TAB phrase slurs through the native system splitter, using string heights at breaks. */
function tabSlurs(source) {
  source = replaceOnce(source, "(span.kind !== 'tie' && span.kind !== 'volta')",
    "(span.kind !== 'tie' && span.kind !== 'volta' && span.kind !== 'slur')");
  const fragment = 'addFragment(s, units, row, baseline) {';
  source = replaceOnce(source, fragment, fragment + `
        const continuation = (anchor, stave, index = 0) => anchor.note instanceof TabNote
            ? stave.getYForLine(anchor.note.getPositions()[index].str - 1)
            : continuationPitch(anchor, stave, index);`);
  source = replaceOnce(source, 'continuationPitch(s.first, startStaff, s.spec.fromHead)', 'continuation(s.first, startStaff, s.spec.fromHead)');
  source = replaceOnce(source, 'continuationPitch(s.last, endStaff, s.spec.toHead)', 'continuation(s.last, endStaff, s.spec.toHead)');
  // Use individual fret digits as obstacles, so the curve can pass through open string space.
  source = replaceOnce(source, '.filter((n) => n instanceof StaveNote &&\n                    (n.getStave()',
    '.filter((n) => (n instanceof StaveNote || (kind === "slur" && n instanceof TabNote)) &&\n                    (n.getStave()');
  const failure = 'if (!fitSpan(fragment, obstacles))';
  source = replaceOnce(source, failure, `let fitted = fitSpan(fragment, obstacles);
            if (!fitted && kind === 'slur' && !s.spec.guitarPhrase) {
                const original = { x1: fragment.x1, y1: fragment.y1, x2: fragment.x2, y2: fragment.y2, rise: fragment.rise };
                // Tie anchors reserve space beside dots. A slur on the head side of a chord can
                // leave over its outside notehead, giving the arc room to clear the following attack.
                const headEdge = note => {
                    if (!(note instanceof StaveNote) || note.getKeys().length < 2 || note.getStemDirection() !== sign) return;
                    return note.getHeadInk().reduce((a, b) => (above ? a.y < b.y : a.y + a.h > b.y + b.h) ? a : b);
                };
                const left = starts && headEdge(s.first.note), right = ends && headEdge(s.last.note);
                if (left) {
                    fragment.x1 = left.x + left.w;
                    fragment.y1 = (above ? left.y : left.y + left.h) + sign * space * 0.35;
                }
                if (right) {
                    fragment.x2 = right.x;
                    fragment.y2 = (above ? right.y : right.y + right.h) + sign * space * 0.35;
                }
                if ((left || right) && fragment.x2 > fragment.x1) fitted = fitSpan(fragment, obstacles);
                // Long piano phrases may need to leave above a column of fingerings on the
                // very next chord. Give the endpoints room before trying a steeper arc.
                if (!fitted && (left || right) && fragment.x2 > fragment.x1) {
                    const startY = fragment.y1, endY = fragment.y2;
                    for (const lift of [0.75, 1.5, 2.25, 3]) {
                        if (left) fragment.y1 = startY + sign * lift * space;
                        if (right) fragment.y2 = endY + sign * lift * space;
                        if (fitSpan(fragment, obstacles)) { fitted = true; break; }
                    }
                }
                if (!fitted) Object.assign(fragment, original);
            }
            if (!fitted && s.spec.guitarPhrase) {
                const { x1, x2, y1, y2, rise } = fragment;
                // Try the two head edges and a small inside offset. Lift past simultaneous dots only as a last resort.
                // Coordinates are staff spaces. Endpoints at a system break stay at the native continuation.
                for (const [left, right, lift] of [[0.3, 0, 0], [0.3, -0.5, 0], [-0.5, -0.5, 0], [0.3, 0.3, 0], [0.3, 0, 0.8]]) {
                    fragment.x1 = x1 + (starts ? left * space : 0);
                    fragment.x2 = x2 - (ends ? right * space : 0);
                    fragment.y1 = y1 + (starts ? sign * lift * space : 0);
                    fragment.y2 = y2 + (ends ? sign * lift * space : 0);
                    if (fragment.x2 > fragment.x1 && fitSpan(fragment, obstacles)) {
                        fitted = true;
                        break;
                    }
                }
                if (!fitted) Object.assign(fragment, { x1, x2, y1, y2, rise });
            }
            if (fitted && kind === 'slur' && starts && ends && s.first.staff === s.last.staff)
                this.options.compactPianoSlur?.(fragment, s.first.note, s.last.note, events, fitSpan);
            if (!fitted)`);
  // A grace slur leaves usable space between its ribbon and the sustained chord.
  return replaceOnce(source, '.flatMap((n) => measureEngraving(n).parts);',
    `.flatMap((n) => n instanceof TabNote ? n.getFretInk() : measureEngraving(n, {
                    extension(owner) {
                        // The guitar chord lane is positioned outside the finished curves after formatting.
                        if (owner.getAttribute('vextab-guitar-chord')) return { parts: [], anchors: {} };
                        if (s.spec.guitarPhrase && owner.getRouteParts && !owner.text) return { parts: owner.getRouteParts(), anchors: {} };
                    }
                }).parts);`);
}

/** Give the row breaker and the formatter the same opening indent. The preview pass
 * routes curves at native coordinates; only the final pass contributes drawings and diagnostics. */
function pianoLayout(source) {
  // A brace reaches 14 px left of its stave. Group spacing supplies 9 px, and a named stave
  // already reserves the remainder in its label column. Keep an unlabeled brace inside the page.
  source = replaceOnce(source, 'return (w ? w + 10 : 0) + this.groups.length * 9;',
    `const braceOverhang = this.groups.some(group => group.type === 'brace') ? 5 : 0;
        return (w ? w + 10 : braceOverhang) + this.groups.length * 9 + (measure === 0 ? this.options.firstSystemIndent ?? 0 : 0);`);
  source = replaceOnce(source, 'y += row.height + options.rowGap;', 'y = row.y + row.height + options.rowGap;');
  source = replaceOnce(source, 'layoutRow(units, options, y) {', `layoutRow(units, options, y) {
        const drawings = this.drawing.length, fragments = this.fragments.length, diagnostics = this.diagnostics.length;
        const row = this.placeRow(units, options, y);
        const fit = this.options.fitGrandStaff;
        const braces = this.groups.filter(g => g.type === 'brace' && g.last === g.first + 1 &&
            [g.first, g.last].every(j => row.visibleStaves.includes(this.spec.staves[j].id)));
        if (!fit || !braces.length) return row;
        const first = units[0].first, last = units[units.length - 1].last;
        const spans = this.spans.filter(s => s.first.measure <= last && s.last.measure >= first);
        // Cross-staff stems and continuous beams own native geometry across the two staves.
        if (this.splitChords.some(s => s.measure >= first && s.measure <= last) || spans.some(s => s.beam)) return row;
        const plan = fit(this.score, row, braces, spans, this.fragments.slice(fragments), this.spec.system?.spaceBetweenStaves ?? 12);
        const edges = this.options.allowSystemFit?.(row.measures) && plan.systemEdges;
        const shared = edges ? this.options.sharedSystemSpace(this.score, this.rows[this.rows.length - 1], row, edges, plan.topInset) : 0;
        // Publication keeps staging rows apart to identify their SVG ink. Its paginator applies the same saving.
        const shift = this.options.publication ? 0 : shared;
        let final = row;
        if (plan.needsRefit || shift) {
            this.drawing.length = drawings;
            this.fragments.length = fragments;
            this.diagnostics.length = diagnostics;
            final = this.placeRow(units, options, y - shift, plan);
        }
        if (plan.systemEdges) this.options.includeSystemBottom(this.score, final, plan.systemEdges);
        final.systemEdges = edges;
        final.sharedSpaceBefore = shared;
        return final;
    }
    placeRow(units, options, y, plan) {`);
  source = replaceOnce(source, 'const origin = y + header - limits[visible[0]].top;',
    'const origin = y + header - limits[visible[0]].top + (plan?.topInset ?? 0);');
  source = replaceOnce(source, 'Math.max(offsets[b], limits[a].bottom - limits[b].top + 8)',
    `Math.max(offsets[b], plan?.distances.get(b) ?? (limits[a].bottom - limits[b].top + 8 -
             (this.groups.some(g => g.type === 'brace' && g.first === a && g.last === b) ? this.score.staves[first][a].space(2.8) : 0)))`);
  const lane = '(s.spec.bend || spanAbove(s.spec) ? ink[staff].top - lane * 25 - 4 : ink[staff].bottom + lane * 25 + 14)';
  return replaceOnce(source, lane, '(plan?.baselines.get(s.spec.id) ?? ' + lane + ')');
}

/** VexFlow 5.9 calculates its stroke bounds while painting. Run the same geometry
 * without a context when the formatter asks for bounds before the first draw. */
function strokeGeometry(source) {
  source = replaceOnce(source, 'const ctx = this.checkContext();',
    'this.setRendered();\n        this.layoutStroke(this.checkContext());\n    }\n    layoutStroke(ctx) {');
  source = replaceOnce(source, 'this.checkAttachedNote();\n        this.setRendered();', 'this.checkAttachedNote();');
  // The glyph positions, rotations and union of their bounds run in both passes.
  source = source.replaceAll('ctx.openRotation(', 'ctx?.openRotation(').replaceAll('ctx.closeRotation()', 'ctx?.closeRotation()')
    .replaceAll('el.renderText(ctx,', 'if (ctx) el.renderText(ctx,');
  source = replaceOnce(source, 'ctx.fillRect(', 'ctx?.fillRect(');
  return replaceOnce(source, 'getBoundingBox() {',
    'getLayoutBounds() {\n        this.layoutStroke();\n        return this.boundingBox;\n    }\n    getBoundingBox() {');
}

/** Apply a pair's shared margins only when both systems actually land on the same page. */
function pageGaps(source) {
  source = replaceOnce(source, 'const count = systems.length;', 'const gap = row => rules.gap - (row.sharedSpaceBefore ?? 0);\n    const count = systems.length;');
  source = replaceOnce(source, 'i === first ? 0 : rules.gap', 'i === first ? 0 : gap(row)');
  source = replaceOnce(source, 'rules.gap * (rows.length - 1)', 'rows.slice(1).reduce((sum, row) => sum + gap(row), 0)');
  source = replaceOnce(source, 'rows.map((row) => {', 'rows.map((row, i) => {\n            if (i) y += gap(row) + extra;');
  return replaceOnce(source, 'y += row.height + rules.gap + extra;', 'y += row.height;');
}

/** Use the same typed-note preparation in a fresh part or cue as in the interactive score. */
module.exports = function publicationHooks(source) {
  // VexFlow already positions and draws a hyphen from the verse annotation. Its
  // 5.7 validator only admits this anchor on an extender, leaving a hyphen in a separate lane.
  if (path.basename(this.resourcePath) === 'composition.js') {
    // Keep native chord annotations and their spacing. Polyphonic guitar has its own row-wide baseline.
    return replaceOnce(source, 'if (note instanceof StaveNote) {\n            const stave = note.checkStave();',
      'if (note instanceof StaveNote && !measure.guitarChordLane) {\n            const stave = note.checkStave();');
  }
  if (path.basename(this.resourcePath) === 'continuouslayout.js') {
    source = replaceOnce(source, "span.kind !== 'lyric' ||", "(span.kind !== 'lyric' && span.kind !== 'hyphen') ||");
    // Include a cue staff in the same envelope as native ink before placing the next hand or system.
    const staffBottom = 'stave.getYForLine(stave.getNumLines() - 1) + stave.space(1.6)';
    source = replaceOnce(source, staffBottom, "stave.getYForLine(Math.max(stave.getNumLines() + 0.6, Number(stave.getAttribute('vextab-ossia-bottom')) || 0))");
    return pianoLayout(tabSlurs(source));
  }
  if (path.basename(this.resourcePath) === 'strokes.js') return strokeGeometry(source);
  if (path.basename(this.resourcePath) === 'gracenotegroup.js') {
    // Before-graces own left-side space. Right-side chord labels must not push TAB frets past the clef.
    return replaceOnce(source, 'tick.getXOffset() + this.afterWidth - fretOverhang',
      'tick.getXOffset() + (isTabNote(note) ? note.getTickContext().getMetrics().modRightPx : this.afterWidth) - fretOverhang');
  }
  if (path.basename(this.resourcePath) === 'factory.js') {
    const point = 'const defaults = ctx.getDefaultStyle();';
    return replaceOnce(source, point, 'options.afterFormat?.();\n        ' + point);
  }
  if (path.basename(this.resourcePath) === 'pagebreaks.js') return pageGaps(source);
  source = replaceOnce(source, 'music: musicGroup(svg),', 'sharedSpaceBefore: row.sharedSpaceBefore, music: musicGroup(svg),');
  source = replaceOnce(source, 'const measured = rows.map((r) =>', 'const measured = rows.map((r, i) =>');
  source = replaceOnce(source, 'height: (r.bottom - r.top + r.insetHeight) * size.scale',
    'height: (r.bottom - r.top + r.insetHeight) * size.scale, sharedSpaceBefore: i && !r.insetHeight && !rows[i-1].insetHeight ? (r.sharedSpaceBefore ?? 0) * size.scale : 0');
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
