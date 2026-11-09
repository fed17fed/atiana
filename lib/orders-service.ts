/** Orders created by the site (before payment). Payment is confirmed only by the Stripe webhook. */
import type { PrismaClient } from "./generated/prisma/client";

export type PackageOrderResult =
  | { ok: true; orderId: string; amountCents: number; description: string; currency: string; email: string }
  | { ok: false; code: "NOT_FOUND" };

/** Creates an unpaid order for one class pack. Credits are granted by the webhook after payment. */
export async function createPackageOrder(
  db: PrismaClient,
  input: { userId: string; packageId: string },
): Promise<PackageOrderResult> {
  const pack = await db.package.findFirst({ where: { id: input.packageId, active: true } });
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { email: true } });
  if (!pack || !user) return { ok: false, code: "NOT_FOUND" };
  const order = await db.order.create({
    data: {
      userId: input.userId,
      email: user.email,
      status: "PENDING",
      currency: pack.currency,
      subtotalCents: pack.priceCents,
      totalCents: pack.priceCents,
      items: {
        create: [
          {
            type: "PACKAGE",
            description: pack.name,
            quantity: 1,
            unitPriceCents: pack.priceCents,
            totalCents: pack.priceCents,
            refId: pack.id,
          },
        ],
      },
    },
  });
  return {
    ok: true,
    orderId: order.id,
    amountCents: pack.priceCents,
    description: pack.name,
    currency: pack.currency,
    email: user.email,
  };
}

export function formatEuro(cents: number, currency = "EUR"): string {
  const value = cents / 100;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
