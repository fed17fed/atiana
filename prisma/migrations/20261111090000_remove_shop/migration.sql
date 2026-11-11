-- Shop removed from the project (owner decision 2026-11-11). Order and OrderItem stay (sessions, packs, events, donations).
-- AlterEnum
BEGIN;
CREATE TYPE "OrderItemType_new" AS ENUM ('CLASS', 'PACKAGE', 'ONE_TO_ONE', 'EVENT', 'DONATION');
ALTER TABLE "OrderItem" ALTER COLUMN "type" TYPE "OrderItemType_new" USING ("type"::text::"OrderItemType_new");
ALTER TYPE "OrderItemType" RENAME TO "OrderItemType_old";
ALTER TYPE "OrderItemType_new" RENAME TO "OrderItemType";
DROP TYPE "OrderItemType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "ProductImage" DROP CONSTRAINT "ProductImage_productId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "shippingCents";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "productId";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "ProductImage";

-- DropEnum
DROP TYPE "ProductType";

