/**
 * N18-2: the login mail must never make a request look different for an admin email.
 * If sending fails (wrong key, sender refused, network), Auth.js would redirect to an error page ONLY for emails that reached the mailer,
 * which are exactly the allowed (admin) emails. So the send error is caught here: it is logged (reason only) and swallowed, and every
 * path ends on the same "check your email" screen. Pure helper: no Auth.js import, testable.
 */
type SendParams = { identifier: string; url: string } & Record<string, unknown>;

/** Short reason for the server log. Anything that looks like an email address or a link is removed; cut to 120 characters. */
export function safeReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[^\s"'<>@]+@[^\s"'<>]+/g, "[email]").replace(/https?:\/\/[^\s"'<>]+/g, "[link]").replace(/\s+/g, " ").slice(0, 120);
}

export function swallowSendErrors<P extends SendParams>(send: (params: P) => Promise<void>, log: (message: string) => void = (m) => console.error(m)) {
  return async (params: P): Promise<void> => {
    try {
      await send(params);
    } catch (error) {
      log(`[login] could not send the link: ${safeReason(error)}`);
    }
  };
}
