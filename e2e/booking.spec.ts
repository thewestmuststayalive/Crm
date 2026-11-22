import { expect, test, type Browser, type Page } from "@playwright/test";
import { createWorkspace, danishDate, emailsTo, OWNER, switchWorkspace, uid } from "./helpers";

/** En kunde (ikke logget ind) åbner bookinglinket. */
async function customerPage(browser: Browser, link: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(link);
  return { ctx, page };
}

/** Vælger ydelse, dag (antal dage fra i dag) og tid på bookingsiden. */
async function pickSlot(page: Page, service: string, dayIndex: number, time: string) {
  await page.getByRole("radio", { name: new RegExp(service) }).click();
  await page.getByRole("radiogroup", { name: "Dag" }).getByRole("radio").nth(dayIndex).click();
  await expect(page.getByRole("radiogroup", { name: "Tidspunkt" })).toBeVisible();
  await page.getByRole("radio", { name: time, exact: true }).click();
}

async function fillCustomer(page: Page, c: { name: string; phone: string; email: string; plate?: string }) {
  await page.getByLabel("Navn").fill(c.name);
  await page.getByLabel("Telefon").fill(c.phone);
  await page.getByLabel("E-mail (til bekræftelse)").fill(c.email);
  if (c.plate) await page.getByLabel("Nummerplade").fill(c.plate);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Book tid" }).click();
  await expect(page.getByRole("status")).toContainText("Din tid er booket");
}

