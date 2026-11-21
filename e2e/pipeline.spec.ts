import { expect, test } from "@playwright/test";
import { uid } from "./helpers";

function yesterdayIso() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test("deal fra kontakt, flyt i pipeline, vundet gør kontakten til kunde", async ({ page }) => {
  const id = uid();
  const contactName = `Peter Pipeline ${id}`;
  const dealTitle = `Hjemmeside ${id}`;

  await page.goto("/kunder/ny");
  await page.fill("#c-name", contactName);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(contactName);
  await expect(page.locator("header")).toContainText("Lead");

  // Opret deal fra kontaktsiden
  await page.getByRole("link", { name: "Ny deal" }).click();
  await expect(page.locator("#d-contact")).toHaveValue(/.+/);
  await page.fill("#d-title", dealTitle);
  await page.fill("#d-value", "12.500");
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("h1")).toHaveText(dealTitle);
  await expect(page.locator("header")).toContainText("12.500");
  await expect(page.locator("ol")).toContainText("oprettet");
  const dealUrl = page.url();

  // Træk kortet fra "Ny" til "Vundet"
  await page.goto("/pipeline");
  const card = page.locator("li", { hasText: dealTitle });
  await expect(page.locator('section[data-stage="NEW"]')).toContainText(dealTitle);
  await card.dragTo(page.locator('section[data-stage="WON"]'));
  await expect(page.locator('section[data-stage="WON"]')).toContainText(dealTitle);
  await page.reload();
  await expect(page.locator('section[data-stage="WON"]')).toContainText(dealTitle);

  // Kontakten er nu kunde, og faseskiftet står på tidslinjen
  await page.goto(dealUrl);
  await expect(page.locator("ol")).toContainText("flyttet fra Ny til Vundet");
  await page.getByRole("link", { name: contactName }).click();
  await expect(page.locator("header")).toContainText("Kunde");

  // Skift fase via dropdown på dealsiden
  await page.goto(dealUrl);
  await page.selectOption("#stage-select", "LOST");
  await expect(page.locator("header")).toContainText("Tabt");
});

test("opgave med frist i går vises som forfalden og kan markeres udført", async ({ page }) => {
  const title = `Ring tilbage ${uid()}`;
  await page.goto("/opgaver");
  await page.fill("#task-title", title);
  await page.fill("#task-due", yesterdayIso());
  await page.getByRole("button", { name: "Opret opgave" }).click();

  const overdue = page.locator("section", { has: page.getByRole("heading", { name: /Forfaldne/ }) });
  await expect(overdue).toContainText(title);
  await page.getByRole("button", { name: `Markér som udført: ${title}` }).click();

  const done = page.locator("section", { has: page.getByRole("heading", { name: "Senest udført" }) });
  await expect(done).toContainText(title);
  await expect(overdue).toHaveCount(0);
});
