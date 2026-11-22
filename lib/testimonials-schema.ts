/**
 * Testimonial form rules (task 12.11). Pure: no database, no Next.js. Used by the server action (the real check)
 * and by the form (to show the consent box at the right time).
 *
 * Owner decision (plan 14.10): a review keeps the public label "Demo review" until the admin confirms that
 * the client agreed to be shown. Confirmation is needed when a review is created as a real one, or when
 * a demo review becomes a real one. The server checks it again, the form is only a help.
 */
import { z } from "zod";

export const TESTIMONIAL_NAME_MAX = 80;
export const TESTIMONIAL_PLACE_MAX = 80;
export const TESTIMONIAL_TEXT_MAX = 400;
export const TESTIMONIAL_ORDER_MAX = 999;

// Empty inputs arrive as null (React) or "" (browser): both mean "nothing typed".
const trimmed = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");
const checkbox = (v: unknown) => v === true || v === "on" || v === "true";

// Public text must not carry private data (plan 14.3 rule 4): no Zoom links, no email addresses.
const PRIVATE_RE = /zoom\.us|zoomgov\.com|[^\s@]+@[^\s@]+\.[^\s@]+/i;
const noPrivate = (v: string) => !PRIVATE_RE.test(v);
const PRIVATE_MSG = "Do not put email addresses or Zoom links in a review.";

export const testimonialFormSchema = z.object({
  name: z.preprocess(trimmed, z.string().min(1, "Name is required.").max(TESTIMONIAL_NAME_MAX, `At most ${TESTIMONIAL_NAME_MAX} characters.`).refine(noPrivate, PRIVATE_MSG)),
  place: z.preprocess(
    trimmed,
    z.string().max(TESTIMONIAL_PLACE_MAX, `At most ${TESTIMONIAL_PLACE_MAX} characters.`).refine(noPrivate, PRIVATE_MSG).transform((v) => (v === "" ? null : v)),
  ),
  text: z.preprocess(trimmed, z.string().min(1, "The quote is required.").max(TESTIMONIAL_TEXT_MAX, `At most ${TESTIMONIAL_TEXT_MAX} characters.`).refine(noPrivate, PRIVATE_MSG)),
  sortOrder: z.preprocess(
    (v) => (trimmed(v) === "" ? 0 : Number(trimmed(v))),
    z.number("Order must be a number.").int("Order must be a whole number.").min(0, "Order cannot be negative.").max(TESTIMONIAL_ORDER_MAX, `Order is at most ${TESTIMONIAL_ORDER_MAX}.`),
  ),
  published: z.preprocess(checkbox, z.boolean()),
  isDemo: z.preprocess(checkbox, z.boolean()),
  clientAgreed: z.preprocess(checkbox, z.boolean()),
});

export type TestimonialInput = Omit<z.infer<typeof testimonialFormSchema>, "clientAgreed">;

/**
 * Does saving need the "client agreed to be shown" confirmation?
 * `previousIsDemo` = value in the database now (null = a new review).
 */
export function needsClientConsent(previousIsDemo: boolean | null, nextIsDemo: boolean): boolean {
  return !nextIsDemo && (previousIsDemo === null || previousIsDemo === true);
}

export const CONSENT_MESSAGE = "Tick the box to confirm that this client agreed to be shown on the site.";

export type TestimonialParse = { ok: true; data: TestimonialInput } | { ok: false; fieldErrors: Record<string, string[]> };

export function parseTestimonialForm(raw: Record<string, unknown>, previousIsDemo: boolean | null): TestimonialParse {
  const r = testimonialFormSchema.safeParse(raw);
  if (!r.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    // Also tell about the consent box when it is missing, so one submit shows every problem.
    const isDemo = checkbox(raw.isDemo);
    if (needsClientConsent(previousIsDemo, isDemo) && !checkbox(raw.clientAgreed)) fieldErrors.clientAgreed = [CONSENT_MESSAGE];
    return { ok: false, fieldErrors };
  }
  const { clientAgreed, ...data } = r.data;
  if (needsClientConsent(previousIsDemo, data.isDemo) && !clientAgreed) {
    return { ok: false, fieldErrors: { clientAgreed: [CONSENT_MESSAGE] } };
  }
  return { ok: true, data };
}
