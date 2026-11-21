import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migreringer bruger helst en direkte forbindelse (Neon/Vercel sætter DATABASE_URL_UNPOOLED).
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm",
  },
});
