import { describe, expect, it } from "vitest";
import {
  bookingKeys,
  CANCELLATION_HOURS,
  canCancel,
  creditExpiry,
  HOLD_GRACE_MINUTES,
  HOLD_MINUTES,
  holdCutoff,
  isRefundable,
  isUsableCredit,
  pickCreditGrant,
  refundDeadline,
  spotsLabel,
  spotsLeft,
  type CreditLike,
} from "@/lib/booking-rules";

const start = new Date("2026-11-17T18:00:00Z");
const hoursBefore = (h: number) => new Date(start.getTime() - h * 3600_000);

describe("cancellation rule (single constant)", () => {
  it("the deadline is 24 hours and it lives in one constant", () => {
    expect(CANCELLATION_HOURS).toBe(24);
    expect(refundDeadline(start).toISOString()).toBe("2026-11-16T18:00:00.000Z");
  });
  it("more than 24 hours before: credit returned", () => {
    expect(isRefundable(start, hoursBefore(48))).toBe(true);
    expect(isRefundable(start, hoursBefore(24.01))).toBe(true);
  });
  it("exactly 24 hours before: credit returned (24 hours or more)", () => {
    expect(isRefundable(start, hoursBefore(24))).toBe(true);
  });
  it("less than 24 hours before: no return", () => {
    expect(isRefundable(start, hoursBefore(23.99))).toBe(false);
    expect(isRefundable(start, hoursBefore(1))).toBe(false);
  });
  it("after the start: cannot cancel, not refundable", () => {
    expect(canCancel(start, hoursBefore(0.5))).toBe(true);
    expect(canCancel(start, hoursBefore(0))).toBe(false);
    expect(canCancel(start, hoursBefore(-1))).toBe(false);
    expect(isRefundable(start, hoursBefore(-1))).toBe(false);
  });
});

describe("holds and spots", () => {
  it("hold cutoff = hold time + grace", () => {
    const now = new Date("2026-11-10T10:00:00Z");
    expect(now.getTime() - holdCutoff(now).getTime()).toBe((HOLD_MINUTES + HOLD_GRACE_MINUTES) * 60_000);
  });
  it("spots left never below zero", () => {
    expect(spotsLeft(12, 4)).toBe(8);
    expect(spotsLeft(1, 1)).toBe(0);
    expect(spotsLeft(1, 3)).toBe(0);
  });
  it("labels", () => {
    expect(spotsLabel(0)).toBe("Full");
    expect(spotsLabel(1)).toBe("Only 1 spot left");
    expect(spotsLabel(2)).toBe("Only 2 spots left");
    expect(spotsLabel(8)).toBe("8 spots left");
  });
});

describe("credits", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  const g = (over: Partial<CreditLike> & { id: string }): CreditLike => ({
    creditsLeft: 3,
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    appliesTo: ["GROUP_CLASS"],
    ...over,
  });

  it("a credit needs credits left", () => {
    expect(isUsableCredit(g({ id: "a", creditsLeft: 0 }), "GROUP_CLASS", now)).toBe(false);
  });
  it("an expired credit is not usable (expiry moment itself is expired)", () => {
    expect(isUsableCredit(g({ id: "a", expiresAt: new Date("2026-11-09T00:00:00Z") }), "GROUP_CLASS", now)).toBe(false);
    expect(isUsableCredit(g({ id: "a", expiresAt: now }), "GROUP_CLASS", now)).toBe(false);
  });
  it("a credit without expiry date is usable", () => {
    expect(isUsableCredit(g({ id: "a", expiresAt: null }), "GROUP_CLASS", now)).toBe(true);
  });
  it("group credit cannot pay a 1:1 session and the other way round", () => {
    expect(isUsableCredit(g({ id: "a" }), "ONE_TO_ONE", now)).toBe(false);
    expect(isUsableCredit(g({ id: "b", appliesTo: ["ONE_TO_ONE"] }), "GROUP_CLASS", now)).toBe(false);
    expect(isUsableCredit(g({ id: "b", appliesTo: ["ONE_TO_ONE"] }), "ONE_TO_ONE", now)).toBe(true);
  });
  it("picks the credit that expires first, no-expiry last", () => {
    const late = g({ id: "late", expiresAt: new Date("2027-03-01T00:00:00Z") });
    const soon = g({ id: "soon", expiresAt: new Date("2026-12-01T00:00:00Z") });
    const never = g({ id: "never", expiresAt: null });
    expect(pickCreditGrant([never, late, soon], "GROUP_CLASS", now)?.id).toBe("soon");
    expect(pickCreditGrant([never, late], "GROUP_CLASS", now)?.id).toBe("late");
    expect(pickCreditGrant([never], "GROUP_CLASS", now)?.id).toBe("never");
  });
  it("returns null when nothing is usable", () => {
    expect(pickCreditGrant([], "GROUP_CLASS", now)).toBeNull();
    expect(pickCreditGrant([g({ id: "x", creditsLeft: 0 })], "GROUP_CLASS", now)).toBeNull();
  });
  it("expiry date = now + valid days (5-pack: 10 weeks)", () => {
    expect(creditExpiry(new Date("2026-11-10T10:00:00Z"), 70).toISOString()).toBe("2027-01-19T10:00:00.000Z");
  });
});

