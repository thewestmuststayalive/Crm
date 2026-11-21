import { expect, test as setup } from "@playwright/test";
import { OWNER } from "./helpers";

// Den første bruger registrerer sig og bliver ejer. Login gemmes til de andre tests.
setup("første bruger opretter konto og bliver ejer", async ({ page }) => {
  await page.goto("/registrer");
  await page.fill("#name", OWNER.name);
  await page.fill("#email", OWNER.email);
  await page.fill("#password", OWNER.password);
  await page.fill("#company", OWNER.company);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("h1")).toContainText("Hej Olivia");
  await page.context().storageState({ path: "e2e/.auth/owner.json" });
});
