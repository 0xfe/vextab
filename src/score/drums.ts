// The fixed and responsive renderers share VexFlow’s unpitched drum identities and staff positions.
import { PercussionMap } from 'vexflow/core';

/** The standard kit describes both the noteheads and their readable instrument names. */
export const drumKit = new PercussionMap();

/** A kit hit has one or more different instruments, on a notation-only percussion stave. */
export function drumError(clef: string, hasTab: boolean, ids: string[], slash: boolean): string | undefined {
  if (clef !== 'percussion' || hasTab) return 'Use stave clef=percussion for drum hits';
  if (new Set(ids).size !== ids.length) return 'A drum hit can contain each instrument only once';
  if (slash) return 'Use an ordinary duration for drum hits';
}
