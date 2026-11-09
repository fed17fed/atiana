import { z } from "zod";

/** Server-side validation for the contact form. Trims text; empty values give a clear message. */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter your name.")
    .max(100, "Please use 100 characters or fewer."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email.")
    .max(200, "Please use 200 characters or fewer.")
    .pipe(z.email("Please enter a valid email, for example anna@example.com.")),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters.")
    .max(5000, "Please use 5000 characters or fewer."),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactFieldErrors = Partial<Record<keyof ContactInput, string>>;

/** Validates raw form values (FormData entries may be null or File). Returns data or per-field errors. */
export function parseContact(
  raw: Record<string, unknown>,
): { ok: true; data: ContactInput } | { ok: false; errors: ContactFieldErrors } {
  const asText = (v: unknown) => (typeof v === "string" ? v : "");
  const result = contactSchema.safeParse({
    name: asText(raw.name),
    email: asText(raw.email),
    message: asText(raw.message),
  });
  if (result.success) return { ok: true, data: result.data };
  const errors: ContactFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ContactInput | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
