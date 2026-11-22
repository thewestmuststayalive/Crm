import { expect, test } from "@playwright/test";
import { createWorkspace, danishDate, emailsTo, OWNER, switchWorkspace, uid } from "./helpers";
import { testSql } from "./db";

test("projekter fra skabelon, månedsrapport til kunden (link og e-mail)", async ({ page, browser, request }) => {
  const id = uid();
  const company = `Klient ${id} ApS`;
  const clientEmail = `klient-${id}@example.com`;
  await createWorkspace(page, `Bureau P ${id}`);
  await page.goto("/indstillinger");
  await page.getByLabel(/Tid og projekter/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("link", { name: "Projekter", exact: true })).toBeVisible();

  await page.goto("/virksomheder/ny");
  await page.fill("#co-name", company);
  await page.fill("#co-email", clientEmail);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await expect(page.locator("h1")).toHaveText(company);

  // Skabeloner: startskabeloner og en egen
  await page.goto("/projekter/skabeloner");
  await page.getByRole("button", { name: "Tilføj startskabeloner" }).click();
  await expect(page.getByRole("listitem", { name: "Skabelon Onboarding af ny kunde" })).toBeVisible();
  const create = page.locator("form", { hasText: "Opret skabelon" });
  await create.getByLabel("Navn").fill(`Hjemmeside ${id}`);
  await create.getByLabel(/Opgaver/).fill("Opstart | 0\nDesign | 7\nLancering | 21");
  await create.getByRole("button", { name: "Opret skabelon" }).click();
  await expect(page.getByRole("listitem", { name: `Skabelon Hjemmeside ${id}` })).toContainText("3 opgaver");

  // Projekt fra skabelon: opgaverne oprettes med frister
  await page.goto("/projekter");
  await page.getByLabel("Projektnavn").fill(`Web ${id}`);
  await page.locator("#p-company").selectOption({ label: company });
  await page.getByLabel("Skabelon").selectOption({ label: `Hjemmeside ${id}` });
  await page.getByRole("button", { name: "Opret projekt" }).click();
  await expect(page.locator("h1")).toHaveText(`Web ${id}`);
  await expect(page.getByRole("heading", { name: "Opgaver (0/3 udført)" })).toBeVisible();
  await page.getByRole("button", { name: "Markér som udført: Opstart" }).click();
  await expect(page.getByRole("heading", { name: "Opgaver (1/3 udført)" })).toBeVisible();
  await page.fill("#task-title", `Ekstra side ${id}`);
  await page.getByRole("button", { name: "Opret opgave" }).click();
  await expect(page.getByRole("heading", { name: "Opgaver (1/4 udført)" })).toBeVisible();

  // Tid på kunden
  await page.goto("/tid");
  const form = page.locator("form", { hasText: "Registrér tid" });
  await form.getByLabel("Tid", { exact: true }).fill("2:00");
  await form.getByLabel("Kunde").selectOption({ label: company });
  await form.getByLabel("Beskrivelse").fill(`Design af forside ${id}`);
  await form.getByRole("button", { name: "Registrér tid" }).click();
  await expect(page.getByRole("status")).toContainText("Tiden er registreret");

  // Virksomhedssiden: projektet og rapportlinket
  await page.goto("/virksomheder");
  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("list", { name: "Projekter" })).toContainText(`Web ${id}`);
  const reportHref = await page.getByRole("link", { name: /Se rapport for/ }).getAttribute("href");
  const reportBase = reportHref!.split("?")[0];

  // Kunden åbner rapporten for denne måned (uden login)
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const client = await ctx.newPage();
  await client.goto(`${reportBase}?maaned=${danishDate().slice(0, 7)}`);
  await expect(client.locator("h1")).toHaveText(`Månedsrapport for ${company}`);
  await expect(client.getByRole("region", { name: "Nøgletal" })).toContainText("2:00");
  await expect(client.getByRole("region", { name: "Arbejde" })).toContainText(`Design af forside ${id}`);
  await expect(client.getByRole("region", { name: "Udførte opgaver" })).toContainText("Opstart");
  await ctx.close();

  // Send sidste måneds rapport nu og slå automatisk udsendelse til
  await page.getByRole("button", { name: /^Send rapport for/ }).click();
  await expect(page.getByText(`Rapporten er sendt til ${clientEmail}`)).toBeVisible();
  const [mail] = await emailsTo(request, clientEmail);
  expect(mail.subject).toContain("Månedsrapport for");
  expect(mail.text).toContain("/rapport/");
  await page.getByLabel("Send automatisk den 1. i hver måned").check();
  await page.getByRole("button", { name: "Gem", exact: true }).click();
  await expect(page.getByText("Rapporten sendes automatisk den 1.")).toBeVisible();
  const saved = await testSql("select report_enabled from companies where name = $1", [company]);
  expect(saved.rows[0].report_enabled).toBe(true);

  await switchWorkspace(page, OWNER.company);
});

