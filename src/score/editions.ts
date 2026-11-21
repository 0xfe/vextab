// Resolve authored print settings against an edition target and explicit caller overrides.
import type { PublicationOptions } from 'vexflow';
import type { Edition, ScoreV2 } from './grammar2/model';

/** All dimensions are millimeters. Explicit arrays replace the corresponding authored list. */
export type EditionOptions = Omit<PublicationOptions, 'staves'> & { compressRests?: boolean };

/** Scalar values inherit, margins merge per side, and authored measure directives accumulate. */
export function editionSettings(document: ScoreV2, target: number | 'conductor', overrides: EditionOptions) {
  const applicable = (document.editions ?? []).filter(e => !e.conductor && !e.part);
  const specific = document.editions?.find(e => target === 'conductor' ? e.conductor : e.part && e.part === document.parts[target].id);
  if (specific) applicable.push(specific);
  const settings: EditionOptions = {};
  const anchors: Edition['anchors'] = [];
  for (const edition of applicable) {
    Object.assign(settings, edition.settings);
    anchors.push(...edition.anchors);
  }
  for (const field of ['systemBreaks', 'pageBreaks', 'preferredTurns', 'forbiddenTurns'] as const) {
    settings[field] = anchors.filter(a => a.field === field).map(a => a.measure);
  }
  const margins = { ...settings.margins, ...overrides.margins };
  return { settings: { ...settings, ...overrides, margins }, cues: specific?.cues ?? [], anchors,
    range: (specific ?? applicable[0])?.range };
}
