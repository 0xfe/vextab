// Transform written timelines in seconds into one expressive ensemble take. No DOM or audio backend.
import { isPerformerName, performerProfiles, type PerformerName, type PerformerProfile, type SwingSetting } from './profiles.mts';
import type { Performance, PlaybackEvent, PlaybackNote } from './transport';

export { isPerformerName, performerProfiles, type PerformerName, type PerformerProfile, type SwingSetting };
export type { Performance, PlaybackEvent, PlaybackNote } from './transport';

/** One performed measure, in seconds. Supply each repeat visit and local tempo in order. */
export interface PerformanceBar {
  duration: number;
  quarter: number;
  /** For varying tempos, beat ends and full beats' written eighth positions, in seconds from bar start. */
  beats?: readonly { end: number; eighth?: number }[];
  /** Quarter length at the end of a tempo-changing bar, for any unmetered tail. */
  endingQuarter?: number;
  /** Seconds already elapsed in the first quarter beat of a pickup. */
  beatOffset?: number;
  /** False for meters whose written eighths should stay even. */
  swingable?: boolean;
  /** A phrase-level cadence or the end of a slur near the barline. */
  phraseEnd?: boolean;
  /** Written release positions of fermatas, in seconds from the beginning of the bar. */
  fermatas?: readonly number[];
}

/** A beat carries one common clock and loudness contour for the ensemble. */
interface Beat {
  start: number;
  end: number;
  played: number;
  length: number;
  velocity: number;
  swing: number;
  fullBeat: boolean;
  /** Fraction of elapsed beat time at its written eighth subdivision. */
  middle: number;
}

/** Counter-based noise makes a take independent of part traversal and chord size. */
function noise(seed: number, index: number): number {
  let state = seed ^ Math.imul(index + 1, 0x9e3779b1);
  let sum = 0;
  // The sum of four uniforms is bounded and concentrates small deviations around zero.
  for (let i = 0; i < 4; i++) {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ state >>> 15, 1 | state);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    sum += ((x ^ x >>> 14) >>> 0) / 0x100000000;
  }
  return (sum - 2) / 2;
}

/** Fill unmetered material with four-quarter phrases at the caller's reference tempo. */
function barGrid(input: readonly PerformanceBar[], end: number, tempo: number): PerformanceBar[] {
  if (!Number.isFinite(tempo) || tempo <= 0 || !Number.isFinite(end) || end < 0) throw new RangeError('Invalid playback time or tempo');
  const bars = [...input];
  let time = 0, beatCount = 0;
  for (const bar of bars) {
    if (!(bar.duration > 0 && Number.isFinite(bar.duration) && bar.quarter > 0 && Number.isFinite(bar.quarter)) ||
        !((bar.beatOffset ?? 0) >= 0 && (bar.beatOffset ?? 0) < bar.quarter)) throw new RangeError('Invalid performance bar');
    time += bar.duration;
    if (bar.endingQuarter !== undefined && !(bar.endingQuarter > 0 && Number.isFinite(bar.endingQuarter)))
      throw new RangeError('Invalid final quarter duration');
    if (bar.beats) {
      let start = 0;
      for (const beat of bar.beats) {
        if (!(beat.end > start && Number.isFinite(beat.end)) ||
            (beat.eighth !== undefined && !(beat.eighth > start && beat.eighth < beat.end)))
          throw new RangeError('Invalid written beat grid');
        start = beat.end;
      }
      if (!bar.beats.length || Math.abs(start - bar.duration) > 1e-9) throw new RangeError('Incomplete written beat grid');
      beatCount += bar.beats.length;
    } else beatCount += Math.ceil((bar.duration + (bar.beatOffset ?? 0)) / bar.quarter);
  }
  const finalBar = bars[bars.length - 1];
  const quarter = finalBar?.endingQuarter ?? finalBar?.quarter ?? 60 / tempo;
  // Reject impractically fine public grids before allocating beats or losing clock precision.
  if (beatCount + Math.ceil(Math.max(0, end - time) / quarter) > 1_000_000)
    throw new RangeError('Performance exceeds one million beats');
  while (time < end - 1e-9) {
    const duration = Math.min(4 * quarter, end - time);
    if (time + duration <= time) throw new RangeError('Beat is below clock precision');
    bars.push({ quarter, duration });
    time += duration;
  }
  return bars;
}

