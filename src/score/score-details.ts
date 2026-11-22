// Draw front matter above the opening system on both rendering backends.
import type { RenderContext } from 'vexflow';
import type { ScoreHeading } from './grammar2/model';
import { scoreFont } from './engraving';

/** Heading positions are relative to the music margins and the first staff line. */
export function drawHeading(ctx: RenderContext, heading: ScoreHeading, left: number, width: number, staffTop: number) {
  ctx.save();
  ctx.openGroup('score-heading');
  const factor = Math.min(1, width / 620);
  function line(text: string | undefined, position: number, lift: number, size: number, align = 0) {
    if (!text) return;
    // Raised ordinals use ordinary font outlines, including in portable SVG exports.
    const runs = text.split(/(\^\{[^{}]+\})/).filter(Boolean).map(token => {
      const raised = token.startsWith('^{') && token.endsWith('}');
      const content = raised ? token.slice(2, -1) : token;
      const label = content.trim();
      const fontSize = size * factor * (raised ? 0.62 : 1);
      ctx.setFont(scoreFont, fontSize, 'bold', 'normal');
      // SVG collapses edge spaces on separate text elements. Advance explicitly at run boundaries.
      const space = ctx.measureText('a a').width - ctx.measureText('aa').width;
      const leading = (content.length - content.trimStart().length) * space;
      const advance = (content.length - label.length) * space + ctx.measureText(label).width;
      return { label, fontSize, raised, leading, advance };
    });
    let x = left + position * width - runs.reduce((sum, r) => sum + r.advance, 0) * align;
    for (const run of runs) {
      ctx.setFont(scoreFont, run.fontSize, 'bold', 'normal');
      ctx.fillText(run.label, x + run.leading, staffTop - (lift + (run.raised ? size * 0.5 : 0)) * factor);
      x += run.advance;
    }
  }
  line(heading.title, 0.5, 112, 34, 0.5);
  line(heading.dedication, 0.045, 74, 18);
  line(heading.tempo, 0.17, 39, 23);
  line(heading.composer, 0.985, 32, 19, 1);
  ctx.closeGroup();
  ctx.restore();
}
