import { expect, test } from "@playwright/test";
import { OWNER, switchWorkspace, uid } from "./helpers";

test("dashboard viser nøgletal, og 'Alle firmaer' samler leads på tværs", async ({ page }) => {
  const id = uid();
  const other = `Datterselskab ${id}`;
  const leadName = `Lars Lead ${id}`;

  // Opret et ekstra firma med et lead i
  await page.goto("/indstillinger");
  await page.fill("#ws-name", other);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(`Du arbejder i ${other}`);
  await page.goto("/kunder/ny");
  await page.fill("#c-name", leadName);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(leadName);

  // Tilbage i hovedfirmaet ses leadet ikke …
  await switchWorkspace(page, OWNER.company);
  for (const label of ["Nye kontakter", "Åben pipeline", "Vundet i måneden", "Forfaldne opgaver", "Venter på svar"]) {
    await expect(page.locator("main")).toContainText(label);
  }
  await expect(page.locator("main")).not.toContainText(leadName);

  // … men i "Alle firmaer" gør det, og linket skifter til det rigtige firma
  await page.getByRole("link", { name: "Alle firmaer" }).click();
  await expect(page.locator("main")).toContainText("Samlet overblik");
  await expect(page.locator("main")).toContainText(other);
  await page.getByRole("link", { name: leadName }).click();
  await expect(page.locator("h1")).toHaveText(leadName);
  await expect(page.locator("#workspace option:checked")).toHaveText(other);

  await switchWorkspace(page, OWNER.company);
});

test("firmaskift accepterer kun egne firmaer og interne adresser", async ({ page }) => {
  await page.goto("/skift?firma=00000000-0000-0000-0000-000000000000&til=/kunder");
  await expect(page).toHaveURL(/\/kunder$/);
  await expect(page.locator("#workspace option:checked")).toHaveText(OWNER.company);

  await page.goto("/skift?firma=x&til=//eksempel.dk");
  await expect(page).toHaveURL(/localhost:\d+\/dashboard/);
});
