/**
 * Company facts shown in texts, in ONE place (task 12.6, owner answer Q4 2026-11-21).
 * Texts never write the contact email or the company data by hand: they use the site tokens
 * {{CONTACT_EMAIL}}, {{COMPANY_NAME}}, {{COMPANY_ADDRESS}}, {{CRO_NUMBER}} (see lib/text-tokens.ts SITE_TOKENS).
 *
 * The values are the same placeholders the site shows today (footer, contact page, legal pages). The real values come from
 * the owner in Phase 10 (company data). Then change them HERE only. Never invent a value.
 */
export const COMPANY = {
  contactEmail: "[CONTACT EMAIL]",
  name: "[COMPANY NAME]",
  address: "[ADDRESS]",
  croNumber: "[CRO NUMBER]",
} as const;
