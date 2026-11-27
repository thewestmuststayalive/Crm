import { expect, test } from "@playwright/test";
import { testSql } from "./db";
import { connectEconomic, createWorkspace, danishDate, emailsTo, OWNER, setupBooking, switchWorkspace, uid } from "./helpers";

const cron = (request: import("@playwright/test").APIRequestContext) =>
  request.get("/api/cron/daily", { headers: { authorization: "Bearer test-cron" } });

test("bilpleje: vaskeabonnement hver 4. uge med fast booking og fakturakladde", async ({ page, request }) => {
  const id = uid();
  const ws = `Abonnement ${id}`;
  const service = `Udvendig vask ${id}`;
  await createWorkspace(page, ws);
  await setupBooking(page, service, "300");
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  const email = `abonnent-${id}@example.com`;
  const contact = await testSql("insert into contacts (workspace_id, name, email, phone) values ($1, $2, $3, '22113344') returning id", [
    wsId,
    `Anne Abonnent ${id}`,
    email,
  ]);
  const first = danishDate(3);

  await page.goto(`/aftaler/ny?kontakt=${contact.rows[0].id}`);
  await page.getByLabel("Navn på aftalen").fill("Vaskeabonnement");
  await page.getByLabel("Hver", { exact: true }).fill("4");
  await page.getByLabel("Enhed").selectOption("WEEK");
  await page.getByLabel("Første/næste dato").fill(first);
  await page.getByLabel("Ydelse").selectOption({ label: service });
  await page.getByLabel("Tidspunkt").fill("10:00");
  await page.getByLabel("Linje 1 beskrivelse").fill("Udvendig vask");
  await page.getByLabel("Linje 1 pris").fill("200");
  await expect(page.getByLabel("Pris pr. gang")).toContainText("250,00");
  await page.getByLabel("Fakturering").selectOption("DRAFT");
  await page.getByRole("button", { name: "Opret aftalen" }).click();
  await expect(page.getByRole("status")).toContainText("Aftalen er gemt.");

  // Den daglige kørsel opretter bookingen en uge før – kun én gang
  for (let i = 0; i < 2; i++) expect((await cron(request)).status()).toBe(200);
  const agreement = (await testSql("select id, next_date::text as next from agreements where workspace_id = $1", [wsId])).rows[0];
  expect(agreement.next).toBe(danishDate(31));
  const bookings = await testSql(
    "select service_name, price_ore, to_char(starts_at at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI') as at from bookings where workspace_id = $1",
    [wsId],
  );
  expect(bookings.rows).toEqual([{ service_name: service, price_ore: 25000, at: `${first} 10:00` }]);
  const invoices = await testSql("select status, lines from invoices where workspace_id = $1", [wsId]);
  expect(invoices.rows).toHaveLength(1);
  expect(invoices.rows[0].status).toBe("DRAFT");
  expect(invoices.rows[0].lines).toEqual([{ description: "Udvendig vask", quantity: 1, unitPriceOre: 20000 }]);
  expect((await emailsTo(request, email)).some((m) => m.subject.includes(service))).toBe(true);

  await page.goto(`/aftaler/${agreement.id}`);
  const history = page.getByRole("list", { name: "Historik" });
  await expect(history.getByRole("link", { name: "Booking" })).toBeVisible();
  await expect(history.getByRole("link", { name: "Faktura" })).toBeVisible();

  await switchWorkspace(page, OWNER.company);
});

