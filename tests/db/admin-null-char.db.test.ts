import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanParam, cleanQuery, exportBookings, exportSubscribers, listBookings, listMessages, listOrders, listReferrals, listSubscribers } from "@/lib/admin/read-queries";
import { countSessions, listSessions } from "@/lib/admin/sessions-service";
import { dbTestsOn, getDb, testUser } from "./helpers";

// N19-1. Local test database only. Read-only queries: nothing is written except one export audit row per CSV call.
let adminId = "";
vi.mock("@/lib/session", () => ({ requireAdmin: async () => ({ id: adminId, role: "ADMIN" }) }));

const TRICKS = ["\u0000", "a\u0000b", "\u0001\u0002", "%00", "\u0000".repeat(200)];

describe.skipIf(!dbTestsOn)("admin search / filter with control characters (DB)", () => {
  beforeAll(async () => {
    adminId = (await testUser(await getDb(), 940)).id;
  });
  afterAll(async () => {
    (await getDb()).$disconnect();
  });

  it("the five list pages: a NUL search is a normal search (no database error)", async () => {
    const db = await getDb();
    for (const t of TRICKS) {
      const q = cleanQuery(t);
      for (const list of [listBookings, listOrders, listSubscribers, listReferrals, listMessages]) {
        const r = await list(db, { q, page: 1 });
        expect(r.total, `${list.name} ${JSON.stringify(t)}`).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(r.rows)).toBe(true);
      }
    }
  }, 60_000);

  it("a NUL-only search is the same as no search; a NUL inside an email is removed (0 results, no error)", async () => {
    const db = await getDb();
    expect((await listBookings(db, { q: cleanQuery("\u0000"), page: 1 })).total).toBe((await listBookings(db, { q: null, page: 1 })).total);
    expect((await listMessages(db, { q: cleanQuery("zz\u0000-no-such-person@nowhere.test"), page: 1 })).total).toBe(0);
  }, 60_000);

  it("sessions list: a NUL offering filter finds nothing (or all when empty) and does not fail", async () => {
    const db = await getDb();
    const id = cleanParam("\u0000", 60) ?? undefined;
    expect(id).toBeUndefined();
    expect(await countSessions(db, { offeringId: id })).toBeGreaterThanOrEqual(0);
    const odd = cleanParam("x\u0000y", 60) ?? undefined; // "x y": an id that does not exist
    expect(await countSessions(db, { offeringId: odd })).toBe(0);
    expect(await listSessions(db, { offeringId: odd, page: 1 })).toEqual([]);
  }, 60_000);

  it("both CSV exports answer 200 with a valid CSV for ?q=%00 (header row at least)", async () => {
    const db = await getDb();
    expect(Array.isArray(await exportBookings(db, cleanQuery("\u0000")))).toBe(true);
    expect(Array.isArray(await exportSubscribers(db, cleanQuery("\u0000")))).toBe(true);
    const b = await import("@/app/admin/bookings/export/route");
    const s = await import("@/app/admin/subscribers/export/route");
    for (const [name, GET, header] of [["bookings", b.GET, "booked_at_utc"], ["subscribers", s.GET, ""]] as const) {
      for (const q of ["%00", "a%00b", "%01%02"]) {
        const res = await GET(new Request(`http://localhost/admin/${name}/export?q=${q}`));
        expect(res.status, `${name} ?q=${q}`).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/csv");
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
        if (header) expect(text).toContain(header);
      }
    }
  }, 60_000);
});
