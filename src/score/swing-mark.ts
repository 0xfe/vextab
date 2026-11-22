// Engrave the lead-sheet swing equation with VexFlow notes, a beam and a bracketed triplet.
import { Beam, Stave, StaveNote, TickContext, Tuplet, type RenderContext } from 'vexflow';
import { scoreFont } from './engraving';

/** The invisible stave supplies cue-note coordinates. No demo notes enter the score or playback. */
export function drawSwingMark(ctx: RenderContext, left: number, baseline: number) {
  const scale = .55;
  ctx.save();
  const group = ctx.openGroup('swing-mark');
  if (group) {
    group.setAttribute('transform', 'scale(' + scale + ')');
    group.setAttribute('aria-label', 'Swing eighth notes');
  } else ctx.scale(scale, scale);
  const x = left / scale, y = baseline / scale;
  ctx.setFont(scoreFont, 22, 'bold', 'normal');
  ctx.fillText('Swing', x, y);
  const stave = new Stave(0, 0, 130);
  stave.setY(y - stave.getYForNote(3)).setNoteStartX(0);
  const musicX = x + ctx.measureText('Swing').width + 8;
  function glyph(duration: string, offset: number) {
    const note = new StaveNote({ keys: ['b/4'], duration, stemDirection: 1 }).setStave(stave).setContext(ctx);
    new TickContext().addTickable(note).preFormat().setX(musicX + offset);
    return note;
  }
  const pair = [glyph('8', 0), glyph('8', 23)];
  const shuffle = [glyph('q', 76), glyph('8', 110)];
  const beam = new Beam(pair);
  const triplet = new Tuplet(shuffle, { numNotes: 3, notesOccupied: 2, bracketed: true, ratioed: false });
  for (const note of [...pair, ...shuffle]) note.draw();
  beam.setContext(ctx).draw();
  const pairEnd = pair[1].getAbsoluteX() + pair[1].getGlyphWidth();
  const equalsX = (pairEnd + shuffle[0].getAbsoluteX() - ctx.measureText('=').width) / 2;
  ctx.fillText('=', equalsX, y - 7);
  triplet.setContext(ctx).draw();
  ctx.closeGroup();
  ctx.restore();
}
