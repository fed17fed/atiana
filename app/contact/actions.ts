"use server";

import {
  emailConfig,
  makeNotify,
  makeVerifyHuman,
  processContact,
  turnstileConfig,
  type ContactState,
} from "@/lib/contact-service";

/** Server action for the contact form. Never throws to the visitor. */
export async function sendContactMessage(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const raw = Object.fromEntries(formData.entries());
  const turnstile = turnstileConfig();
  const email = emailConfig();

  try {
    return await processContact(raw, {
      // Import inside the function: a missing DATABASE_URL must not crash the page.
      save: async (data) => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.contactMessage.create({ data });
      },
      notify: email ? makeNotify(email) : undefined,
      verifyHuman: turnstile ? makeVerifyHuman(turnstile.secret) : undefined,
      log: (message) => console.warn(`[contact] ${message}`),
    });
  } catch {
    return {
      status: "error",
      message: "Sorry, something went wrong. Please try again or write to [CONTACT EMAIL].",
    };
  }
}
