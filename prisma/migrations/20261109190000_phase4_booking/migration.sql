-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "slotKey" TEXT,
ADD COLUMN     "userKey" TEXT;

-- AlterTable
ALTER TABLE "CreditGrant" ADD COLUMN     "appliesTo" "OfferingType"[] DEFAULT ARRAY['GROUP_CLASS']::"OfferingType"[],
ADD COLUMN     "creditsExpired" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_userKey_key" ON "Booking"("userKey");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotKey_key" ON "Booking"("slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_offeringId_startsAt_key" ON "ClassSession"("offeringId", "startsAt");

