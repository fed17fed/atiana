-- CreateEnum
CREATE TYPE "EventPricing" AS ENUM ('FREE', 'DONATION', 'PAID');

-- AlterTable
ALTER TABLE "Offering" ADD COLUMN     "eventPricing" "EventPricing";

