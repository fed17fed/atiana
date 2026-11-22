import { afterAll, describe, expect, it } from "vitest";
import { getNewMessages } from "@/lib/admin/overview";
import { dbTestsOn, getDb, unique } from "./helpers";

// Local test database only. A test message is created and updated (never deleted).
describe.skipIf(!dbTestsOn)("overview: unread messages card counts readAt = null (DB)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });
  it("a read message is not counted; an old unread one is", async () => {
    const db = await getDb();
    const before = (await getNewMessages(db)).count;
    const m = await db.contactMessage.create({ data: { name: "ZZ Card", email: `${unique("c")}@atiana.test`, message: "hi", createdAt: new Date("2020-01-01T00:00:00Z") } });
    expect((await getNewMessages(db)).count).toBe(before + 1); // old, but unread
    await db.contactMessage.update({ where: { id: m.id }, data: { readAt: new Date() } });
    expect((await getNewMessages(db)).count).toBe(before);
  });
});
