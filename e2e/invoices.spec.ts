import { expect, test } from "@playwright/test";
import { testSql } from "./db";
import { createWorkspace, emailsTo, OWNER, switchWorkspace, uid } from "./helpers";

const MOCK = "http://localhost:3999";

test("e-conomic: forbind, standardvalg, faktura bogføres, sendes med PDF og bliver betalt", async ({ page, request }) => {
  const id = uid();
  const ws = `Faktura ${id}`;
  const company = `Kunde ${id} ApS`;
  const email = `bogholderi-${id}@example.com`;
  await createWorkspace(page, ws);

  // Forbind via e-conomics godkendelsesside (simuleret) og vælg standardvalg
  await page.goto("/indstillinger/regnskab");
  await page.getByRole("link", { name: "Forbind e-conomic" }).click();
  await expect(page.getByRole("status")).toContainText("e-conomic er forbundet.");
  await expect(page.getByText("Testfirma Regnskab ApS")).toBeVisible();
  await expect(page.getByText("abonnement: plus")).toBeVisible();
  await page.getByLabel("Vare på fakturalinjer").selectOption("100");
  await page.getByLabel("Betalingsbetingelse").selectOption("1");
  await page.getByLabel("Fakturalayout").selectOption("21");
  await page.getByLabel("Kundegruppe for nye kunder").selectOption("1");
  await page.getByLabel("Momszone for nye kunder").selectOption("1");
  await page.getByRole("button", { name: "Gem standardvalg" }).click();
  await expect(page.getByText("Standardvalgene er gemt.")).toBeVisible();

  // Tokenet gemmes krypteret – aldrig i klartekst
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  const conn = await testSql("select grant_token_enc from economic_connections where workspace_id = $1", [wsId]);
  expect(conn.rows[0].grant_token_enc).not.toContain("grant-plus");

  // Virksomhed og faktura
  await page.goto("/virksomheder/ny");
  await page.fill("#co-name", company);
  await page.fill("#co-email", email);
  await page.fill("#co-cvr", "33445566");
  await page.fill("#co-address", "Fakturavej 7, 8000 Aarhus C");
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await expect(page.locator("h1")).toHaveText(company);
  await page.getByRole("button", { name: "Opret faktura" }).click();
  await expect(page.getByRole("heading", { name: "Ny faktura" })).toBeVisible();
  await expect(page.getByLabel("Kundens e-mail")).toHaveValue(email);

  await page.getByLabel("Overskrift (valgfri)").fill("Ny hjemmeside");
  await page.getByLabel("Linje 1 beskrivelse").fill("Design og udvikling");
  await page.getByLabel("Linje 1 pris").fill("10.000");
  await page.getByRole("button", { name: "+ Tilføj linje" }).click();
  await page.getByLabel("Linje 2 beskrivelse").fill("Hosting");
  await page.getByLabel("Linje 2 antal").fill("12");
  await page.getByLabel("Linje 2 pris").fill("100");
  await expect(page.getByLabel("I alt")).toHaveText(/14\.000,00/);
  await page.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Kladden er gemt.")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Bogfør og send" }).click();
  await expect(page.getByRole("status")).toContainText(`er bogført i e-conomic og sendt til ${email}`);
  await expect(page.getByRole("heading", { name: /^Faktura \d+$/ })).toBeVisible();
  await expect(page.locator("main")).toContainText("14.000,00");

  const invoice = (
    await testSql("select id, token, economic_number, status from invoices where workspace_id = $1", [wsId])
  ).rows[0];
  expect(invoice.status).toBe("BOOKED");

  // Kunden er oprettet i e-conomic med CVR, adresse delt op, og nummeret gemt i Kundespor
  const customer = await testSql("select economic_customer_number from companies where name = $1", [company]);
  expect(customer.rows[0].economic_customer_number).toBeGreaterThan(1);

  // E-mail med PDF vedhæftet og link til fakturasiden
  const sent = (await emailsTo(request, email)).at(-1) as unknown as {
    subject: string;
    text: string;
    attachments: { filename: string; content: string }[];
  };
  expect(sent.subject).toBe(`Faktura ${invoice.economic_number} fra ${ws}`);
  expect(sent.attachments[0].filename).toBe(`Faktura-${invoice.economic_number}.pdf`);
  expect(Buffer.from(sent.attachments[0].content, "base64").toString()).toContain("%PDF");
  expect(sent.text).toContain(`/faktura/${invoice.token}`);

  // Kundens fakturaside og PDF
  await page.goto(`/faktura/${invoice.token}`);
  await expect(page.getByRole("heading", { name: `Faktura ${invoice.economic_number}` })).toBeVisible();
  await expect(page.getByText("Ikke betalt")).toBeVisible();
  const pdf = await request.get(`/faktura/${invoice.token}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // Kunden betaler (registreret i e-conomic) → status opdateres, og der kommer en notifikation
  await request.get(`${MOCK}/economic-api/__pay?n=${invoice.economic_number}`);
  await page.goto(`/fakturaer/${invoice.id}`);
  await page.getByRole("button", { name: "Opdater betalingsstatus" }).click();
  // Når fakturaen er betalt, forsvinder knapperne til opdatering og "markér som betalt".
  await expect(page.getByRole("button", { name: "Opdater betalingsstatus" })).toHaveCount(0);
  await expect(page.locator("header").getByText("Betalt", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      (await testSql("select title from notifications where workspace_id = $1 and type = 'INVOICE_PAID'", [wsId])).rows.map(
        (r) => r.title,
      ),
    )
    .toEqual([`Faktura ${invoice.economic_number} er betalt`]);

  // Oversigten
  await page.goto("/fakturaer?vis=paid");
  await expect(page.getByRole("list", { name: "Fakturaer" })).toContainText(company);

  await switchWorkspace(page, OWNER.company);
});

test("e-conomic Basis: tydelig advarsel, og fakturaen kan ikke bogføres", async ({ page }) => {
  const ws = `Basis ${uid()}`;
  await createWorkspace(page, ws);
  await page.goto("/indstillinger/regnskab");
  await page.getByText("Viste e-conomic et token i stedet?").click();
  await page.getByLabel("Token fra e-conomic").fill("grant-basis");
  await page.getByRole("button", { name: "Forbind med token" }).click();
  await expect(page.getByText("Jeres abonnement (basis) tillader kun")).toBeVisible();

  await page.goto("/virksomheder/ny");
  await page.fill("#co-name", `Basis Kunde ${uid()}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.getByRole("button", { name: "Opret faktura" }).click();
  await expect(page.getByText("tillader ikke, at Kundespor opretter fakturaer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bogfør og send" })).toHaveCount(0);

  await switchWorkspace(page, OWNER.company);
});

