/**
 * Daily job (Vercel Hobby allows a cron only once a day):
 *  1. release unpaid holds, 2. expire credits, 3. send reminders for classes in the next 24 hours.
 * Every step is safe to repeat: holds and credits are handled by status checks, reminders by reminderSentAt.
 */
import type { PrismaClient } from "./generated/prisma/client";
import { expireCredits, releaseUnpaidHolds } from "./booking-service";
import { mailConfig, sendMail } from "./mail";
import { buildBookingMail } from "./notifications";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CronSummary = {
  holdsReleased: number;
  creditGrantsExpired: number;
  remindersSent: number;
  remindersLogged: number;
  remindersFailed: number;
};

export async function sendReminders(db: PrismaClient, now: Date) {
  const due = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      session: { status: "SCHEDULED", startsAt: { gt: now, lte: new Date(now.getTime() + DAY_MS) } },
    },
    include: { user: true, session: { include: { offering: true } } },
  });
  let sent = 0;
  let logged = 0;
  let failed = 0;
  for (const b of due) {
    // Claim first: two overlapping runs cannot send the same reminder twice.
    const claim = await db.booking.updateMany({
      where: { id: b.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claim.count !== 1) continue;
    try {
      const r = await sendMail(buildBookingMail("reminder", b.user.email, b.session));
      if (r.sent) sent += 1;
      else logged += 1;
    } catch (error) {
      failed += 1;
      console.error("[cron] reminder failed", b.id, error instanceof Error ? error.message : error);
      // Give the reminder another chance at the next run.
      await db.booking.updateMany({ where: { id: b.id }, data: { reminderSentAt: null } });
    }
  }
  return { sent, logged, failed, emailOn: mailConfig() !== null };
}

export async function runDailyJob(db: PrismaClient, now: Date = new Date()): Promise<CronSummary> {
  const holdsReleased = await releaseUnpaidHolds(db, now);
  const creditGrantsExpired = await expireCredits(db, now);
  const r = await sendReminders(db, now);
  return {
    holdsReleased,
    creditGrantsExpired,
    remindersSent: r.sent,
    remindersLogged: r.logged,
    remindersFailed: r.failed,
  };
}
