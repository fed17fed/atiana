/**
 * Booking rules in one place (pure functions, no database).
 * Demo rules decided by the owner on 2026-11-09:
 *  - cancel 24 hours or more before the start: the credit is returned
 *  - cancel less than 24 hours before the start: no return
 */
import type { OfferingType } from "./generated/prisma/enums";

/** The ONE place for the cancellation deadline (hours before the class starts). */
export const CANCELLATION_HOURS = 24;

/** Paid events: money back when the client cancels this many days (or more) before the start. Owner rule 2026-11-09. */
export const EVENT_REFUND_DAYS = 7;

/** Stripe cannot charge less than EUR 0.50. Donations above 0 but below this cannot go through Stripe. */
export const MIN_CARD_PAYMENT_CENTS = 50;
/** Safety limit for one donation (demo value, open question for the owner). */
export const MAX_DONATION_CENTS = 100_000;
/** Smallest stand-alone donation on /donate (owner decision 2026-11-11: EUR 1). Event donations use MIN_CARD_PAYMENT_CENTS. */
export const MIN_DONATION_CENTS = 100;

/** Demo value (open question for the owner): a credit given for an early cancel of a card-paid booking is valid this long. */
export const CANCEL_CREDIT_VALID_DAYS = 70;

/** How long an unpaid seat is kept while the visitor pays (also the Stripe Checkout lifetime). */
export const HOLD_MINUTES = 30;
/** Extra minutes before a hold stops counting, so a payment that finishes at the last second still has its seat. */
export const HOLD_GRACE_MINUTES = 5;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Last moment a cancellation still returns the credit. */
export function refundDeadline(startsAt: Date, hours = CANCELLATION_HOURS): Date {
  return new Date(startsAt.getTime() - hours * HOUR_MS);
}

/** True when `now` is at or before the deadline (exactly 24 h before still counts). */
export function isRefundable(startsAt: Date, now: Date, hours = CANCELLATION_HOURS): boolean {
  return now.getTime() <= refundDeadline(startsAt, hours).getTime();
}

/** Last moment a cancellation of a paid event still gives the money back. */
export function eventRefundDeadline(startsAt: Date, days = EVENT_REFUND_DAYS): Date {
  return new Date(startsAt.getTime() - days * 24 * HOUR_MS);
}

/** 7 days or more before the start (exactly 7 days counts). */
export function isEventRefundable(startsAt: Date, now: Date, days = EVENT_REFUND_DAYS): boolean {
  return now.getTime() <= eventRefundDeadline(startsAt, days).getTime();
}

/** Euros typed by the client ("10", "10.5", "0") -> cents. Returns null when it is not a valid amount of 0 or more. */
export function parseEuroToCents(input: string): number | null {
  const t = input.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number.parseFloat(t) * 100);
}

/** A class that already started (or ended) cannot be cancelled online. */
export function canCancel(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() > now.getTime();
}

/** Holds created before this moment no longer count and may be released. */
export function holdCutoff(now: Date): Date {
  return new Date(now.getTime() - (HOLD_MINUTES + HOLD_GRACE_MINUTES) * MINUTE_MS);
}

export function spotsLeft(capacity: number, activeBookings: number): number {
  return Math.max(0, capacity - activeBookings);
}

/** Ticket text used on the schedule. */
export function spotsLabel(n: number): string {
  if (n <= 0) return "Full";
  if (n === 1) return "Only 1 spot left";
  if (n <= 3) return `Only ${n} spots left`;
  return `${n} spots left`;
}

export type CreditLike = {
  id: string;
  creditsLeft: number;
  expiresAt: Date | null;
  appliesTo: OfferingType[];
};

/** A credit can be used when it has credits left, is not expired and fits the offering type. */
export function isUsableCredit(g: CreditLike, type: OfferingType, now: Date): boolean {
  if (g.creditsLeft <= 0) return false;
  if (g.expiresAt && g.expiresAt.getTime() <= now.getTime()) return false;
  return g.appliesTo.includes(type);
}

/** Picks the credit that expires first (credits without expiry go last). */
export function pickCreditGrant<T extends CreditLike>(grants: T[], type: OfferingType, now: Date): T | null {
  const usable = grants.filter((g) => isUsableCredit(g, type, now));
  if (usable.length === 0) return null;
  usable.sort((a, b) => {
    const ax = a.expiresAt ? a.expiresAt.getTime() : Number.POSITIVE_INFINITY;
    const bx = b.expiresAt ? b.expiresAt.getTime() : Number.POSITIVE_INFINITY;
    return ax - bx;
  });
  return usable[0];
}

export function creditExpiry(now: Date, validDays: number): Date {
  return new Date(now.getTime() + validDays * 24 * HOUR_MS);
}

/** Database keys that make double booking impossible (see Booking.userKey / slotKey in schema.prisma). */
export function bookingKeys(input: { sessionId: string; userId: string; capacity: number }) {
  return {
    userKey: `${input.sessionId}:${input.userId}`,
    slotKey: input.capacity === 1 ? input.sessionId : null,
  };
}

/** Cancellation sentence for the UI, built from the single constant. */
export function cancellationRuleText(): string {
  return `Cancel up to ${CANCELLATION_HOURS} hours before the class starts and your credit comes back.`;
}