test("booking: modul, ydelse, onlinebooking uden dobbeltbooking, kalender, bil, aflysning og påmindelse", async ({
  page,
  browser,
  request,
}) => {
  const id = uid();
  const service = `Indvendig rens ${id}`;
  await createWorkspace(page, `Bilpleje ${id}`);

  // Slå modulet til
  await page.goto("/indstillinger");
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");
  await expect(page.getByRole("link", { name: "Kalender" })).toBeVisible();

  // Ydelse, åbningstider og regler
  await page.goto("/indstillinger/booking");
  const add = page.locator("form", { hasText: "Ny ydelse" });
  await add.getByLabel("Navn på ydelse").fill(service);
  await add.getByLabel("Varighed i minutter").fill("120");
  await add.getByLabel("Pris i kr. inkl. moms").fill("1.200");
  await add.getByRole("button", { name: "Tilføj ydelse" }).click();
  await expect(page.getByRole("status")).toContainText(`Ydelsen "${service}" er oprettet`);
  // Åbent alle dage 8–16, så testen ikke afhænger af ugedagen
  for (const day of ["Lørdag", "Søndag"]) {
    await page.getByLabel(day, { exact: true }).check();
    await page.getByLabel(`${day} fra`).fill("08:00");
    await page.getByLabel(`${day} til`).fill("16:00");
  }
  await page.getByLabel("Kunden skal booke mindst (timer før)").fill("0");
  await page.getByRole("button", { name: "Gem", exact: true }).last().click();
  await expect(page.getByText("Gemt.", { exact: true })).toBeVisible();
  const link = await page.getByRole("textbox", { name: "Bookinglink" }).inputValue();
  expect(link).toMatch(/\/book\/[A-Za-z0-9_-]+$/);

  // Kunde A booker i overmorgen kl. 10
  const a = { name: `Anders Auto ${id}`, phone: "22334455", email: `anders-${id}@example.com`, plate: "ab 12 345" };
  const A = await customerPage(browser, link);
  await expect(A.page.locator("h1")).toHaveText(`Book tid hos Bilpleje ${id}`);
  await pickSlot(A.page, service, 2, "10:00");
  await fillCustomer(A.page, a);
  const [confirmation] = await emailsTo(request, a.email);
  expect(confirmation.subject).toContain(service);
  expect(confirmation.text).toContain("AB 12 345");
  const cancelLink = confirmation.text.match(/https?:\/\/\S+\/book\/aflys\/[A-Za-z0-9_-]+/)?.[0];
  expect(cancelLink).toBeTruthy();
  expect((await emailsTo(request, OWNER.email)).some((m) => m.subject === `Ny booking: ${a.name}`)).toBe(true);

  // Kunde B kan ikke få den optagne tid (én plads, 2 timer), men booker i morgen kl. 8
  const b = { name: `Bente Bil ${id}`, phone: "33445566", email: `bente-${id}@example.com` };
  const B = await customerPage(browser, link);
  await B.page.getByRole("radio", { name: new RegExp(service) }).click();
  await B.page.getByRole("radiogroup", { name: "Dag" }).getByRole("radio").nth(2).click();
  const times = B.page.getByRole("radiogroup", { name: "Tidspunkt" });
  await expect(times.getByRole("radio", { name: "12:00", exact: true })).toBeVisible();
  await expect(times.getByRole("radio", { name: "10:00", exact: true })).toHaveCount(0);
  await expect(times.getByRole("radio", { name: "09:00", exact: true })).toHaveCount(0);
  await pickSlot(B.page, service, 1, "08:00");
  await fillCustomer(B.page, b);
  await B.ctx.close();

  // Personalet ser bookingen i kalenderen med bil og kunde
  await page.goto(`/kalender?uge=${danishDate(2)}`);
  await page
    .locator('[data-calendar="week"]')
    .getByRole("link", { name: new RegExp(`10:00 ${service}.*${a.name}`) })
    .click();
  await expect(page.locator("h1")).toContainText(a.name);
  await expect(page.locator("dl").first()).toContainText("AB 12 345");
  await page.getByRole("link", { name: a.name }).click();
  await expect(page.getByRole("list", { name: "Biler" })).toContainText("AB 12 345");
  await expect(page.getByRole("list", { name: "Bookinger" })).toContainText(service);

  // Søgning på nummerplade finder kunden
  await page.goto("/kunder?q=ab12345");
  await expect(page.getByRole("link", { name: a.name })).toBeVisible();

  // Manuel booking på en fuld tid afvises, medmindre man vælger at booke alligevel
  await page.goto("/kalender/ny");
  await page.getByLabel("Navn").fill(`Walk-in ${id}`);
  await page.getByLabel("Ydelse").selectOption({ label: service });
  await expect(page.getByLabel("Varighed (minutter)")).toHaveValue("120");
  await page.getByLabel("Dato").fill(danishDate(2));
  await page.getByLabel("Tidspunkt").fill("10:30");
  await page.getByRole("button", { name: "Opret booking" }).click();
  await expect(page.getByText("Der er ikke flere ledige pladser")).toBeVisible();
  await page.getByLabel("Book alligevel").check();
  await page.getByRole("button", { name: "Opret booking" }).click();
  await expect(page.locator("h1")).toContainText(`Walk-in ${id}`);

  // Kunde A aflyser selv via linket – tiden bliver ledig igen
  await A.page.goto(cancelLink!);
  A.page.once("dialog", (d) => d.accept());
  await A.page.getByRole("button", { name: "Aflys tid" }).click();
  await expect(A.page.getByRole("status")).toContainText("Din tid er aflyst");
  await A.ctx.close();
  expect((await emailsTo(request, OWNER.email)).some((m) => m.subject === `Aflyst: ${a.name}`)).toBe(true);

  // Morgenkørslen sender påmindelse til kunde B (booket i morgen)
  const cron = await request.get("/api/cron/daily", { headers: { authorization: "Bearer test-cron" } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).bookingReminders).toBeGreaterThanOrEqual(1);
  expect((await emailsTo(request, b.email)).some((m) => m.subject.startsWith("Påmindelse:"))).toBe(true);

  // Gennemført gør kunden til kunde
  await page.goto(`/kalender?uge=${danishDate(1)}`);
  await page
    .locator('[data-calendar="week"]')
    .getByRole("link", { name: new RegExp(`08:00 ${service}`) })
    .click();
  await page.getByRole("button", { name: "Gennemført" }).click();
  await expect(page.locator("header")).toContainText("Gennemført");
  await page.getByRole("link", { name: b.name }).click();
  await expect(page.locator("header")).toContainText("Kunde");

  await switchWorkspace(page, OWNER.company);
});