describe("database keys", () => {
  it("userKey always, slotKey only for capacity-1 sessions", () => {
    expect(bookingKeys({ sessionId: "s1", userId: "u1", capacity: 12 })).toEqual({ userKey: "s1:u1", slotKey: null });
    expect(bookingKeys({ sessionId: "s1", userId: "u1", capacity: 1 })).toEqual({ userKey: "s1:u1", slotKey: "s1" });
  });
});

import { EVENT_REFUND_DAYS, eventRefundDeadline, isEventRefundable, parseEuroToCents } from "@/lib/booking-rules";

describe("event rules (7 days) and amounts", () => {
  const start = new Date("2026-12-12T10:00:00Z");
  const before = (ms: number) => new Date(start.getTime() - ms);
  const DAY = 24 * 3600_000;
  it("7 days is one constant", () => {
    expect(EVENT_REFUND_DAYS).toBe(7);
    expect(eventRefundDeadline(start).toISOString()).toBe("2026-12-05T10:00:00.000Z");
  });
  it("7 days or more: refundable (exactly 7 days counts); less: not", () => {
    expect(isEventRefundable(start, before(30 * DAY))).toBe(true);
    expect(isEventRefundable(start, before(7 * DAY))).toBe(true);
    expect(isEventRefundable(start, before(7 * DAY - 1000))).toBe(false);
    expect(isEventRefundable(start, before(1 * DAY))).toBe(false);
    expect(isEventRefundable(start, before(-DAY))).toBe(false);
  });
  it("parseEuroToCents", () => {
    expect(parseEuroToCents("0")).toBe(0);
    expect(parseEuroToCents("10")).toBe(1000);
    expect(parseEuroToCents(" 12,50 ")).toBe(1250);
    expect(parseEuroToCents("0.5")).toBe(50);
    for (const bad of ["", "-1", "abc", "1.234", "1e3", "10 €", "1000000"]) expect(parseEuroToCents(bad)).toBeNull();
  });
});

import {
  BOOKING_CLOSES_AT_START,
  cancelUpToText,
  DEFAULT_CAPACITY,
  isBookingOpen,
  isFreePrice,
  priceText,
  REMINDER_HOURS,
} from "@/lib/booking-rules";

describe("Phase 11 rules (one place)", () => {
  it("default capacity is 12 and the reminder window is 24 hours", () => {
    expect(DEFAULT_CAPACITY).toBe(12);
    expect(REMINDER_HOURS).toBe(24);
  });
  it("no late join: booking closes exactly at the start time", () => {
    expect(BOOKING_CLOSES_AT_START).toBe(true);
    expect(isBookingOpen(start, new Date(start.getTime() - 1))).toBe(true);
    expect(isBookingOpen(start, start)).toBe(false);
    expect(isBookingOpen(start, new Date(start.getTime() + 60_000))).toBe(false);
  });
  it("free price is exactly 0 cents", () => {
    expect(isFreePrice(0)).toBe(true);
    expect(isFreePrice(1500)).toBe(false);
    expect(isFreePrice(null)).toBe(false);
    expect(isFreePrice(undefined)).toBe(false);
  });
  it("price text: free, whole euros, cents, missing", () => {
    expect(priceText(0)).toBe("Free");
    expect(priceText(1500)).toBe("€15");
    expect(priceText(2000)).toBe("€20");
    expect(priceText(1250)).toBe("€12.50");
    expect(priceText(null)).toBe("–");
  });
  it("cancel sentence is built from the constant", () => {
    expect(cancelUpToText()).toBe(`Cancel up to ${CANCELLATION_HOURS} hours before`);
  });
});
