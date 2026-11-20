// Preserve written piano accidentals when VexFlow recomposes a printed page or cue.
import { Accidental, type PublicationOptions } from 'vexflow';
import type { Attack } from './model';

/** Publication rebuilds EasyScore note strings on every pass and calls their note hooks. */
export class PrintedPianoAccidentals {
  private readonly events = new Map<string, Attack>();

  /** Keep typed descriptions for ordinary events. Only marked piano attacks need a builder hook. */
  note(id: string, event: Attack): string | undefined {
    if (!event.heads.some(head => head.accidental)) return;
    this.events.set(id, event);
    const pitches = event.heads.map(head => head.written.replace('/', ''));
    const chord = pitches.length === 1 ? pitches[0] : '(' + pitches.join(' ') + ')';
    const type = event.slash ? '/s' : '';
    return chord + '/' + event.base + type + '.'.repeat(event.dots) + '[id="' + id + '"]';
  }

  /** Native key-aware formatting retains explicit modifiers and supplies any remaining implicit signs. */
  hook: NonNullable<PublicationOptions['noteHooks']>[number] = (options, note) => {
    this.events.get(options.id)?.heads.forEach((head, index) => {
      if (!head.accidental) return;
      const mark = new Accidental(head.accidental);
      if (head.cautionary) mark.setAsCautionary();
      note.addModifier(mark, index);
    });
  };
}
