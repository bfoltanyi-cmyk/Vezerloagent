/**
 * Data subject request deadlines (GDPR Art. 12(3)):
 * 1 month from receipt, extendable by 2 further months (3 months from receipt).
 * Alerts to the customer's DPO contact 10 and 3 days before the due date.
 */
import { addDaysUtc, addMonthsUtc } from './date-utc';

export const DSR_BASE_MONTHS = 1;
export const DSR_EXTENSION_MONTHS = 2;
export const DSR_ALERT_DAYS_BEFORE = [10, 3] as const;

export function dsrDueDate(receivedAt: Date, extended: boolean): Date {
  return addMonthsUtc(receivedAt, DSR_BASE_MONTHS + (extended ? DSR_EXTENSION_MONTHS : 0));
}

/** Extension must be decided (and the data subject notified) within the original month. */
export function canExtendDsr(receivedAt: Date, now: Date): boolean {
  return now.getTime() < dsrDueDate(receivedAt, false).getTime();
}

export function isDsrOverdue(receivedAt: Date, extended: boolean, now: Date): boolean {
  return now.getTime() >= dsrDueDate(receivedAt, extended).getTime();
}

/** Alert thresholds (days before due) that should fire now and were not sent yet. */
export function dsrAlertsDue(
  receivedAt: Date,
  extended: boolean,
  now: Date,
  alreadySent: readonly number[],
): number[] {
  const due = dsrDueDate(receivedAt, extended);
  if (now.getTime() >= due.getTime()) return [];
  return DSR_ALERT_DAYS_BEFORE.filter(
    (days) => !alreadySent.includes(days) && now.getTime() >= addDaysUtc(due, -days).getTime(),
  );
}