test("påmindelse om ny behandling efter ydelsens interval, med afmelding", async ({ page, browser, request }) => {
  const id = uid();
  const service = `Coating ${id}`;
  const email = `coat-${id}@example.com`;
  await createWorkspace(page, `Bilpleje R ${id}`);
  await page.goto("/indstillinger");
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");

  await page.goto("/indstillinger/booking");
  const add = page.locator("form", { hasText: "Ny ydelse" });
  await add.getByLabel("Navn på ydelse").fill(service);
  await add.getByLabel("Varighed i minutter").fill("60");
  await add.getByLabel("Påmind kunden efter antal måneder").fill("12");
  await add.getByRole("button", { name: "Tilføj ydelse" }).click();
  await expect(page.getByRole("status")).toContainText("er oprettet");

  // Manuel booking for en ny kunde, markeret som gennemført
  await page.goto("/kalender/ny");
  await page.getByLabel("Navn").fill(`Carla Coat ${id}`);
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByLabel("Ydelse").selectOption({ label: service });
  await page.getByLabel("Nummerplade").fill("CD 34 567");
  await page.getByLabel("Dato").fill(danishDate(1));
  await page.getByLabel("Tidspunkt").fill("10:00");
  await page.getByLabel("Send bekræftelse til kunden på e-mail").uncheck();
  await page.getByRole("button", { name: "Opret booking" }).click();
  await page.getByRole("button", { name: "Gennemført" }).click();
  await expect(page.locator("header")).toContainText("Gennemført");

  // Lad som om behandlingen var for 12 måneder og 1 dag siden
  await testSql(
    `update bookings set starts_at = now() - interval '12 months 1 day', ends_at = now() - interval '12 months 1 day' + interval '1 hour'
     where service_name = $1`,
    [service],
  );
  const cron = async () =>
    (await (await request.get("/api/cron/daily", { headers: { authorization: "Bearer test-cron" } })).json()) as {
      serviceReminders: number;
    };
  expect((await cron()).serviceReminders).toBeGreaterThanOrEqual(1);
  const reminders = (await emailsTo(request, email)).filter((m) => m.subject.startsWith("Tid til"));
  expect(reminders).toHaveLength(1);
  expect(reminders[0].text).toContain("CD 34 567");
  expect(reminders[0].text).toMatch(/\/book\/[A-Za-z0-9_-]+/);
  // Kun én påmindelse
  await cron();
  expect((await emailsTo(request, email)).filter((m) => m.subject.startsWith("Tid til"))).toHaveLength(1);

  // Afmelding via linket
  const unsubscribe = reminders[0].text.match(/https?:\/\/\S+\/book\/afmeld\/[A-Za-z0-9_-]+/)?.[0];
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const customer = await ctx.newPage();
  await customer.goto(unsubscribe!);
  await customer.getByRole("button", { name: "Afmeld" }).click();
  await expect(customer.getByRole("status")).toContainText("Du er afmeldt");
  await ctx.close();
  const opted = await testSql("select email_opt_out_at is not null as out from contacts where email = $1", [email]);
  expect(opted.rows[0].out).toBe(true);

  await switchWorkspace(page, OWNER.company);
});
