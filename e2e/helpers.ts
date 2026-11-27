import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const OWNER = { name: "Olivia Ejer", email: "ejer@example.com", password: "hemmelig123", company: "Firma A" };

/** Unikt suffiks, så tests ikke støder ind i hinandens data. */
export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

type SentEmail = { to: string; subject: string; html: string; text: string };

/** Seneste e-mail sendt til `to` via den falske Resend-server (e2e/meta-mock.ts). */
export async function latestEmailTo(
  request: APIRequestContext,
  to: string,
): Promise<SentEmail & { link: string | null }> {
  const res = await request.get("http://localhost:3999/__requests");
  const log = (await res.json()) as { method: string; path: string; body: SentEmail }[];
  const email = log.filter((r) => r.method === "POST" && r.path === "/emails" && r.body.to === to).at(-1);
  if (!email) throw new Error(`Ingen e-mail sendt til ${to}`);
  const link = email.body.text.match(/https?:\/\/\S+\/nulstil\/[A-Za-z0-9_-]+/)?.[0] ?? null;
  return { ...email.body, link };
}

/** Vælger firma i firmavælgeren og venter på, at siden skifter. */
export async function switchWorkspace(page: Page, name: string) {
  await page.goto("/dashboard");
  await page.selectOption("#workspace", { label: name });
  await expect(page.locator("main")).toContainText(`Du arbejder i ${name}`);
}

/** Opretter et nyt firma og skifter til det. */
export async function createWorkspace(page: Page, name: string) {
  await page.goto("/indstillinger");
  await page.fill("#ws-name", name);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(`Du arbejder i ${name}`);
}

/** Dato i dansk tid, `days` dage fra i dag, som YYYY-MM-DD. */
export function danishDate(days = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Alle e-mails sendt til `to` via den falske Resend (nyeste sidst). */
export async function emailsTo(request: APIRequestContext, to: string) {
  const res = await request.get("http://localhost:3999/__requests");
  const log = (await res.json()) as { method: string; path: string; body: SentEmail }[];
  return log.filter((r) => r.method === "POST" && r.path === "/emails" && r.body.to === to).map((r) => r.body);
}

/** Slår booking til, opretter en ydelse og åbner alle dage 8–16 uden varsel. Returnerer bookinglinket. */
export async function setupBooking(page: Page, service: string, price = "800") {
  await page.goto("/indstillinger");
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");
  await page.goto("/indstillinger/booking");
  const add = page.locator("form", { hasText: "Ny ydelse" });
  await add.getByLabel("Navn på ydelse").fill(service);
  await add.getByLabel("Varighed i minutter").fill("60");
  await add.getByLabel("Pris i kr. inkl. moms").fill(price);
  await add.getByRole("button", { name: "Tilføj ydelse" }).click();
  await expect(page.getByRole("status")).toContainText(`Ydelsen "${service}" er oprettet`);
  for (const day of ["Lørdag", "Søndag"]) {
    await page.getByLabel(day, { exact: true }).check();
    await page.getByLabel(`${day} fra`).fill("08:00");
    await page.getByLabel(`${day} til`).fill("16:00");
  }
  await page.getByLabel("Kunden skal booke mindst (timer før)").fill("0");
  await page.getByRole("button", { name: "Gem", exact: true }).last().click();
  await expect(page.getByText("Gemt.", { exact: true })).toBeVisible();
  return page.getByRole("textbox", { name: "Bookinglink" }).inputValue();
}

/** En kunde (ikke logget ind) booker ydelsen om `dayIndex` dage kl. `time`. */
export async function bookAsCustomer(
  browser: import("@playwright/test").Browser,
  link: string,
  c: { service: string; name: string; phone: string; email: string; dayIndex?: number; time?: string },
) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByRole("radio", { name: new RegExp(c.service) }).click();
  await p.getByRole("radiogroup", { name: "Dag" }).getByRole("radio").nth(c.dayIndex ?? 2).click();
  await p.getByRole("radio", { name: c.time ?? "10:00", exact: true }).click();
  await p.getByLabel("Navn").fill(c.name);
  await p.getByLabel("Telefon").fill(c.phone);
  await p.getByLabel("E-mail (til bekræftelse)").fill(c.email);
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Book tid" }).click();
  await expect(p.getByRole("status")).toContainText("Din tid er booket");
  return { ctx, page: p };
}
