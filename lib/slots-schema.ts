/** Admin form for 1:1 slots (validated on the server). */
import { z } from "zod";
import { BUSINESS_TZ, zonedToUtc } from "./time";

export const slotFormSchema = z.object({
  offeringId: z.string().trim().min(1, "Choose a 1:1 offering."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a start time, for example 14:00."),
  minutes: z.coerce.number().int().min(15, "At least 15 minutes.").max(240, "At most 240 minutes."),
  repeatWeeks: z.coerce.number().int().min(1, "At least 1.").max(12, "At most 12 weeks."),
});

export type SlotForm = z.infer<typeof slotFormSchema>;

/** Dublin wall-clock input -> list of UTC start/end times (one per week). */
export function planSlots(form: SlotForm, now: Date) {
  const [y, m, d] = form.date.split("-").map(Number);
  const [hour, minute] = form.time.split(":").map(Number);
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  for (let w = 0; w < form.repeatWeeks; w++) {
    const day = new Date(Date.UTC(y, m - 1, d + w * 7, 12));
    const startsAt = zonedToUtc(
      { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute },
      BUSINESS_TZ,
    );
    if (startsAt.getTime() <= now.getTime()) continue;
    slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + form.minutes * 60_000) });
  }
  return slots;
}
