import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, OWNER, switchWorkspace, uid } from "./helpers";

async function newContact(page: Page, name: string) {
  await page.goto("/kunder/ny");
  await page.fill("#c-name", name);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(name);
}

test("kundeliste: sortering, filter på ansvarlig og masse-handlinger", async ({ page }) => {
  const id = uid();
  const a = `Bo Bulk ${id}`;
  const b = `Alma Bulk ${id}`;
  await newContact(page, a);
  await newContact(page, b);

  // Sortering efter navn
  await page.goto(`/kunder?q=${id}&sort=navn`);
  const names = page.locator("tbody tr td:nth-child(2) a");
  await expect(names).toHaveText([b, a]);

  // Vælg begge og gør dem til kunder
  await page.getByLabel("Vælg alle på siden").check();
  const bar = page.getByRole("region", { name: "Handlinger for valgte" });
  await expect(bar).toContainText("2 valgt");
  await bar.getByLabel("Handling").selectOption({ label: "Status: Kunde" });
  await bar.getByRole("button", { name: "Udfør" }).click();
  await expect(page.getByRole("status")).toContainText("2 kontakter har fået status Kunde");
  await expect(page.locator("tbody")).not.toContainText("Lead");

  // Fjern ansvarlig på begge, gør mig ansvarlig for den ene og filtrér på "Mine kunder"
  await page.getByLabel("Vælg alle på siden").check();
  await bar.getByLabel("Handling").selectOption({ label: "Ingen ansvarlig" });
  await bar.getByRole("button", { name: "Udfør" }).click();
  await expect(page.getByRole("status")).toContainText("2 kontakter har fået ny ansvarlig");
  await page.getByLabel(`Vælg ${a}`).check();
  await bar.getByLabel("Handling").selectOption({ label: "Gør mig ansvarlig" });
  await bar.getByRole("button", { name: "Udfør" }).click();
  await expect(page.getByRole("status")).toContainText("1 kontakt har fået ny ansvarlig");
  await page.goto(`/kunder?q=${id}&ansvarlig=mig`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(a);

  // Slet begge (med bekræftelse)
  await page.goto(`/kunder?q=${id}`);
  await page.getByLabel("Vælg alle på siden").check();
  await bar.getByLabel("Handling").selectOption({ label: "Slet" });
  page.once("dialog", (d) => d.accept());
  await bar.getByRole("button", { name: "Udfør" }).click();
  await expect(page.getByRole("status")).toContainText("2 kontakter er slettet");
  await expect(page.getByText("Ingen kontakter matcher din søgning.")).toBeVisible();
});

test("bundmenu på telefonen og 'Kom godt i gang' for nye firmaer", async ({ page }) => {
  const id = uid();
  await createWorkspace(page, `Ny start ${id}`);

  const guide = page.getByRole("region", { name: "Kom godt i gang" });
  await page.goto("/dashboard");
  await expect(guide).toContainText("0 af 6 klaret");
  await newContact(page, `Første ${id}`);
  await page.goto("/dashboard");
  await expect(guide).toContainText("1 af 6 klaret");
  await guide.getByRole("button", { name: "Skjul" }).click();
  await expect(guide).toHaveCount(0);

  // Telefon: bundmenu med Mere og Søg
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const bottom = page.getByRole("navigation", { name: "Bundmenu" });
  await expect(bottom).toBeVisible();
  await bottom.getByRole("button", { name: "Mere" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Opgaver" }).click();
  await expect(page).toHaveURL(/\/opgaver$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await bottom.getByRole("button", { name: "Søg" }).click();
  await expect(page.getByRole("dialog", { name: "Søg" })).toBeVisible();
  await page.keyboard.press("Escape");
  await bottom.getByRole("link", { name: "Kunder" }).click();
  await expect(page).toHaveURL(/\/kunder$/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await switchWorkspace(page, OWNER.company);
});
