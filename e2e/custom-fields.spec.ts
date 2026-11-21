import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { OWNER, switchWorkspace, uid } from "./helpers";

test("egne felter: oprettes, udfyldes, valideres, eksporteres og slettes", async ({ page }) => {
  const id = uid();
  await page.goto("/indstillinger");
  await page.fill("#ws-name", `Feltfirma ${id}`);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(`Du arbejder i Feltfirma ${id}`);

  // Opret felter
  await page.goto("/indstillinger/felter");
  const contacts = page.getByRole("region", { name: "Felter for Kontaktpersoner" });
  const addField = async (region: typeof contacts, label: string, type: string, options = "") => {
    await region.getByPlaceholder("Navn på nyt felt").fill(label);
    await region.getByLabel("Felttype").selectOption({ label: type });
    if (options) await region.getByLabel("Valgmuligheder").last().fill(options);
    await region.getByRole("button", { name: "Tilføj felt" }).click();
    await expect(page.getByRole("status")).toContainText(`Feltet "${label}" er oprettet`);
  };
  await addField(contacts, "Fødselsdag", "Dato");
  await addField(contacts, "Nyhedsbrev", "Afkrydsning (ja/nej)");
  await addField(contacts, "Kundetype", "Valgliste", "Privat, Erhverv");
  await addField(page.getByRole("region", { name: "Felter for Deals" }), "Antal m²", "Tal");

  // Udfyld dem på en ny kontakt
  await page.goto("/kunder/ny");
  await page.fill("#c-name", `Felix Felt ${id}`);
  await page.getByLabel("Fødselsdag").fill("1990-01-05");
  await page.getByLabel("Nyhedsbrev").check();
  await page.getByLabel("Kundetype").selectOption("Erhverv");
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(`Felix Felt ${id}`);
  const info = page.locator("dl");
  await expect(info).toContainText("Fødselsdag");
  await expect(info).toContainText("1990");
  await expect(info).toContainText("Nyhedsbrev");
  await expect(info).toContainText("Ja");
  await expect(info).toContainText("Erhverv");

  // Ugyldigt tal afvises, og det indtastede bevares
  await page.goto("/pipeline/ny");
  await page.fill("#d-title", `Gulv ${id}`);
  await page.getByLabel("Antal m²").fill("mange");
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "skal være et tal" })).toContainText("Antal m² skal være et tal");
  await expect(page.getByLabel("Antal m²")).toHaveValue("mange");
  await page.getByLabel("Antal m²").fill("42,5");
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("dl")).toContainText("42,5");

  // Feltet kommer med i eksporten
  await page.goto("/kunder");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Eksportér CSV" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain("Kundetype");
  expect(csv).toContain("Erhverv");

  // Sletning fjerner feltet og værdierne
  await page.goto("/indstillinger/felter");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("listitem", { name: "Felt Kundetype" }).getByRole("button", { name: "Slet" }).click();
  await expect(page.getByRole("status")).toContainText('Feltet "Kundetype" er slettet');
  await page.goto(`/kunder?q=${id}`);
  await page.getByRole("link", { name: `Felix Felt ${id}` }).click();
  await expect(page.locator("dl")).not.toContainText("Erhverv");

  await switchWorkspace(page, OWNER.company);
});
