import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { uid } from "./helpers";

test("CVR-opslag udfylder virksomheden og advarer om reklamebeskyttelse", async ({ page }) => {
  await page.goto("/virksomheder/ny");
  await page.waitForLoadState("networkidle");
  await page.fill("#cvr-search", "99999999");
  await page.getByRole("button", { name: "Hent", exact: true }).click();
  await expect(page.getByText("Ingen virksomhed fundet i CVR.")).toBeVisible();

  await page.fill("#cvr-search", "12345678");
  await page.getByRole("button", { name: "Hent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Udfyldt med TESTFIRMA ApS");
  await expect(page.locator("#co-name")).toHaveValue("TESTFIRMA ApS");
  await expect(page.locator("#co-cvr")).toHaveValue("12345678");
  await expect(page.locator("#co-address")).toHaveValue("Testvej 1, 8000 Aarhus C");
  await expect(page.getByText("reklamebeskyttet")).toBeVisible();
});

test("import fra dansk Excel-CSV: kolonner genkendes, dubletter og fejl springes over", async ({ page }) => {
  const id = uid();
  // Eksisterende kontakt, som importen skal genkende som dublet
  await page.goto("/kunder/ny");
  await page.fill("#c-name", `Findes Allerede ${id}`);
  await page.fill("#c-email", `findes-${id}@example.com`);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(`Findes Allerede ${id}`);

  const csv = [
    "Fornavn;Efternavn;E-mail;Tlf;Firma;Status;Bemærkning",
    `Søren;Ærø ${id};soren-${id}@example.com;+45 2${id.length}11 22 33;Østergaard ${id} ApS;Kunde;Ringer i næste uge`,
    `Åse;Ølgaard ${id};findes-${id}@example.com;;;;`,
    `;;;;;;Tom række uden kontaktinfo`,
    `Bo;Fejl ${id};ikke-en-mail;;Østergaard ${id} ApS;Lead;`,
  ].join("\r\n");
  // Dansk Excel gemmer CSV i Windows-1252, ikke UTF-8
  const bytes = Buffer.from(
    Array.from(csv).map((ch) => ({ Æ: 0xc6, Ø: 0xd8, Å: 0xc5, æ: 0xe6, ø: 0xf8, å: 0xe5 })[ch] ?? ch.charCodeAt(0)),
  );

  await page.goto("/kunder/import");
  await page.waitForLoadState("networkidle");
  await page.setInputFiles("#import-file", { name: "kunder.csv", mimeType: "text/csv", buffer: bytes });
  await expect(page.getByText("4 rækker fundet")).toBeVisible();
  await expect(page.locator("#map-firstName option:checked")).toHaveText("Fornavn");
  await expect(page.locator("#map-email option:checked")).toHaveText("E-mail");
  await expect(page.locator("#map-phone option:checked")).toHaveText("Tlf");
  await expect(page.locator("#map-company option:checked")).toHaveText("Firma");
  await expect(page.locator("#map-note option:checked")).toHaveText("Bemærkning");

  await page.getByRole("button", { name: "Importér 4 rækker" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("2 kontakter importeret");
  await expect(status).toContainText("1 nye virksomheder oprettet");
  await expect(status).toContainText("1 sprunget over");
  await status.getByText("rækker med bemærkninger").click();
  await expect(status).toContainText("Række 4: Mangler navn, e-mail og telefon");
  await expect(status).toContainText('Ugyldig e-mail "ikke-en-mail"');

  await page.goto(`/kunder?q=${id}`);
  await expect(page.locator("tbody tr")).toHaveCount(3); // Søren, Bo og den eksisterende
  await page.getByRole("link", { name: `Søren Ærø ${id}` }).click();
  await expect(page.locator("header")).toContainText(`Østergaard ${id} ApS`);
  await expect(page.locator("header")).toContainText("Kunde");
  await expect(page.locator("main")).toContainText("Import");
  await expect(page.locator("ol")).toContainText("Ringer i næste uge");
});

test("import fra Excel (.xlsx)", async ({ page }) => {
  const id = uid();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Kunder");
  sheet.addRow(["Navn", "Email", "Telefon"]);
  sheet.addRow([`Xenia Xlsx ${id}`, `xenia-${id}@example.com`, 90000000 + Math.floor(Math.random() * 9_999_999)]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  await page.goto("/kunder/import");
  await page.waitForLoadState("networkidle");
  await page.setInputFiles("#import-file", {
    name: "kunder.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.getByText("1 rækker fundet")).toBeVisible();
  await page.getByRole("button", { name: "Importér 1 rækker" }).click();
  await expect(page.getByRole("status")).toContainText("1 kontakter importeret");
  await page.goto(`/kunder?q=${id}`);
  await expect(page.locator("tbody")).toContainText(`Xenia Xlsx ${id}`);
});
