/**
 * Returns `value` when it is a plain https:// address, else `fallback`. Used for editable link texts
 * (e.g. the Instagram address), so a text from the database can never become a javascript: or http: link.
 */
export function safeHttpsUrl(value: string, fallback: string): string {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}
