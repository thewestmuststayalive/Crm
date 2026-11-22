import { expect, test } from "@playwright/test";
import { testSql } from "./db";
import { createWorkspace, OWNER, switchWorkspace, uid } from "./helpers";

test("aktivitetslog, download af alle data og sletning af firmaet", async ({ page }) => {
  const id = uid();
  const ws = `Datafirma ${id}`;
  await createWorkspace(page, ws);

  // En kontakt, der beholdes, og en der slettes
  for (const name of [`Bevar Bent ${id}`, `Slet Signe ${id}`]) {
    await page.goto("/kunder/ny");
    await page.fill("#c-name", name);
    await page.getByRole("button", { name: "Opret kontakt" }).click();
    await expect(page.locator("h1")).toHaveText(name);
  }
  page.once("dialog", (d) => d.accept());
  await page.locator("header").getByRole("button", { name: "Slet" }).click();
  await expect(page).toHaveURL(/\/kunder$/);

  // Logoet kontrolleres på indholdet
  await page.goto("/indstillinger");
  await page
    .getByLabel(/^Logo/)
    .setInputFiles({ name: "falsk.png", mimeType: "image/png", buffer: Buffer.from("<html>") });
  await page.getByRole("button", { name: "Gem udseende" }).click();
  await expect(page.getByText("Filen er ikke et gyldigt PNG-, JPG- eller WebP-billede")).toBeVisible();

  // Modulændring og sletning står i loggen
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");
  await page.goto("/indstillinger/data");
  const log = page.getByRole("list", { name: "Aktivitetslog" });
  await expect(log).toContainText(`Kontakt slettet · Slet Signe ${id}`);
  await expect(log).toContainText("Moduler ændret · Booking og biler");
  await expect(log).toContainText(OWNER.name);

  // Download af alle data – uden hemmeligheder
  const res = await page.request.get("/indstillinger/data/eksport");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  const data = JSON.parse(body);
  expect(data.firma.name).toBe(ws);
  expect(data.kontakter.map((c: { name: string }) => c.name)).toEqual([`Bevar Bent ${id}`]);
  expect(body).not.toContain("passwordHash");
  expect(body).not.toMatch(/"token"/);
  await page.reload();
  await expect(log).toContainText("Alle data downloadet");

  // Slet firmaet: knappen er låst, indtil navnet er skrevet korrekt
  const del = page.getByRole("button", { name: "Slet firmaet for altid" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Firmanavn").fill("forkert");
  await expect(del).toBeDisabled();
  await page.getByLabel("Firmanavn").fill(ws);
  await del.click();
  await expect(page).toHaveURL(/\/dashboard/);
  const left = await testSql("select count(*)::int as n from workspaces where name = $1", [ws]);
  expect(left.rows[0].n).toBe(0);
  const contacts = await testSql("select count(*)::int as n from contacts where name = $1", [`Bevar Bent ${id}`]);
  expect(contacts.rows[0].n).toBe(0);

  await switchWorkspace(page, OWNER.company);
});
