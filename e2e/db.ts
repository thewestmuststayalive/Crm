import { Pool } from "pg";
import { TEST_DATABASE_URL } from "../playwright.config";

/** Direkte SQL mod testdatabasen – bruges kun til at skrue tiden tilbage på testdata. */
export async function testSql(query: string, params: unknown[] = []) {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    return await pool.query(query, params);
  } finally {
    await pool.end();
  }
}
