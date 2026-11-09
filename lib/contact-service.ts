import { parseContact, type ContactFieldErrors, type ContactInput } from "./contact-schema";

export type ContactState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: ContactFieldErrors;
      values?: { name: string; email: string; message: string };
    }
  /** Database is not ready (live demo before the Neon main migration). Nothing was saved. */
  | {
      status: "demo-unavailable";
      message: string;
      values?: { name: string; email: string; message: string };
    };

export const MESSAGES = {
  success: "Thank you. Your message was sent. We will reply soon.",
  fieldsInvalid: "Please check the fields marked below.",
  generic:
    "Sorry, something went wrong. Please try again or write to [CONTACT EMAIL].",
  demoUnavailable:
    "Demo: messages are not saved yet. The contact form is switched on, but the database for this demo site is not ready. Please try again later or write to [CONTACT EMAIL].",
  spam: "We could not check that you are a person. Please reload the page and try again.",
} as const;

export type ContactDeps = {
  /** Saves the message. Must throw when the database is not ready. */
  save: (data: ContactInput) => Promise<void>;
  /** Sends the admin email. Optional; failures never block the visitor. */
  notify?: (data: ContactInput) => Promise<void>;
  /** Checks the Turnstile token. Absent = Turnstile is switched off. */
  verifyHuman?: (token: string) => Promise<boolean>;
  log?: (message: string, error?: unknown) => void;
};

export type RawContact = Record<string, unknown> & {
  /** Honeypot field: real people leave it empty. */
  website?: unknown;
  "cf-turnstile-response"?: unknown;
};

export async function processContact(raw: RawContact, deps: ContactDeps): Promise<ContactState> {
  const log = deps.log ?? (() => {});

  // Honeypot: pretend success, save nothing.
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { status: "success", message: MESSAGES.success };
  }

  const parsed = parseContact(raw);
  if (!parsed.ok) {
    const asText = (v: unknown) => (typeof v === "string" ? v.slice(0, 5000) : "");
    return {
      status: "error",
      message: MESSAGES.fieldsInvalid,
      fieldErrors: parsed.errors,
      values: { name: asText(raw.name), email: asText(raw.email), message: asText(raw.message) },
    };
  }

  if (deps.verifyHuman) {
    const token = typeof raw["cf-turnstile-response"] === "string" ? raw["cf-turnstile-response"] : "";
    let human = false;
    try {
      human = token !== "" && (await deps.verifyHuman(token));
    } catch (error) {
      log("Turnstile check failed", error);
    }
    if (!human) {
      return { status: "error", message: MESSAGES.spam, values: parsed.data };
    }
  }

  try {
    await deps.save(parsed.data);
  } catch (error) {
    log("Contact message was NOT saved (database not ready?)", error);
    return { status: "demo-unavailable", message: MESSAGES.demoUnavailable, values: parsed.data };
  }

  if (deps.notify) {
    try {
      await deps.notify(parsed.data);
    } catch (error) {
      log("Admin email failed (message is saved)", error);
    }
  }

  return { status: "success", message: MESSAGES.success };
}

// ---------- Optional services (switched off when env vars are missing) ----------

export function turnstileConfig(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return secret && siteKey ? { secret, siteKey } : null;
}

export function emailConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const to = env.CONTACT_TO_EMAIL?.trim();
  return apiKey && from && to ? { apiKey, from, to } : null;
}

export function makeVerifyHuman(
  secret: string,
  fetchImpl: typeof fetch = fetch,
): (token: string) => Promise<boolean> {
  return async (token) => {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  };
}

/** Removes line breaks so a name can never inject extra email headers. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function makeNotify(
  cfg: { apiKey: string; from: string; to: string },
  fetchImpl: typeof fetch = fetch,
): (data: ContactInput) => Promise<void> {
  return async (data) => {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [cfg.to],
        reply_to: data.email,
        subject: `New contact message from ${oneLine(data.name)}`.slice(0, 150),
        // Plain text only: no HTML, so nothing from the visitor can run in the email.
        text: `Name: ${oneLine(data.name)}\nEmail: ${data.email}\n\n${data.message}`,
      }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  };
}
