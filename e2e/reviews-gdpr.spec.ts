import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { testSql } from "./db";
import { OWNER, switchWorkspace, uid } from "./helpers";

async function createWorkspace(page: Page, name: string) {
  await page.goto("/indstillinger");
  await page.fill("#ws-name", name);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(`Du arbejder i ${name}`);
}

async function createContact(page: Page, name: string, email = "") {
  await page.goto("/kunder/ny");
  await page.fill("#c-name", name);
  if (email) await page.fill("#c-email", email);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(name);
  return page.url().split("/").pop()!;
}

/** Opretter en deal fra kontaktsiden og markerer den som vundet. */
async function winDealFor(page: Page, contactId: string, title: string) {
  await page.goto(`/pipeline/ny?kontakt=${contactId}`);
  await page.fill("#d-title", title);
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("h1")).toHaveText(title);
  await page.waitForLoadState("networkidle");
  await page.selectOption("#stage-select", { label: "Vundet" });
  // Vent på serveren: dropdown'en indeholder selv ordet "Vundet", tidslinjen gør først efter flytningen.
  await expect(page.locator("ol")).toContainText("til Vundet");
}

async function runCron(request: APIRequestContext) {
  const res = await request.get("/api/cron/daily", { headers: { authorization: "Bearer test-cron" } });
  expect(res.status()).toBe(200);
  return (await res.json()) as { reviewRequests?: number; leadsDeleted?: number };
}

async function emailTo(request: APIRequestContext, to: string, subject: RegExp) {
  const res = await request.get("http://localhost:3999/__requests");
  const log = (await res.json()) as { path: string; body: { to: string; subject: string; text: string } }[];
  return log.filter((r) => r.path === "/emails" && r.body.to === to && subject.test(r.body.subject)).map((r) => r.body);
}

test("anmeldelser: planlægges ved vundet deal, sendes, klik registreres og afmelding respekteres", async ({
  page,
  browser,
  request,
}) => {
  const id = uid();
  await createWorkspace(page, `Anmeldfirma ${id}`);

  await page.goto("/indstillinger/anmeldelser");
  await page.getByLabel("Send en anmodning om anmeldelse").check();
  await page.getByLabel("Link til jeres anmeldelsesside").fill("http://localhost:3999/anmeld-os");
  await page.getByLabel("Hvornår").selectOption({ label: "Ved næste morgenkørsel" });
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByRole("status")).toContainText("Anmeldelser er slået til");

  // Vundet deal planlægger en anmodning til kontakten
  const email = `anna-${id}@example.com`;
  const anna = await createContact(page, `Anna Anmelder ${id}`, email);
  await winDealFor(page, anna, `Køkken ${id}`);
  await page.goto("/indstillinger/anmeldelser");
  const recent = page.getByRole("list", { name: "Seneste anmodninger" });
  await expect(recent).toContainText(`Anna Anmelder ${id}`);
  await expect(recent).toContainText("Planlagt");

  // En kontakt markeret "ønsker ikke e-mails" får ingen anmodning
  const bo = await createContact(page, `Bo Nej-tak ${id}`, `bo-${id}@example.com`);
  await page.getByRole("button", { name: "Markér: ønsker ikke e-mails" }).click();
  await expect(page.locator("dl").first()).toContainText("Ønsker ikke e-mails");
  await winDealFor(page, bo, `Bad ${id}`);
  const boRequests = await testSql("select count(*)::int as n from review_requests where contact_id = $1", [bo]);
  expect(boRequests.rows[0].n).toBe(0);

  // Morgenkørslen sender e-mailen med firmaets navn og et afmeldingslink
  expect((await runCron(request)).reviewRequests).toBeGreaterThanOrEqual(1);
  const [mail] = await emailTo(request, email, /Hvordan var din oplevelse/);
  expect(mail.subject).toContain(`Anmeldfirma ${id}`);
  const link = mail.text.match(/Skriv en anmeldelse: (\S+)/)?.[1];
  expect(link).toBeTruthy();
  expect(mail.text).toContain(`${link}/afmeld`);

  // Klik sender videre til anmeldelsessiden og registreres
  const click = await request.get(link!, { maxRedirects: 0 });
  expect(click.status()).toBe(302);
  expect(click.headers()["location"]).toBe("http://localhost:3999/anmeld-os");
  await page.goto("/indstillinger/anmeldelser");
  await expect(recent).toContainText("Klikket");
  await page.goto(`/kunder/${anna}`);
  await expect(page.locator("ol")).toContainText("Anmodning om anmeldelse sendt");

  // Kunden afmelder sig selv via linket
  const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const cp = await customer.newPage();
  await cp.goto(`${link}/afmeld`);
  await expect(cp.locator("h1")).toContainText(`Anmeldfirma ${id}`);
  await cp.getByRole("button", { name: "Afmeld" }).click();
  await expect(cp.getByRole("status")).toContainText("Du er afmeldt");
  await customer.close();
  await page.goto(`/kunder/${anna}`);
  await expect(page.locator("dl").first()).toContainText("Ønsker ikke e-mails");

  await switchWorkspace(page, OWNER.company);
});

