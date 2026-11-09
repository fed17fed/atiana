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
