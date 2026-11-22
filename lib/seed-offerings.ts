/**
 * Seed decision for one offering row (task 12.8, owner answer Q6: the database is the master after Phase 12).
 *  - no row yet            -> create it (with the code text: rule numbers as tokens, finding F-2)
 *  - row with adminEditedAt -> skip it completely (an admin changed, hid or restored it: the seed never overwrites that)
 *  - row, not edited, same  -> unchanged
 *  - row, not edited, other -> update to the code default (a row nobody has edited yet follows the code)
 * Pure: no database. Used by prisma/seed-classes.ts and prisma/seed-events.ts, and tested without a database.
 */
export type SeedAction = "create" | "skip-edited" | "unchanged" | "update";

export function seedAction(before: ({ adminEditedAt: Date | null } & Record<string, unknown>) | null, wanted: Record<string, unknown>): SeedAction {
  if (!before) return "create";
  if (before.adminEditedAt) return "skip-edited";
  const row = before;
  const same = Object.keys(wanted).every((k) => (row[k] ?? null) === (wanted[k] ?? null));
  return same ? "unchanged" : "update";
}
