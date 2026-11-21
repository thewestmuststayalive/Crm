import { expect, test } from "@playwright/test";
import { login, OWNER, switchWorkspace, uid } from "./helpers";

test.describe("uden login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("beskyttede sider sender til login", async ({ page }) => {
    await page.goto("/kunder");
    await expect(page).toHaveURL(/\/login/);
  });

  test("oprettelse er lukket, når der findes en bruger", async ({ page }) => {
    await page.goto("/registrer");
    await expect(page.locator("h1")).toContainText("Oprettelse er lukket");
  });

  test("forkert adgangskode afvises, og e-mailen bevares", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", OWNER.email);
    await page.fill("#password", "forkert-kode");
    await page.getByRole("button", { name: "Log ind" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Forkert" })).toContainText(
      "Forkert e-mail eller adgangskode",
    );
    await expect(page.locator("#email")).toHaveValue(OWNER.email);
  });
});

test("ejer opretter et nyt firma og kan skifte mellem firmaer", async ({ page }) => {
  const name = `Firma ${uid()}`;
  await page.goto("/indstillinger");
  await page.fill("#ws-name", name);
  await page.getByRole("button", { name: "Opret firma" }).click();
  await expect(page.locator("main")).toContainText(`Du arbejder i ${name}`);
  await switchWorkspace(page, OWNER.company);
});

test("medarbejder har begrænset adgang og ser kun sit eget firma", async ({ page, browser }) => {
  const email = `mette-${uid()}@example.com`;
  await page.goto("/indstillinger/medlemmer");
  await page.fill("#m-name", "Mette Medarbejder");
  await page.fill("#m-email", email);
  await page.fill("#m-password", "midlertidig1");
  await page.getByRole("button", { name: "Tilføj medlem" }).click();
  await expect(page.getByRole("status")).toContainText("er oprettet");
  await expect(page.locator("main")).toContainText(email);

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const member = await ctx.newPage();
  await login(member, email, "midlertidig1");

  const options = await member.locator("#workspace option").allTextContents();
  expect(options).toEqual([OWNER.company]);

  await member.goto("/indstillinger/medlemmer");
  await expect(member.getByRole("button", { name: "Tilføj medlem" })).toHaveCount(0);

  // En forfalsket firma-cookie må ikke give adgang til et andet firma.
  const otherId = await page.locator("#workspace option").last().getAttribute("value");
  await ctx.addCookies([{ name: "crm_workspace", value: otherId!, url: page.url() }]);
  await member.goto("/dashboard");
  await expect(member.locator("main")).toContainText(`Du arbejder i ${OWNER.company}`);

  await member.getByRole("button", { name: "Log ud" }).click();
  await expect(member).toHaveURL(/\/login/);
  await member.goto("/dashboard");
  await expect(member).toHaveURL(/\/login/);
  await ctx.close();
});
