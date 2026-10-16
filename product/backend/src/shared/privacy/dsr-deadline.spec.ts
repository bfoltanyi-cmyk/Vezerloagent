import { canExtendDsr, dsrAlertsDue, dsrDueDate, isDsrOverdue } from './dsr-deadline';

const d = (iso: string) => new Date(iso);

describe('dsrDueDate', () => {
  it('is one calendar month after receipt', () => {
    expect(dsrDueDate(d('2026-03-01T10:00:00Z'), false).toISOString()).toBe('2026-04-01T10:00:00.000Z');
  });

  it('clamps to month end', () => {
    expect(dsrDueDate(d('2026-01-31T09:00:00Z'), false).toISOString()).toBe('2026-02-28T09:00:00.000Z');
  });

  it('extension gives three months from receipt', () => {
    expect(dsrDueDate(d('2026-01-31T09:00:00Z'), true).toISOString()).toBe('2026-04-30T09:00:00.000Z');
  });
});

describe('canExtendDsr / isDsrOverdue', () => {
  const received = d('2026-01-31T09:00:00Z');

  it('allows extension only within the original month', () => {
    expect(canExtendDsr(received, d('2026-02-27T00:00:00Z'))).toBe(true);
    expect(canExtendDsr(received, d('2026-03-01T00:00:00Z'))).toBe(false);
  });

  it('detects overdue requests', () => {
    expect(isDsrOverdue(received, false, d('2026-02-28T09:00:00Z'))).toBe(true);
    expect(isDsrOverdue(received, true, d('2026-02-28T09:00:00Z'))).toBe(false);
  });
});

describe('dsrAlertsDue', () => {
  const received = d('2026-03-01T10:00:00Z'); // due 2026-04-01T10:00Z

  it('fires nothing early', () => {
    expect(dsrAlertsDue(received, false, d('2026-03-22T09:59:59Z'), [])).toEqual([]);
  });

  it('fires the 10-day alert, then the 3-day alert once', () => {
    expect(dsrAlertsDue(received, false, d('2026-03-22T10:00:00Z'), [])).toEqual([10]);
    expect(dsrAlertsDue(received, false, d('2026-03-29T10:00:00Z'), [10])).toEqual([3]);
    expect(dsrAlertsDue(received, false, d('2026-03-30T10:00:00Z'), [10, 3])).toEqual([]);
  });

  it('catches up missed alerts and stops after the due date', () => {
    expect(dsrAlertsDue(received, false, d('2026-03-30T00:00:00Z'), [])).toEqual([10, 3]);
    expect(dsrAlertsDue(received, false, d('2026-04-01T10:00:00Z'), [])).toEqual([]);
  });
});
