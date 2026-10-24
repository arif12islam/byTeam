import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Read .env.local the same way Next.js does.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
