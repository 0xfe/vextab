// Musical rules shared by the fixed Artist and the source-based score compiler.
import { Bend, KeyManager, Music, Tuning, VexFlow } from 'vexflow';
import type { Prebend } from './model';

/** Preserve enharmonic octave crossings such as B sharp and C flat. */
export function midiPitch(key: string): number | undefined {
  const match = /^([a-g])(bb|##|b|#|n)?\/(-?\d+)$/i.exec(key);
  if (!match) return;
  const natural = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[match[1].toLowerCase()];
  const offset = { bb: -2, b: -1, n: 0, '': 0, '#': 1, '##': 2 }[match[2] ?? ''];
  const pitch = 12 * (Number(match[3]) + 1) + natural + offset;
  if (pitch >= 0 && pitch <= 127) return pitch;
}

/** Use guitar bend amounts in both the tab arrow and the printed playing instruction. */
function bendAmount(semitones: number): string {
  return semitones === 1 ? '½' : semitones === 2 ? 'full' : semitones + ' st';
}

/** Name the physical string so a chord's stationary heads remain unambiguous. */
export function describePrebend(prebend: Prebend, string: number): string {
  return 'Pre-bend ' + bendAmount(prebend.semitones) + ' on string ' + string + (prebend.release ? ', release' : '');
}

/** A vertical arrow starts at the attack; a following downstroke returns to its fret. */
export function makePrebend({ semitones, release }: Prebend): Bend {
  const phrase = [{ type: Bend.PREBEND, text: bendAmount(semitones) }];
  if (release) phrase.push({ type: Bend.DOWN, text: '' });
  return new Bend(phrase);
}

/** VexTab tunings give written open strings. A guitar sounds one octave below its staff. */
export function soundingGuitarPitch(tuning: Tuning, fret: number, string: number): string {
  const [name, octave] = tuning.getNoteForFret(fret, string).split('/');
  return name.toLowerCase() + '/' + (Number(octave) - 1);
}

/** Spell a physical fret from the signature, independently of prior voices or bars. */
export function spellFret(tuning: Tuning, manager: KeyManager, music: Music, fret: string, string: number):
  [string, number, string] {
  const pitch = VexFlow.keyProperties(tuning.getNoteForFret(fret, string));
  manager.reset();
  const selected = manager.selectNote(pitch.key);
  const original = music.getNoteParts(pitch.key).root;
  const written = music.getNoteParts(selected.note).root;
  let octave = pitch.octave;
  if (written === 'b' && original === 'c') octave--;
  if (written === 'c' && original === 'b') octave++;
  return [selected.note, octave, selected.accidental ?? 'n'];
}

/** Number of ordinary written values occupied by an n-tuplet in this meter. */
export function tupletOccupancy(n: number, meter: string): number {
  const [beats, unit] = meter.split('/').map(Number);
  if (unit >= 8 && beats >= 6 && beats % 3 === 0 && (n === 2 || n === 4)) return 3;
  return Math.max(2, 2 ** Math.floor(Math.log2(n - 1)));
}
