// Musical rules shared by the fixed Artist and the source-based score compiler.
import { KeyManager, Music, Tuning, VexFlow } from 'vexflow';

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
