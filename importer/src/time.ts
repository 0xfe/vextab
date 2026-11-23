// Exact whole-note fractions shared by source cursors, events and the text writer.

/** Reduced fractions keep score time independent of source divisions and written note values. */
export class Time {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: number | bigint, denominator: number | bigint = 1) {
    const n = BigInt(numerator), d = BigInt(denominator);
    if (d <= 0n) throw new RangeError('A musical time denominator must be positive.');
    let a = n < 0n ? -n : n, b = d;
    while (b) [a, b] = [b, a % b];
    this.numerator = n / a;
    this.denominator = d / a;
  }

  /** Advance or retreat without converting either operand to floating point. */
  plus(other: Time) {
    return new Time(this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator);
  }
  minus(other: Time) {
    return new Time(this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator);
  }
  compare(other: Time): number {
    const delta = this.numerator * other.denominator - other.numerator * this.denominator;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
  }
}

/** All simultaneous branches begin on the same immutable moment. */
export const zero = new Time(0);
