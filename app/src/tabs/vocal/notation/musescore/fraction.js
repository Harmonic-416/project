/**
 * Exact rational arithmetic for score time. MuseScore positions are
 * fractions of a whole note ("3/4", "-1/8"), and tuplets make thirds,
 * fifths and sevenths, so floats would drift; these stay exact.
 */

function gcd(a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1
}

export function lcm(a, b) {
  return (a / gcd(a, b)) * b
}

export class Fraction {
  constructor(num = 0, den = 1) {
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) throw new Error(`Bad fraction ${num}/${den}`)
    if (den < 0) {
      num = -num
      den = -den
    }
    const g = gcd(num, den)
    this.num = num / g
    this.den = den / g
  }

  /** "3/4", "-1/8", "2" or a missing value (→ fallback). */
  static parse(text, fallback = ZERO) {
    if (text == null) return fallback
    const match = String(text).trim().match(/^(-?\d+)(?:\/(-?\d+))?$/)
    if (!match) return fallback
    const den = match[2] === undefined ? 1 : Number(match[2])
    return den === 0 ? fallback : new Fraction(Number(match[1]), den)
  }

  add(other) {
    return new Fraction(this.num * other.den + other.num * this.den, this.den * other.den)
  }

  sub(other) {
    return new Fraction(this.num * other.den - other.num * this.den, this.den * other.den)
  }

  mul(other) {
    return new Fraction(this.num * other.num, this.den * other.den)
  }

  compare(other) {
    return this.num * other.den - other.num * this.den
  }

  equals(other) {
    return this.num === other.num && this.den === other.den
  }

  isZero() {
    return this.num === 0
  }

  valueOf() {
    return this.num / this.den
  }

  toString() {
    return this.den === 1 ? `${this.num}` : `${this.num}/${this.den}`
  }
}

export const ZERO = new Fraction(0, 1)
