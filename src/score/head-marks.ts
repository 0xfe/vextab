// Attach native fingering and accent modifiers to screen and publication notes.
import { Accidental, Articulation, FretHandFinger, Modifier, StringNumber, type ModifierPosition, type Note, type PublicationOptions } from 'vexflow';
import type { Attack, Head } from './model';
import type { HeadMark } from './shorthand';

const positions = { left: Modifier.Position.LEFT, right: Modifier.Position.RIGHT,
  above: Modifier.Position.ABOVE, below: Modifier.Position.BELOW };

/** Keep side clearance identical for finger and string numbers in both annotation spellings. */
export function fingerNumber(label: string, position: ModifierPosition, stringNumber = false) {
  const modifier = stringNumber ? new StringNumber(label) : new FretHandFinger(label);
  modifier.setPosition(position);
  if (position === Modifier.Position.LEFT) modifier.setOffsetX(-4);
  if (position === Modifier.Position.RIGHT) modifier.setOffsetX(4);
  return modifier;
}

/** Fingering numbers sit on notation. Accents mark both notation and tablature. */
export function attachHeadMarks(note: Note, index: number, marks: HeadMark[], tab: boolean): void {
  for (const mark of marks) {
    const pos = positions[mark.position];
    if (mark.finger !== undefined) {
      if (tab) continue;
      note.addModifier(fingerNumber(mark.finger, pos), index);
    } else {
      note.addModifier(new Articulation('a>').setPosition(pos), index);
    }
  }
}

/** Publication runs native note hooks for EasyScore strings. Typed tab notes and special
 * guitar heads need their original descriptors to preserve instrument metadata and glyphs. */
export class PrintedHeadMarks {
  private readonly heads = new Map<string, Head[]>();

  constructor(private readonly piano: boolean) {}

  /** Encode one ordinary pitched attack, preserving its head order, rhythm and source ID. */
  note(event: Attack, id: string): string | undefined {
    const writtenSign = this.piano && event.heads.some(head => head.accidental);
    const marked = event.heads.some(head => head.marks?.length);
    if (!writtenSign && !marked) return;
    if (!this.piano && (event.slash || !event.heads.every(head =>
      !head.position && !head.drum && head.sounding && /^[a-g](bb|b|##|#|n)?\/\d+$/i.test(head.written)))) return;
    const pitches = event.heads.map(head => head.written.replace('/', ''));
    const chord = pitches.length === 1 ? pitches[0] : '(' + pitches.join(' ') + ')';
    this.heads.set(id, event.heads);
    return chord + '/' + event.base + (event.slash ? '/s' : '') + '.'.repeat(event.dots) + '[id="' + id + '"]';
  }

  /** Check that this event can carry its written modifiers through pagination. */
  has(id: string): boolean { return this.heads.has(id); }

  /** Publication can compose the same note more than once. Attach fresh native modifiers each time. */
  readonly hook: NonNullable<PublicationOptions['noteHooks']>[number] = (options, note) => {
    this.heads.get(options.id)?.forEach((head, index) => {
      if (this.piano && head.accidental) {
        const accidental = new Accidental(head.accidental);
        if (head.cautionary) accidental.setAsCautionary();
        note.addModifier(accidental, index);
      }
      if (head.marks) attachHeadMarks(note, index, head.marks, false);
    });
  };
}
