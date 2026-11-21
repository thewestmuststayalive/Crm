import { expect, test } from "@playwright/test";
import { OWNER, switchWorkspace, uid } from "./helpers";

test("egne salgsfaser og flere pipelines", async ({ page }) => {
  const id = uid();
  const firma = `Fasefirma ${id}`;

  // Eget firma til testen, så standardfaserne i de andre tests ikke ændres
  await page.goto("/indstillinger");
  await page.fill("#ws-name", firma);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(`Du arbejder i ${firma}`);

  await page.goto("/indstillinger/salgsfaser");
  const salg = page.getByRole("region", { name: "Pipeline Salg" });
  const stageNames = () => salg.locator("ol > li").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await expect.poll(stageNames).toEqual(["Fase Ny", "Fase Kontaktet", "Fase Tilbud sendt", "Fase Vundet", "Fase Tabt"]);

  // Ny åben fase placeres før de lukkede faser
  await salg.getByPlaceholder("Ny fase").fill("Besigtigelse");
  await salg.getByRole("button", { name: "Tilføj fase" }).click();
  await expect(page.getByRole("status")).toContainText('Fasen "Besigtigelse" er tilføjet');
  await expect
    .poll(stageNames)
    .toEqual(["Fase Ny", "Fase Kontaktet", "Fase Tilbud sendt", "Fase Besigtigelse", "Fase Vundet", "Fase Tabt"]);

  // Flyt den op foran "Tilbud sendt"
  await salg.getByRole("button", { name: "Flyt Besigtigelse op" }).click();
  await expect
    .poll(stageNames)
    .toEqual(["Fase Ny", "Fase Kontaktet", "Fase Besigtigelse", "Fase Tilbud sendt", "Fase Vundet", "Fase Tabt"]);

  // En deal i den nye fase vises i kolonnen på tavlen
  await page.goto("/pipeline/ny");
  await page.fill("#d-title", `Tagrenovering ${id}`);
  await page.selectOption("#d-stage", { label: "Besigtigelse" });
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("header")).toContainText("Besigtigelse");
  await page.goto("/pipeline");
  await expect(page.locator('section[data-stage-name="Besigtigelse"]')).toContainText(`Tagrenovering ${id}`);

  // Sletning af en fase med deals kræver at de flyttes
  await page.goto("/indstillinger/salgsfaser");
  const row = salg.getByRole("listitem", { name: "Fase Besigtigelse" });
  await row.getByLabel("Flyt deals til").selectOption({ label: "Flyt til Ny" });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Slet" }).click();
  await expect(page.getByRole("status")).toContainText('1 deals er flyttet til "Ny"');
  await page.goto("/pipeline");
  await expect(page.locator('section[data-stage-name="Ny"]')).toContainText(`Tagrenovering ${id}`);

  // Endnu en pipeline med egne faser og faneblade på tavlen
  await page.goto("/indstillinger/salgsfaser");
  await page.fill("#new-pipeline", "Service");
  await page.getByRole("button", { name: "Opret pipeline" }).click();
  await expect(page.getByRole("status")).toContainText('Pipelinen "Service" er oprettet');
  await page.goto("/pipeline");
  await page.getByRole("navigation", { name: "Pipelines" }).getByRole("link", { name: "Service" }).click();
  await expect(page.locator('section[data-stage-name="Ny"]')).not.toContainText(`Tagrenovering ${id}`);

  await switchWorkspace(page, OWNER.company);
});
