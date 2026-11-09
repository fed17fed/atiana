import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI (migrate) uses the DIRECT connection; the app uses DATABASE_URL (pooled) via the pg adapter.
// Falls back to "" so `prisma generate` works in CI without a database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