test("bureau: månedlig aftale med prisregulering, sæson og automatisk faktura via e-conomic", async ({ page, request }) => {
  const id = uid();
  const ws = `Retainer ${id}`;
  await createWorkspace(page, ws);
  await connectEconomic(page);
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  const email = `kunde-${id}@example.com`;
  const company = await testSql("insert into companies (workspace_id, name, email) values ($1, $2, $3) returning id", [
    wsId,
    `Klient ${id} ApS`,
    email,
  ]);
  const month = String(Number(danishDate(0).slice(5, 7)));

  await page.goto(`/aftaler/ny?virksomhed=${company.rows[0].id}`);
  await page.getByLabel("Navn på aftalen").fill("SEO-aftale");
  await page.getByLabel("Første/næste dato").fill(danishDate(0));
  await page.getByLabel("Linje 1 beskrivelse").fill("SEO og annoncer");
  await page.getByLabel("Linje 1 pris").fill("5.000");
  await page.getByLabel("Prisregulering pr. år (%)").fill("3");
  await page.getByLabel("Reguleres i").selectOption(month);
  await page.getByLabel("Fakturering").selectOption("SEND");
  await page.getByRole("button", { name: "Opret aftalen" }).click();
  await expect(page.getByRole("status")).toContainText("Aftalen er gemt.");

  await page.getByRole("button", { name: "Udfør næste periode nu" }).click();
  await expect(page.getByRole("status")).toContainText("Perioden er udført.");
  const inv1 = await testSql("select status, lines, economic_number from invoices where workspace_id = $1", [wsId]);
  expect(inv1.rows[0].status).toBe("BOOKED");
  expect(inv1.rows[0].lines[0].unitPriceOre).toBe(515000);
  expect((await emailsTo(request, email)).at(-1)?.subject).toBe(`Faktura ${inv1.rows[0].economic_number} fra ${ws}`);

  const runs = async () => (await testSql("select count(*)::int as n from agreement_runs where workspace_id = $1", [wsId])).rows[0].n;
  const invoiceCount = async () => (await testSql("select count(*)::int as n from invoices where workspace_id = $1", [wsId])).rows[0].n;
  const nextDate = async () => (await testSql("select next_date::text as d from agreements where workspace_id = $1", [wsId])).rows[0].d;
  const runNow = async (expectNext: string) => {
    await page.goto(page.url().split("?")[0]);
    await page.getByRole("button", { name: "Udfør næste periode nu" }).click();
    await expect.poll(nextDate).toBe(expectNext);
  };

  // Samme periode kan ikke udføres to gange
  const afterFirst = await nextDate();
  await testSql("update agreements set next_date = current_date where workspace_id = $1", [wsId]);
  await runNow(afterFirst);
  expect(await invoiceCount()).toBe(1);
  expect(await runs()).toBe(1);

  // Næste periode i samme år: ingen ny regulering
  await testSql("update agreements set next_date = $2 where workspace_id = $1", [wsId, danishDate(1)]);
  await runNow(await (async () => {
    const [y, m, d] = danishDate(1).split("-").map(Number);
    const t = new Date(Date.UTC(y, m, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(d, last));
    return t.toISOString().slice(0, 10);
  })());
  const prices = await testSql("select (lines->0->>'unitPriceOre')::int as p from invoices where workspace_id = $1", [wsId]);
  expect(prices.rows.map((r) => r.p)).toEqual([515000, 515000]);

  // Uden for sæsonen: ingen faktura, men perioden logges
  const other = (Number(danishDate(2).slice(5, 7)) % 12) + 1;
  await testSql("update agreements set next_date = $2, season_months = $3::jsonb where workspace_id = $1", [
    wsId,
    danishDate(2),
    JSON.stringify([other]),
  ]);
  await page.goto(page.url().split("?")[0]);
  await page.getByRole("button", { name: "Udfør næste periode nu" }).click();
  await expect.poll(runs).toBe(3);
  await page.goto(page.url().split("?")[0]);
  await expect(page.getByRole("list", { name: "Historik" })).toContainText("Uden for sæsonen");
  expect(await invoiceCount()).toBe(2);

  await switchWorkspace(page, OWNER.company);
});

test("fast booking på en optaget tid giver besked i stedet for dobbeltbooking", async ({ page, request }) => {
  const id = uid();
  const ws = `Optaget ${id}`;
  const service = `Rens ${id}`;
  await createWorkspace(page, ws);
  await setupBooking(page, service);
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  const user = (await testSql("select id from users where email = $1", [OWNER.email])).rows[0].id;
  const contact = (await testSql("insert into contacts (workspace_id, name) values ($1, 'Optaget Olsen') returning id", [wsId])).rows[0].id;
  const svc = (await testSql("select id from services where workspace_id = $1", [wsId])).rows[0].id;
  const day = danishDate(2);
  await testSql(
    `insert into bookings (workspace_id, contact_id, service_name, starts_at, ends_at, token)
     values ($1, $2, 'Anden kunde', ($3::date + time '10:00') at time zone 'Europe/Copenhagen', ($3::date + time '11:00') at time zone 'Europe/Copenhagen', $4)`,
    [wsId, contact, day, `tok-${id}-optaget-xxxxxxxxxx`],
  );
  await testSql(
    `insert into agreements (workspace_id, contact_id, name, next_date, service_id, booking_time, lines, created_by_id)
     values ($1, $2, 'Fast rens', $3, $4, '10:00', '[{"description":"Rens","quantity":1,"unitPriceOre":40000}]', $5)`,
    [wsId, contact, day, svc, user],
  );
  expect((await cron(request)).status()).toBe(200);
  const notes = await testSql("select title from notifications where workspace_id = $1 and type = 'AGREEMENT_ALERT'", [wsId]);
  expect(notes.rows[0].title).toBe("Fast aftale: Fast rens – tiden er optaget");
  const run = await testSql("select note, booking_id from agreement_runs where workspace_id = $1", [wsId]);
  expect(run.rows[0]).toEqual({ note: "Tiden var optaget – booking ikke oprettet", booking_id: null });

  await switchWorkspace(page, OWNER.company);
});