/** Conduct a phrase of up to four bars, relaxing at its ends and leaning into its middle. */
function conduct(bars: PerformanceBar[], profile: PerformerProfile, seed: number, literal: boolean): Beat[] {
  const beats: Beat[] = [];
  let time = 0, played = 0, drift = 0;
  for (let first = 0; first < bars.length;) {
    let last = first;
    while (last + 1 < bars.length && last - first < 3 && !bars[last].phraseEnd) last++;
    const phraseStart = time;
    const span = bars.slice(first, last + 1).reduce((total, bar) => total + bar.duration, 0);
    for (let i = first; i <= last; i++) {
      const bar = bars[i], barEnd = time + bar.duration;
      const barStart = time;
      let beatIndex = 0;
      let remaining = bar.quarter - (bar.beatOffset ?? 0);
      while (time < barEnd - 1e-9) {
        const written = bar.beats?.[beatIndex++];
        const end = written ? barStart + written.end : Math.min(time + remaining, barEnd);
        const width = end - time;
        if (width <= 0) throw new RangeError('Beat is below clock precision');
        const phase = (time + width / 2 - phraseStart) / span;
        const arch = -Math.cos(2 * Math.PI * phase);
        drift = .55 * drift + .45 * noise(seed, beats.length);
        const held = !literal && bar.fermatas?.some(at => at > time - barStart + 1e-9 && at <= end - barStart + 1e-9);
        const length = width * (1 - profile.rubato * arch + profile.drift * drift + (held ? .35 : 0));
        // At brisk tempos straight eighths converge. Partial beats and compound meters stay literal.
        const fullBeat = bar.swingable !== false &&
          (written ? written.eighth !== undefined : Math.abs(width / bar.quarter - 1) < 1e-6);
        const middle = written?.eighth === undefined ? .5 : (written.eighth - (time - barStart)) / width;
        const bpm = 60 / (written ? width : bar.quarter);
        const swing = fullBeat ? profile.swing * Math.max(0, Math.min(.22, .25 - (bpm - 60) / 750)) : 0;
        beats.push({ start: time, end, played, length, velocity: arch * profile.swell, swing, fullBeat, middle });
        time = end;
        played += length;
        remaining = bar.quarter;
      }
      time = barEnd;
    }
    first = last + 1;
  }
  return beats;
}

/** Locate onsets, releases and bend points on the same monotonically increasing clock. */
function beatAt(beats: Beat[], time: number): number {
  let low = 0, high = beats.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (time >= beats[mid].end - 1e-9) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Swing binary subdivisions only. An interior triplet, grace, or sixteenth protects its beat. */
function straightBeats(events: PlaybackEvent[], beats: Beat[]): Set<number> {
  const straight = new Set<number>();
  for (const event of events) {
    for (const time of [event.time, event.time + event.duration]) {
      const i = beatAt(beats, time), beat = beats[i];
      const phase = (time - beat.start) / (beat.end - beat.start);
      if (phase > 1e-6 && phase < 1 - 1e-6 && Math.abs(phase - beat.middle) > 1e-6) straight.add(i);
    }
  }
  return straight;
}

/** Build the written-to-played time map for a part. Chords, callbacks, releases and bends share it. */
function partClock(part: Performance, index: number, beats: Beat[], profile: PerformerProfile) {
  const last = beats[beats.length - 1];
  const straight = profile.swing || profile.pocket ? straightBeats(part.events, beats) : new Set<number>();
  /** Limit pocket at a tempo change or short pickup by the shorter neighboring beat. */
  function displacement(i: number): number {
    if (index || !i || i === beats.length || !beats[i].fullBeat || !beats[i - 1].fullBeat || straight.has(i) || straight.has(i - 1)) return 0;
    return profile.pocket * Math.min(beats[i].length, beats[i - 1].length);
  }
  function clock(time: number): number {
    if (time >= last.end) return last.played + last.length + (time - last.end);
    const i = beatAt(beats, time), beat = beats[i];
    const phase = Math.max(0, (time - beat.start) / (beat.end - beat.start));
    const start = beat.played + displacement(i);
    const middle = beat.played + beat.length * (beat.middle + (straight.has(i) ? 0 : 2 * (1 - beat.middle) * beat.swing));
    const end = beat.played + beat.length + displacement(i + 1);
    return phase < beat.middle ? start + phase / beat.middle * (middle - start) :
      middle + (phase - beat.middle) / (1 - beat.middle) * (end - middle);
  }
  return clock;
}

/** Voice the outer notes, lighten the inner notes, and let the fingers land and lift independently. */
function voiceChord(notes: PlaybackNote[], duration: number, spread: number, seed: number): void {
  // Existing finger timings belong to the caller. Single notes keep their own phrasing.
  if (notes.length < 2 || !spread || notes.some(note => note.onsetOffset)) return;
  const low = Math.min(...notes.map(note => note.pitch)), high = Math.max(...notes.map(note => note.pitch));
  const direction = noise(seed, 0);
  const fingers = notes.map((note, index) => {
    const register = (note.pitch - low) / Math.max(1, high - low);
    const finger = seed ^ Math.imul(note.pitch + 1, 617) ^ index;
    // A gentle tendency across the hand changes with each chord. Either outer voice can arrive first.
    return { note, finger, landing: direction * register + noise(finger, 1) };
  }).sort((a, b) => a.landing - b.landing);
  const shortest = Math.min(duration, ...notes.map(note => note.duration));
  if (shortest <= 0) return;
  const width = Math.min(shortest * .12, spread * (.78 + .22 * noise(seed, 2)));
  const strength = Math.min(1, spread / .013);
  fingers.forEach(({ note, finger }, i) => {
    const rank = i / (fingers.length - 1);
    const stagger = i > 0 && i < fingers.length - 1 ? .32 * noise(finger, 3) / (fingers.length - 1) : 0;
    const delay = width * (rank + stagger);
    const outer = note.pitch === high ? .042 : note.pitch === low ? -.012 : -.085;
    const balance = 1 + strength * (outer + .052 * noise(finger, 4));
    note.velocity = Math.max(1, Math.min(127, Math.round(note.velocity * balance)));
    if (delay) note.onsetOffset = delay;
    // A tied, pedalled or bending head still reaches its written endpoint on the common clock.
    let lift = 0;
    if (!note.holdRelease && !note.bend && note.duration <= duration + 1e-9) {
      const length = Math.min(spread * 1.8, note.duration * .09);
      lift = length * Math.max(0, .56 + .40 * noise(finger, 5) - (note.pitch === high ? .23 : 0));
    }
    note.duration -= delay + lift;
    if (delay && note.bend) note.bend = note.bend.map(point => ({ ...point, time: Math.max(0, point.time - delay) }));
  });
}

/** Share the pulse across the part, then shape the notes inside each written chord. */
function playPart(part: Performance, index: number, beats: Beat[], profile: PerformerProfile, take: number): Performance {
  const clock = partClock(part, index, beats, profile);
  const events = part.events.map((event, eventIndex) => {
    const time = clock(event.time);
    const duration = clock(event.time + event.duration) - time;
    const beat = beats[beatAt(beats, event.time)];
    const touch = profile.touch * noise(take ^ (index + 1), Math.round(event.time * 100000));
    const phase = (event.time - beat.start) / (beat.end - beat.start);
    const accent = beat.fullBeat ? profile.beatAccent * Math.cos(2 * Math.PI * phase) : 0;
    const gain = 1 + (beat.velocity + touch + accent) / 100;
    const notes = event.notes.map(note => {
      const written = event.time + (note.onsetOffset ?? 0), attack = clock(written);
      const after = (seconds: number) => clock(written + seconds) - attack;
      return { ...note, duration: after(note.duration),
        ...(note.onsetOffset && { onsetOffset: attack - time }),
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity * gain))),
        ...(note.bend && { bend: note.bend.map(point => ({ ...point, time: after(point.time) })) }),
      };
    });
    voiceChord(notes, duration, profile.chordSpread ?? 0, take ^ Math.imul(index + 1, 65537) ^ Math.imul(eventIndex + 1, 16777619));
    return { ...event, time, duration, notes };
  });
  return { events, duration: clock(part.duration) };
}

