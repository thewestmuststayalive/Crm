import { expect, test } from "@playwright/test";
import { createWorkspace, emailsTo, OWNER, switchWorkspace, uid } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("logo, firmafarve og egne e-mailtekster på kundesider; notifikationer kan slås fra pr. type", async ({
  page,
  browser,
  request,
}) => {
  const id = uid();
  const ws = `Brand ${id}`;
  const service = `Polering ${id}`;
  await createWorkspace(page, ws);

  // Udseende: farve og logo
  await page.goto("/indstillinger");
  await page.getByLabel("Firmafarve").fill("#cc3300");
  await page.getByLabel(/^Logo/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Gem udseende" }).click();
  await expect(page.getByText("Udseendet er gemt.")).toBeVisible();
  await page.reload();
  const logoSrc = await page.getByAltText(`Logo for ${ws}`).getAttribute("src");
  const logo = await request.get(logoSrc!);
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toBe("image/png");

  // Afvis forkert filtype
  await page.getByLabel(/^Logo/).setInputFiles({ name: "x.gif", mimeType: "image/gif", buffer: PNG });
  await page.getByRole("button", { name: "Gem udseende" }).click();
  await expect(page.getByText("Logoet skal være PNG, JPG eller WebP")).toBeVisible();

  // Booking slået til med en ydelse
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");
  await page.goto("/indstillinger/booking");
  const add = page.locator("form", { hasText: "Ny ydelse" });
  await add.getByLabel("Navn på ydelse").fill(service);
  await add.getByLabel("Varighed i minutter").fill("30");
  await add.getByRole("button", { name: "Tilføj ydelse" }).click();
  await page.getByLabel("Lørdag", { exact: true }).check();
  await page.getByLabel("Søndag", { exact: true }).check();
  for (const day of ["Lørdag", "Søndag"]) {
    await page.getByLabel(`${day} fra`).fill("08:00");
    await page.getByLabel(`${day} til`).fill("16:00");
  }
  await page.getByLabel("Kunden skal booke mindst (timer før)").fill("0");
  await page.getByRole("button", { name: "Gem", exact: true }).last().click();
  await expect(page.getByText("Gemt.", { exact: true })).toBeVisible();
  const link = await page.getByRole("textbox", { name: "Bookinglink" }).inputValue();

  // Egen tekst i bekræftelsen
  await page.goto("/indstillinger/e-mails");
  await page.getByLabel("Bekræftelse på booking").fill("Hej {navn}! Vi ses {tid} til {ydelse}.");
  await page.getByRole("button", { name: "Gem tekster" }).click();
  await expect(page.getByText("Teksterne er gemt.")).toBeVisible();

  // Ingen e-mail om nye bookinger til mig (men stadig i appen)
  await page.goto("/indstillinger/profil");
  await page.getByLabel("Nye bookinger").uncheck();
  await page.getByRole("button", { name: "Gem", exact: true }).first().click();
  await expect(page.getByText("Profilen er gemt")).toBeVisible();

  // Kunden ser logo og farve, og bekræftelsen bruger teksten og farven
  const email = `ida-${id}@example.com`;
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const c = await ctx.newPage();
  await c.goto(link);
  await expect(c.getByAltText(ws)).toBeVisible();
  await expect(c.locator("main")).toHaveAttribute("style", /--color-brand-700:\s*#cc3300/);
  await c.getByRole("radio", { name: new RegExp(service) }).click();
  // Første åbne dag efter den første (lukkede dage, fx søndag, kan ikke vælges).
  const days = c.getByRole("radiogroup", { name: "Dag" }).getByRole("radio");
  let day = 1;
  while (await days.nth(day).isDisabled()) day++;
  await days.nth(day).click();
  await c.getByRole("radio", { name: "09:00", exact: true }).click();
  await c.getByLabel("Navn").fill(`Ida Isen ${id}`);
  await c.getByLabel("Telefon").fill("50607080");
  await c.getByLabel("E-mail (til bekræftelse)").fill(email);
  await c.getByRole("checkbox").check();
  await c.getByRole("button", { name: "Book tid" }).click();
  await expect(c.getByRole("status")).toContainText("Din tid er booket");
  await ctx.close();

  const [mail] = await emailsTo(request, email);
  expect(mail.text).toContain(`Hej Ida! Vi ses`);
  expect(mail.text).toContain(`til ${service}.`);
  expect(mail.html).toContain("#cc3300");
  expect(mail.html).toContain(`/logo/`);
  expect((await emailsTo(request, OWNER.email)).some((m) => m.subject === `Ny booking: Ida Isen ${id}`)).toBe(false);
  await page.goto("/notifikationer");
  await expect(page.locator("main")).toContainText(`Ny booking: Ida Isen ${id}`);

  // Slå e-mail om bookinger til igen (ejeren deles med andre tests)
  await page.goto("/indstillinger/profil");
  await page.getByLabel("Nye bookinger").check();
  await page.getByRole("button", { name: "Gem", exact: true }).first().click();
  await expect(page.getByText("Profilen er gemt")).toBeVisible();

  await switchWorkspace(page, OWNER.company);
});