test("persondata: eksport, fuld sletning og automatisk sletning af gamle leads", async ({ page, request }) => {
  const id = uid();
  await createWorkspace(page, `Persondatafirma ${id}`);

  // En person med note, en privat deal og en deal med en virksomhed
  await page.goto("/virksomheder/ny");
  await page.fill("#co-name", `Erhverv ${id} ApS`);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await expect(page.locator("h1")).toHaveText(`Erhverv ${id} ApS`);
  const dorthe = await createContact(page, `Dorthe Data ${id}`, `dorthe-${id}@example.com`);
  await page.fill("#activity-body", `Ringede om køkken ${id}`);
  await page.getByRole("button", { name: "Tilføj" }).first().click();
  await expect(page.locator("ol")).toContainText(`Ringede om køkken ${id}`);
  await page.goto(`/pipeline/ny?kontakt=${dorthe}`);
  await page.fill("#d-title", `Privat ${id}`);
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("h1")).toHaveText(`Privat ${id}`);
  await page.goto(`/pipeline/ny?kontakt=${dorthe}`);
  await page.fill("#d-title", `Firmadeal ${id}`);
  await page.selectOption("#d-company", { label: `Erhverv ${id} ApS` });
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("h1")).toHaveText(`Firmadeal ${id}`);

  // Eksport indeholder alt om personen
  const res = await page.request.get(`/kunder/${dorthe}/persondata`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const data = await res.json();
  expect(data.person.navn).toBe(`Dorthe Data ${id}`);
  expect(data.dataansvarlig.name).toBe(`Persondatafirma ${id}`);
  expect(JSON.stringify(data.aktiviteter)).toContain(`Ringede om køkken ${id}`);
  expect(data.deals.map((d: { title: string }) => d.title).sort()).toEqual([`Firmadeal ${id}`, `Privat ${id}`]);

  // Fuld sletning: personen, noter og den private deal forsvinder; firmadealen bevares uden person
  await page.goto(`/kunder/${dorthe}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Slet alle data om personen" }).click();
  await expect(page.getByText("Alle data om personen er slettet.")).toBeVisible();
  const left = await testSql(
    `select (select count(*)::int from contacts where id = $1) as contacts,
            (select count(*)::int from activities where contact_id = $1) as activities,
            (select count(*)::int from deals where title = $2) as private_deals,
            (select count(*)::int from deals where title = $3 and contact_id is null) as company_deals`,
    [dorthe, `Privat ${id}`, `Firmadeal ${id}`],
  );
  expect(left.rows[0]).toEqual({ contacts: 0, activities: 0, private_deals: 0, company_deals: 1 });

  // Automatisk sletning: et lead uden aktivitet i 3 år slettes, et nyt lead bevares
  const old = await createContact(page, `Gammel Gert ${id}`);
  const fresh = await createContact(page, `Ny Nina ${id}`);
  await testSql(
    "update contacts set created_at = now() - interval '3 years', updated_at = now() - interval '3 years' where id = $1",
    [old],
  );
  await testSql("update activities set created_at = now() - interval '3 years' where contact_id = $1", [old]);
  await page.goto("/indstillinger/persondata");
  await expect(page.getByRole("list", { name: "Leads der ville blive slettet nu" })).toContainText(
    "Med 12 måneder ville 1 lead blive slettet i dag.",
  );
  await page.selectOption("#retention", { label: "12 måneder" });
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByRole("status")).toContainText("Automatisk sletning er slået til");

  expect((await runCron(request)).leadsDeleted).toBeGreaterThanOrEqual(1);
  const after = await testSql("select id from contacts where id = any($1::uuid[])", [[old, fresh]]);
  expect(after.rows.map((r) => r.id)).toEqual([fresh]);

  await switchWorkspace(page, OWNER.company);
});
