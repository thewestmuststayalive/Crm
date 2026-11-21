import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "../playwright.config";
import { startMetaMock } from "./meta-mock";

/**
 * Migrerer testdatabasen, tømmer alle tabeller og starter den falske Meta-server.
 * Returnerer en teardown, der lukker Meta-serveren igen.
 */
export default async function globalSetup() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length > 0) {
      await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
    }
  } finally {
    await pool.end();
  }

  const mock = await startMetaMock();
  return () => new Promise<void>((resolve) => mock.close(() => resolve()));
}
