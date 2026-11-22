import { expect, test } from "@playwright/test";
import { uid } from "./helpers";

test("søgning med Ctrl+K finder kunder og deals, og '+ Ny' opretter hurtigt", async ({ page }) => {
  const id = uid();
  const name = `Søgbar Sørensen ${id}`;
  await page.goto("/kunder/ny");
  await page.fill("#c-name", name);
  await page.fill("#c-phone", "40506070");
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(name);

  // Ctrl+K åbner søgningen; Enter åbner det valgte resultat
  await page.goto("/dashboard");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Søg" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Søgeord").fill(`sørensen ${id}`);
  await expect(dialog.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("h1")).toHaveText(name);

  // Telefonnummer virker også, og Esc lukker
  await page.getByRole("button", { name: "Søg og genveje" }).click();
  await dialog.getByLabel("Søgeord").fill("40506070");
  await expect(dialog.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Genveje: "ny d" → Ny deal
  await page.keyboard.press("Control+k");
  await dialog.getByLabel("Søgeord").fill("ny de");
  await expect(dialog.getByRole("option").first()).toContainText("Ny deal");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/pipeline\/ny$/);

  // "+ Ny" → Kontakt
  await page.getByRole("button", { name: "+ Ny" }).click();
  await page.getByRole("menu", { name: "Opret ny" }).getByRole("menuitem", { name: "Kontakt" }).click();
  await expect(page).toHaveURL(/\/kunder\/ny$/);
  await expect(page.getByRole("menu", { name: "Opret ny" })).toHaveCount(0);
});