test("faktura: kladder er ikke offentlige, og e-conomic kan ikke kobles på udefra", async ({ page, request }) => {
  const ws = `Sikker ${uid()}`;
  await createWorkspace(page, ws);
  await page.goto("/virksomheder/ny");
  await page.fill("#co-name", `Kladdekunde ${uid()}`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await page.getByRole("button", { name: "Opret faktura" }).click();
  await expect(page.getByRole("heading", { name: "Ny faktura" })).toBeVisible();
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  const token = (await testSql("select token from invoices where workspace_id = $1", [wsId])).rows[0].token;
  expect((await request.get(`/faktura/${token}`)).status()).toBe(404);
  expect((await request.get(`/faktura/${token}/pdf`)).status()).toBe(404);

  // Et link med et fremmed token, uden at forbindelsen er startet herfra, afvises
  await page.goto("/api/economic/callback?token=grant-plus");
  await expect(page).toHaveURL(/\/indstillinger\/regnskab\?fejl=afbrudt/);
  expect((await testSql("select 1 from economic_connections where workspace_id = $1", [wsId])).rows).toHaveLength(0);

  await switchWorkspace(page, OWNER.company);
});

test("faktura fra booking (pris omregnet til ekskl. moms) og fra deal med accepteret tilbud", async ({ page }) => {
  const id = uid();
  const ws = `Kilder ${id}`;
  await createWorkspace(page, ws);
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  await testSql("update workspaces set booking_enabled = true where id = $1", [wsId]);
  const contact = await testSql(
    "insert into contacts (workspace_id, name, email) values ($1, $2, $3) returning id",
    [wsId, `Bo Bil ${id}`, `bo-${id}@example.com`],
  );
  const booking = await testSql(
    `insert into bookings (workspace_id, contact_id, service_name, price_ore, starts_at, ends_at, token)
     values ($1, $2, 'Indvendig rens', 50000, now() + interval '1 day', now() + interval '1 day 2 hours', $3) returning id`,
    [wsId, contact.rows[0].id, `tok-${id}-booking-xxxxxxxx`],
  );
  await page.goto(`/kalender/${booking.rows[0].id}`);
  await page.getByRole("button", { name: "Opret faktura" }).click();
  await expect(page.getByLabel("Linje 1 beskrivelse")).toHaveValue("Indvendig rens");
  await expect(page.getByLabel("Linje 1 pris")).toHaveValue("400");
  await expect(page.getByLabel("I alt")).toHaveText(/500,00/);
  await expect(page.getByLabel("Kundens e-mail")).toHaveValue(`bo-${id}@example.com`);

  // Deal med accepteret tilbud: linjerne og rabatten følger med
  const stage = await testSql(
    "select s.id, s.pipeline_id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.workspace_id = $1 order by s.position limit 1",
    [wsId],
  );
  const deal = await testSql(
    "insert into deals (workspace_id, title, value, pipeline_id, stage_id, contact_id) values ($1, 'Lakforsegling', 9000, $2, $3, $4) returning id",
    [wsId, stage.rows[0].pipeline_id, stage.rows[0].id, contact.rows[0].id],
  );
  const quote = await testSql(
    `insert into quotes (workspace_id, deal_id, number, title, status, accepted_at, token)
     values ($1, $2, 1, 'Lakforsegling', 'ACCEPTED', now(), $3) returning id`,
    [wsId, deal.rows[0].id, `tok-${id}-quote-xxxxxxxxxxxx`],
  );
  await testSql(
    `insert into quote_lines (workspace_id, quote_id, position, description, quantity, unit, unit_price_ore, discount_pct)
     values ($1, $2, 0, 'Keramisk coating', 1, 'stk.', 800000, 10)`,
    [wsId, quote.rows[0].id],
  );
  await page.goto(`/pipeline/${deal.rows[0].id}`);
  await page.getByRole("button", { name: "Opret faktura" }).click();
  await expect(page.getByLabel("Overskrift (valgfri)")).toHaveValue("Lakforsegling");
  await expect(page.getByLabel("Linje 1 beskrivelse")).toHaveValue("Keramisk coating (stk.)");
  await expect(page.getByLabel("Linje 1 pris")).toHaveValue("7200");

  await switchWorkspace(page, OWNER.company);
});
