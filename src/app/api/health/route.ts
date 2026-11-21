/** Simpelt sundhedstjek til hosting og tests. Rører ikke databasen. */
export function GET() {
  return Response.json({ ok: true });
}
