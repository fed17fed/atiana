/**
 * Sends plain-text email through Resend. OFF unless RESEND_API_KEY (or AUTH_RESEND_KEY) and EMAIL_FROM are set.
 * When it is off, the email is only logged (recipient and subject; never the body).
 */
export type EnvLike = Record<string, string | undefined>;

export type Mail = { to: string; subject: string; text: string };

export function mailConfig(env: EnvLike = process.env) {
  const apiKey = (env.RESEND_API_KEY ?? env.AUTH_RESEND_KEY)?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** Removes line breaks so nothing can inject extra email headers. */
function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendMail(
  mail: Mail,
  opts: { env?: EnvLike; fetchImpl?: typeof fetch; log?: (m: string) => void } = {},
): Promise<{ sent: boolean }> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const cfg = mailConfig(opts.env);
  if (!cfg) {
    log(`[mail] Resend is off. Not sent: to=${oneLine(mail.to)} subject="${oneLine(mail.subject)}"`);
    return { sent: false };
  }
  const res = await (opts.fetchImpl ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: [oneLine(mail.to)],
      subject: oneLine(mail.subject).slice(0, 150),
      text: mail.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  return { sent: true };
}
