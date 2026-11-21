import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { switchWorkspace, uid } from "./helpers";

test("kontakt med ny virksomhed, note, redigering, søgning og eksport", async ({ page }) => {
  const id = uid();
  const name = `Karen Kunde ${id}`;
  const company = `Kunde ApS ${id}`;

  // Opret kontakt og virksomhed i ét trin
  await page.goto("/kunder/ny");
  await page.fill("#c-name", name);
  await page.fill("#c-email", `karen-${id}@example.com`);
  await page.fill("#c-phone", "+45 12 34 56 78");
  await page.selectOption("#c-source", "WEBSITE");
  await page.fill("#c-newcompany", company);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page.getByRole("link", { name: company })).toBeVisible();

  // Tilføj en note
  await page.fill("#activity-body", "Ringede og aftalte møde i næste uge");
  await page.selectOption("#activity-type", "CALL");
  await page.getByRole("button", { name: "Tilføj" }).click();
  await expect(page.locator("ol")).toContainText("Ringede og aftalte møde");
  await expect(page.locator("ol")).toContainText("Opkald");

  // Redigér status til kunde
  await page.getByRole("link", { name: "Redigér" }).click();
  await page.selectOption("#c-status", "CUSTOMER");
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page.locator("header")).toContainText("Kunde");

  // Søgning og filter
  await page.goto(`/kunder?q=${encodeURIComponent(id)}`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.goto(`/kunder?q=${encodeURIComponent(id)}&status=LEAD`);
  await expect(page.locator("tbody tr")).toHaveCount(0);

  // Virksomheden viser kontaktpersonen og noten
  await page.goto(`/virksomheder?q=${encodeURIComponent(id)}`);
  await page.getByRole("link", { name: company }).click();
  await expect(page.locator("main")).toContainText(name);
  await expect(page.locator("ol")).toContainText("Ringede og aftalte møde");

  // CSV-eksport
  await page.goto(`/kunder?q=${encodeURIComponent(id)}`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Eksportér CSV" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain(name);
  expect(csv).toContain("+45 12 34 56 78");
  expect(csv).toContain("Hjemmeside");

  // Slet kontakten (ejer har lov)
  await page.getByRole("link", { name }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Slet", exact: true }).first().click();
  await expect(page).toHaveURL(/\/kunder$/);
  await page.goto(`/kunder?q=${encodeURIComponent(id)}`);
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("kontakter er adskilt mellem firmaer", async ({ page }) => {
  const id = uid();
  await page.goto("/kunder/ny");
  await page.fill("#c-name", `Hemmelig ${id}`);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(`Hemmelig ${id}`);
  const contactUrl = page.url();

  const other = `Andet firma ${id}`;
  await page.goto("/indstillinger");
  await page.fill("#ws-name", other);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(other);

  await page.goto(`/kunder?q=${id}`);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  const res = await page.goto(contactUrl);
  expect(res?.status()).toBe(404);

  await switchWorkspace(page, "Firma A");
});

test("ugyldigt id giver 404", async ({ page }) => {
  const res = await page.goto("/kunder/ikke-et-id");
  expect(res?.status()).toBe(404);
});
