/**
 * Feature flags (no secrets). Packs are hidden until the owner sets new pack prices (owner decision 2026-11-12).
 * The pack code and the Package rows stay; only the site hides them. Set SHOW_PACKS=true to show them again.
 */
export function packsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SHOW_PACKS === "true";
}

/** "Refer a friend" is hidden (owner decision 2026-11-11). Set SHOW_REFERRAL=true to show the texts about it again. */
export function referralEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SHOW_REFERRAL === "true";
}