/** Validate custom coefficients so that both halves of every beat remain positive. */
function resolveProfile(value: PerformerName | PerformerProfile): PerformerProfile {
  if (typeof value === 'string') {
    if (!isPerformerName(value)) throw new RangeError('Unknown performer: ' + value);
    return performerProfiles[value];
  }
  const limits: Record<keyof PerformerProfile, [number, number]> = {
    rubato: [0, .4], drift: [0, .25], swell: [0, 32], touch: [0, 32],
    swing: [0, 1], beatAccent: [-32, 32], pocket: [-.15, .15], grace: [.05, .4], chordSpread: [0, .03],
  };
  for (const key of Object.keys(limits) as (keyof PerformerProfile)[]) {
    const n = key === 'chordSpread' && value[key] === undefined ? 0 : value[key], [min, max] = limits[key];
    if (!Number.isFinite(n) || n < min || n > max) throw new RangeError('Invalid performer ' + key);
  }
  return { ...value };
}

/** One seed per play. Pass the same integer to reproduce a take, including grace borrowing. */
export function createPerformer(value: PerformerName | PerformerProfile = 'human', seed?: number, swing?: SwingSetting) {
  const preset = resolveProfile(value);
  const profile = swing === 'off' ? { ...preset, swing: 0, pocket: 0 }
    : swing === 'eighths' ? { ...preset, swing: preset.swing || 1 } : preset;
  const literal = value === 'robot' || value === performerProfiles.robot;
  if (seed !== undefined && !Number.isSafeInteger(seed)) throw new RangeError('Expected an integer performer seed');
  const take = seed ?? (literal ? 0 : Math.floor(Math.random() * 0x100000000));
  return {
    literal,
    needsBeatGrid: !literal || !!profile.swing,
    /** Written graces steal from their principal, with a lightly varied share per onset. */
    graceFraction(time: number, duration: number, count: number, slashed = false): number {
      if (literal) return .25;
      const budget = (slashed ? .065 : .105) * Math.sqrt(count);
      const fraction = Math.min(profile.grace, budget / duration);
      return fraction * (1 + .24 * noise(take, Math.round(time * 100000)));
    },
    /** Part zero is the lead. Its pocket meets the ensemble at each swung offbeat. */
    perform(parts: Performance[], bars: readonly PerformanceBar[] = [], tempo = 120): Performance[] {
      if ((literal && !profile.swing) || !parts.length) return parts;
      const end = Math.max(...parts.map(part => part.duration));
      const beats = conduct(barGrid(bars, end, tempo), profile, take, literal);
      if (!beats.length) return parts;
      return parts.map((part, i) => playPart(part, i, beats, profile, take));
    },
  };
}
