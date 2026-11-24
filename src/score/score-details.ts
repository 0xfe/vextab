// Describe score opening text and cue-sized alternate readings for both backends.
import { KeyManager, Ornament, VexFlow, type RenderContext } from 'vexflow';
import type { ScoreHeading } from './grammar2/model';
import type { Attack } from './model';
import { headingWeight, scoreMusicFont, scoreTextFont } from './engraving';

/** Engrave a heading relative to the staff (traditional) or the top of the page (centered).
 * Return the space occupied by a centered block so the chord key and score can follow it. */
export function drawHeading(ctx: RenderContext, heading: ScoreHeading, left: number, width: number, origin: number) {
  ctx.save();
  ctx.openGroup('score-heading');
  const centered = heading.align === 'center';
  const factor = Math.min(1, centered ? Math.max(0.75, width / 620) : width / 620);
  let height = 0;

  function line(text: string | undefined, position: number, lift: number, size: number, align = 0) {
    if (!text) return;
    // Raised ordinals and metronome marks each need their own size or typeface in portable SVG.
    const runs = text.split(/(\^\{[^{}]+\}|♩)/).filter(Boolean).map(token => {
      const raised = token.startsWith('^{') && token.endsWith('}');
      const content = raised ? token.slice(2, -1) : token;
      const quarter = token === '♩';
      const family = quarter ? scoreMusicFont() : scoreTextFont();
      const weight = quarter ? 'normal' : headingWeight();
      const label = quarter ? VexFlow.Glyphs.metNoteQuarterUp : content.trim();
      const fontSize = size * factor * (raised ? 0.62 : 1);
      ctx.setFont(family, fontSize, weight, 'normal');
      const space = quarter ? 0 : ctx.measureText('a a').width - ctx.measureText('aa').width;
      const leading = (content.length - content.trimStart().length) * space;
      const advance = (content.length - label.length) * space + ctx.measureText(label).width;
      return { label, family, weight, fontSize, raised, leading, advance };
    });
    const span = runs.reduce((sum, run) => sum + run.advance, 0);
    const fit = centered && span > width ? width / span : 1;
    const lineSize = size * factor * fit;
    let x = left + position * width - span * fit * align;
    const baseline = centered ? origin + height + lineSize * 1.3 : origin - lift * factor;
    for (const run of runs) {
      ctx.setFont(run.family, run.fontSize * fit, run.weight, 'normal');
      ctx.fillText(run.label, x + run.leading * fit, baseline - (run.raised ? lineSize * 0.5 : 0));
      x += run.advance * fit;
    }
    if (centered) height += lineSize * 1.85;
  }
  if (centered) {
    line(heading.title, 0.5, 0, 32, 0.5);
    line(heading.dedication, 0.5, 0, 16, 0.5);
    line(heading.composer, 0.5, 0, 16, 0.5);
    line(heading.tempo, 0.5, 0, 16, 0.5);
  } else {
    line(heading.title, 0.5, 112, 34, 0.5);
    line(heading.dedication, 0.045, 74, 18);
    line(heading.tempo, 0.17, 39, 23);
    line(heading.composer, 0.985, 32, 19, 1);
  }
  ctx.closeGroup();
  ctx.restore();
  return height;
}

/** Spell the printed signs of an inline reading against its host key and its own accidental history. */
export function ossiaNotes(reading: Attack['ossia'], key: string) {
  const signature = new KeyManager(key);
  const current = new Map<string, string>();
  return reading.notes.map(tone => {
    const [pitch, octave] = tone.key.split('/');
    const letter = pitch[0], accidental = pitch.slice(1) || 'n', position = letter + octave;
    const prior = current.get(position) ?? signature.getAccidental(letter).accidental ?? 'n';
    current.set(position, accidental);
    // EasyScore accepts the SMuFL ornament glyph as a positioned articulation on this cue head.
    const ornament = tone.ornament && new Ornament(tone.ornament.replace('_inverted', 'Inverted')).getText();
    const options = ornament ? '[stem="down",articulations="' + ornament + '.above"]' : '[stem="down"]';
    return letter + (prior === accidental ? '' : accidental) + octave + '/' + reading.duration + options;
  }).join(', ');
}
