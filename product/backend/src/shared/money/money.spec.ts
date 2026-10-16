import { divideRoundHalfUp, Money, roundHufCash } from './money';

describe('Money', () => {
  it('adds and subtracts in minor units without float error', () => {
    const a = Money.ofMinor(10n, 'EUR'); // 0.10
    const b = Money.ofMinor(20n, 'EUR'); // 0.20
    expect(a.add(b).minor).toBe(30n);
    expect(b.subtract(a).minor).toBe(10n);
  });

  it('rejects currency mismatch', () => {
    expect(() => Money.ofMinor(1n, 'HUF').add(Money.ofMinor(1n, 'EUR'))).toThrow('Currency mismatch');
  });

  it('computes 27% VAT with half-up rounding', () => {
    // 1 234,57 HUF net => 333,3339 => 333,33
    expect(Money.ofMinor(123457n, 'HUF').multiplyRational(27n, 100n).minor).toBe(33333n);
    // 0,50 * 27% = 0,135 => 0,14 (half up)
    expect(Money.ofMinor(50n, 'EUR').multiplyRational(27n, 100n).minor).toBe(14n);
  });

  it('rounds negative amounts symmetrically (storno lines)', () => {
    expect(Money.ofMinor(-50n, 'EUR').multiplyRational(27n, 100n).minor).toBe(-14n);
  });
});

describe('divideRoundHalfUp', () => {
  it.each([
    [5n, 2n, 3n],
    [4n, 2n, 2n],
    [-5n, 2n, -3n],
    [7n, 3n, 2n],
  ])('%s / %s = %s', (a, b, expected) => {
    expect(divideRoundHalfUp(a, b)).toBe(expected);
  });

  it('throws on division by zero', () => {
    expect(() => divideRoundHalfUp(1n, 0n)).toThrow('Division by zero');
  });
});

describe('roundHufCash', () => {
  it.each([
    [101n, 100n],
    [102n, 100n],
    [103n, 105n],
    [104n, 105n],
    [106n, 105n],
    [107n, 105n],
    [108n, 110n],
    [109n, 110n],
  ])('%s Ft => %s Ft', (forint, expected) => {
    expect(roundHufCash(Money.ofMinor(forint * 100n, 'HUF')).minor).toBe(expected * 100n);
  });

  it('rejects non-HUF', () => {
    expect(() => roundHufCash(Money.ofMinor(100n, 'EUR'))).toThrow();
  });
});
