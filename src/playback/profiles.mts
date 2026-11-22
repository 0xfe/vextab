// Expressive playback presets, shared with the score reader without importing a synthesizer.

/** Timing and dynamic controls for each expressive take. */
export interface PerformerProfile {
  /** Peak proportional change in beat length across a phrase. */
  rubato: number;
  /** Peak correlated change in beat length between takes. */
  drift: number;
  /** Strength of the phrase's dynamic arch and the player's attack variation. */
  swell: number;
  touch: number;
  /** Amount of tempo-dependent eighth-note swing, from straight (0) to full (1). */
  swing: number;
  /** Positive emphasizes the beat, negative the offbeat, as a percentage of written velocity. */
  beatAccent: number;
  /** Lead part's downbeat displacement as a signed fraction of a beat. */
  pocket: number;
  /** Fraction of the principal note available to an unmeasured grace group. */
  grace: number;
  /** Maximum separation of a chord’s first and last fingers, in seconds. Zero selects a block attack. */
  chordSpread?: number;
}

/** Starting points for listening and customization. All share the same transformation. */
export const performerProfiles = {
  human: { chordSpread: .008, rubato: .006, drift: .004, swell: 1, touch: 2, swing: 0, beatAccent: .5, pocket: 0, grace: .21 },
  bach: { chordSpread: .007, rubato: .021, drift: .014, swell: 3, touch: 3, swing: 0, beatAccent: 7, pocket: 0, grace: .14 },
  chopin: { chordSpread: .016, rubato: .105, drift: .035, swell: 9, touch: 5, swing: 0, beatAccent: 1, pocket: 0, grace: .22 },
  ragtime: { chordSpread: .008, rubato: .006, drift: .008, swell: 2, touch: 3, swing: 0, beatAccent: -3, pocket: 0, grace: .13 },
  blues: { chordSpread: .014, rubato: .024, drift: .018, swell: 4, touch: 5, swing: .9, beatAccent: -2, pocket: .055, grace: .16 },
  parker: { chordSpread: .013, rubato: .012, drift: .015, swell: 3, touch: 5, swing: 1, beatAccent: -5, pocket: .032, grace: .11 },
  robot: { chordSpread: 0, rubato: 0, drift: 0, swell: 0, touch: 0, swing: 0, beatAccent: 0, pocket: 0, grace: .25 },
} as const satisfies Record<string, PerformerProfile>;

/** Written rhythmic feel overrides the preset independently of who is playing. */
export type SwingSetting = 'eighths' | 'off';

/** Names accepted by both the score language and the player. */
export type PerformerName = keyof typeof performerProfiles;
export function isPerformerName(name: string): name is PerformerName {
  return Object.prototype.hasOwnProperty.call(performerProfiles, name);
}
