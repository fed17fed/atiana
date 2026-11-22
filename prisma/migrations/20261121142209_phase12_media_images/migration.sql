-- CreateTable
CREATE TABLE "MediaImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "MediaImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaImage_url_key" ON "MediaImage"("url");

-- CreateIndex
CREATE INDEX "MediaImage_createdAt_idx" ON "MediaImage"("createdAt");

-- CreateIndex
CREATE INDEX "MediaImage_createdById_idx" ON "MediaImage"("createdById");

-- AddForeignKey
ALTER TABLE "MediaImage" ADD CONSTRAINT "MediaImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
