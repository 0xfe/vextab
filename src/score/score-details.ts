// Draw score headings, alternative readings and traditional piano pedal marks on either backend.
import { Accidental, Element, Factory, PedalMarking, VexFlow, type RenderContext, type StaveNote } from 'vexflow';
import type { ScoreHeading } from './grammar2/model';
import type { Attack } from './model';
import { headingWeight, scoreTextFont } from './engraving';

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
      ctx.setFont(scoreTextFont(), fontSize, headingWeight(), 'normal');
      // SVG collapses edge spaces on separate text elements. Advance explicitly at run boundaries.
      const space = ctx.measureText('a a').width - ctx.measureText('aa').width;
      const leading = (content.length - content.trimStart().length) * space;
      const advance = (content.length - label.length) * space + ctx.measureText(label).width;
      return { label, fontSize, raised, leading, advance };
    });
    let x = left + position * width - runs.reduce((sum, r) => sum + r.advance, 0) * align;
    for (const run of runs) {
      ctx.setFont(scoreTextFont(), run.fontSize, headingWeight(), 'normal');
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

/** The alternative has its own accidental state, rhythm and cue-sized staff. */
const cueScale = 0.63;

/** Reserve room for the cue's ledger lines, ornament and downward stems before breaking systems. */
export function ossiaLines(reading: Attack['ossia'], clef: string) {
  const lines = reading.notes.map(tone => 5 - VexFlow.keyProperties(tone.key, clef).line);
  const highest = Math.min(0, ...lines.map((line, i) => line - (reading.notes[i].ornament ? 3 : 0.5)));
  const top = 6.5 - highest * cueScale;
  const bottom = top + cueScale * Math.max(4, ...lines.map(line => line + 4));
  return { top, bottom };
}

/** Retain the authored reading on the native anchor for both spacing and drawing. */
export const ossiaReadings = new WeakMap<StaveNote, Attack['ossia']>();

/** Distance in staff spaces by which a measured cue can rise above its fallback position. */
export const ossiaLift = new WeakMap<StaveNote, number>();

/** Keep the cue and its label inside the margins, including when the anchor ends a row. */
export function placeOssia(reading: Attack['ossia'], anchor: StaveNote, row: { x: number; width: number }) {
  const width = 35 + 30 * reading.notes.length;
  const scale = Math.min(cueScale, row.width / width);
  const x = Math.max(row.x / scale, Math.min((row.x + row.width) / scale - width, (anchor.getAbsoluteX() - 8) / scale));
  const stave = anchor.checkStave();
  const lines = ossiaLines(reading, stave.getClef());
  const lift = ossiaLift.get(anchor) ?? 0;
  const y = stave.getYForLine(lines.top - lift) / scale;
  const ctx = anchor.checkContext();
  ctx.save();
  ctx.setFont(scoreTextFont(), 18, headingWeight());
  const labelWidth = ctx.measureText('Ossia.').width;
  ctx.restore();
  const labelX = Math.max(0, x - labelWidth - 8);
  const labelY = x > labelWidth + 8 ? y + 30 : y - 10;
  // The gap above a lower hand only depends on the cue over its actual horizontal extent.
  const box = { x: labelX * scale, y: stave.getYForLine(4), w: (x + width - labelX) * scale,
    h: stave.space(lines.bottom - lift - 4) };
  return { x, y, width, scale, labelX, labelY, box };
}

/** Size and place an alternative at its principal attack within the system margins. */
export function drawOssia(ctx: RenderContext, reading: Attack['ossia'], anchor: StaveNote, key: string, row: { x: number; width: number }) {
  const { x, y, width, scale, labelX, labelY } = placeOssia(reading, anchor, row);
  ctx.save();
  const group = ctx.openGroup('ossia');
  if (group) group.setAttribute('transform', 'scale(' + scale + ')');
  else ctx.scale(scale, scale);
  const factory = new Factory({ renderer: { elementId: null, width: 1, height: 1 } }).setContext(ctx);
  const score = factory.EasyScore();
  const notes = reading.notes.map(tone => {
    const note = factory.StaveNote({ keys: [tone.key], duration: reading.duration, clef: anchor.checkStave().getClef(), stemDirection: -1 });
    if (tone.ornament) note.addModifier(factory.Ornament(tone.ornament.replace('_inverted', 'Inverted'), { position: 'above' }));
    return note;
  });
  if (reading.duration !== 'q' && notes.length > 1) score.beam(notes, { autoStem: false });
  const voice = score.voice(notes, { time: notes.length + '/' + (reading.duration === 'q' ? 4 : reading.duration) });
  Accidental.applyAccidentals([voice], key);
  factory.System({ x, y: y - 40, width }).addStave({ voices: [voice] });
  factory.draw();
  ctx.setFont(scoreTextFont(), 18, headingWeight());
  ctx.fillText('Ossia.', labelX, labelY);
  ctx.closeGroup();
  ctx.restore();
}

/** Same-bar pedal bounds are available during layout. A longer pair requires native row spacing. */
interface PedalPair { first: StaveNote; last: StaveNote }
const pedalPairs = new WeakMap<StaveNote, PedalPair[]>();

/** Register both endpoints so a cross-measure pedal retains the native margins at either end. */
export function registerPedal(first: StaveNote, last: StaveNote) {
  const pair = { first, last };
  for (const endpoint of new Set([first, last])) pedalPairs.set(endpoint, [...pedalPairs.get(endpoint) ?? [], pair]);
}

/** Text pedals have two separate glyphs. A note in the next system can rise between them. */
export function pedalInk(note: StaveNote) {
  const parts = [];
  for (const { first, last } of pedalPairs.get(note) ?? []) {
    if (first.getStave() !== last.getStave()) return;
    if (note !== first) continue;
    const pedal = pianoPedal(first, last), stave = first.checkStave();
    const glyph = new Element('PedalMarking').setFont(pedal.fontInfo);
    const y = pedal.getYForStave(stave);
    parts.push(glyph.setText(PedalMarking.GLYPHS.pedalDepress).getTextInk(first.getAbsoluteX(), y));
    const events = last.getVoice().getTickables();
    const end = events[events.indexOf(last) + 1]?.getAbsoluteX() ?? stave.getX() + stave.getWidth();
    glyph.setText(PedalMarking.GLYPHS.pedalRelease);
    parts.push(glyph.getTextInk(end - glyph.getWidth(), y));
  }
  return parts;
}

/** Share the exact pedal baseline and glyph metrics with the system spacing pass. */
function pianoPedal(first: StaveNote, last: StaveNote) {
  const pedal = new PedalMarking([first, last]).setFontSize(27);
  if (first.checkStave().getY() === last.checkStave().getY()) {
    const bottom = (note: StaveNote) => { const box = note.getBoundingBox(); return box.y + box.h; };
    pedal.setLayoutBaseline(Math.max(first.checkStave().getYForLine(7), bottom(first) + 23, bottom(last) + 23));
  }
  return pedal;
}

/** A text release sits at the end of its note, even when it ends at the barline. */
export function drawPedal(ctx: RenderContext, first: StaveNote, last: StaveNote) {
  ctx.save();
  // Publication assigns top-level elements to systems. A cross-system pair needs two independent glyphs.
  const oneRow = first.checkStave().getY() === last.checkStave().getY();
  if (oneRow) ctx.openGroup('pedal');
  pianoPedal(first, last).setContext(ctx).drawWithStyle();
  if (oneRow) ctx.closeGroup();
  ctx.restore();
}
