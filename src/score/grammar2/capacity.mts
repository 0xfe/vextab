// Fixed compiler budgets selected by the host for each source revision.
export type ScoreCapacity = 'default' | 'large';

/** Keep every existing caller on the original measured-score profile. */
export const limits = Object.freeze({
  bytes: 65536, tokens: 8192, depth: 24, repetitions: 32,
  events: 4096, heads: 16, steps: 32768, fraction: 2147483647,
});

/** Large works get more space and work. Local expression limits apply to every profile. */
const largeLimits = Object.freeze({
  ...limits, bytes: 1048576, tokens: 131072, events: 32768, steps: 524288,
});

export function capacityLimits(profile: ScoreCapacity = 'default') {
  if (profile === 'default') return limits;
  if (profile === 'large') return largeLimits;
  throw new RangeError('Expected score capacity default or large');
}
