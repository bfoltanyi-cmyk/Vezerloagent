/**
 * UTC calendar helpers for privacy deadlines and retention.
 * Month arithmetic clamps to the last day of the target month
 * (e.g. 31 Jan + 1 month = 28/29 Feb), in line with Regulation 1182/71.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  if (!Number.isInteger(months)) throw new Error('months must be an integer');
  const day = date.getUTCDate();
  const target = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function addDaysUtc(date: Date, days: number): Date {
  if (!Number.isInteger(days)) throw new Error('days must be an integer');
  return new Date(date.getTime() + days * 86_400_000);
}

/** Last day (00:00 UTC) of the fiscal year containing `date`. `fiscalYearEndMonth` is 1-12. */
export function fiscalYearEndUtc(date: Date, fiscalYearEndMonth: number): Date {
  if (!Number.isInteger(fiscalYearEndMonth) || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) {
    throw new Error('fiscalYearEndMonth must be 1-12');
  }
  const month = date.getUTCMonth() + 1;
  const endYear = month <= fiscalYearEndMonth ? date.getUTCFullYear() : date.getUTCFullYear() + 1;
  // Day 0 of the following month = last day of the fiscal-year-end month.
  return new Date(Date.UTC(endYear, fiscalYearEndMonth, 0));
}
