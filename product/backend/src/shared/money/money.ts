/**
 * Money value object. Amounts are stored as integer minor units (fillér, grosz, haléř)
 * in a bigint. Floating point is never used for money (see docs/dev/architecture.md §4).
 */
export type CurrencyCode = 'HUF' | 'EUR' | 'USD' | 'PLN' | 'CZK';

export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: CurrencyCode,
  ) {}

  static ofMinor(minor: bigint, currency: CurrencyCode): Money {
    return new Money(minor, currency);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  /**
   * Multiplies by a rational factor (numerator / denominator) and rounds half away from zero.
   * Used for VAT: e.g. 27% => multiplyRational(27n, 100n).
   */
  multiplyRational(numerator: bigint, denominator: bigint): Money {
    return new Money(divideRoundHalfUp(this.minor * numerator, denominator), this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

/** Integer division rounding half away from zero (commercial rounding). */
export function divideRoundHalfUp(dividend: bigint, divisor: bigint): bigint {
  if (divisor === 0n) {
    throw new Error('Division by zero');
  }
  const negative = dividend < 0n !== divisor < 0n;
  const a = dividend < 0n ? -dividend : dividend;
  const b = divisor < 0n ? -divisor : divisor;
  const q = (a * 2n + b) / (b * 2n);
  return negative ? -q : q;
}

/**
 * Hungarian cash rounding to the nearest 5 HUF (minor unit = fillér, 1 HUF = 100).
 * Endings 1-2 round down to 0, 3-4 up to 5, 6-7 down to 5, 8-9 up to 10.
 * Legal rule must be confirmed by legal (PRD SZ-6 ⚠).
 */
export function roundHufCash(amount: Money): Money {
  if (amount.currency !== 'HUF') {
    throw new Error('Cash rounding to 5 HUF applies only to HUF');
  }
  const forints = divideRoundHalfUp(amount.minor, 100n);
  const rounded = divideRoundHalfUp(forints, 5n) * 5n;
  return Money.ofMinor(rounded * 100n, 'HUF');
}
