import { expect, test } from "@playwright/test";
import { latestEmailTo, login, OWNER, switchWorkspace, uid } from "./helpers";

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

  test("for mange forkerte forsøg blokerer login midlertidigt", async ({ page }) => {
    const email = `gaet-${uid()}@example.com`;
    await page.goto("/login");
    for (let i = 0; i < 6; i++) {
      await page.fill("#email", email);
      await page.fill("#password", `forkert-${i}`);
      await page.getByRole("button", { name: "Log ind" }).click();
      const expected = i < 5 ? "Forkert e-mail eller adgangskode" : "For mange forkerte forsøg";
      await expect(page.getByRole("alert").filter({ hasText: expected })).toBeVisible();
      await page.waitForFunction(() => (document.querySelector("#password") as HTMLInputElement).value === "");
    }
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

test("medarbejder inviteres på e-mail, har begrænset adgang og ser kun sit eget firma", async ({ page, browser, request }) => {
  const email = `mette-${uid()}@example.com`;
  await page.goto("/indstillinger/medlemmer");
  await page.fill("#m-name", "Mette Medarbejder");
  await page.fill("#m-email", email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText(`Invitation sendt til ${email}`);
  await expect(page.locator("main")).toContainText(email);

  // Medarbejderen åbner invitationen og vælger selv adgangskode
  const invite = await latestEmailTo(request, email);
  expect(invite.subject).toContain("inviteret dig til Kundespor");
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const member = await ctx.newPage();
  await member.goto(invite.link!);
  await expect(member.locator("h1")).toHaveText("Velkommen, Mette");
  await member.fill("#password", "mettes-kode1");
  await member.fill("#confirm", "mettes-kode1");
  await member.getByRole("button", { name: "Kom i gang" }).click();
  await expect(member).toHaveURL(/\/dashboard/);

  // Linket kan kun bruges én gang
  await member.goto(invite.link!);
  await expect(member.locator("h1")).toHaveText("Linket virker ikke");

  // Glemt adgangskode: nyt link på e-mail, ny kode virker, den gamle gør ikke
  await member.goto("/dashboard");
  await member.getByRole("button", { name: "Log ud" }).click();
  await expect(member).toHaveURL(/\/login/);
  await member.getByRole("link", { name: "Glemt adgangskode?" }).click();
  await expect(member.locator("h1")).toHaveText("Glemt adgangskode");
  await member.fill("#email", email);
  await member.getByRole("button", { name: "Send link" }).click();
  await expect(member.getByRole("status")).toContainText("Hvis e-mailen findes");
  const reset = await latestEmailTo(request, email);
  expect(reset.subject).toContain("ny adgangskode");
  await member.goto(reset.link!);
  await member.fill("#password", "helt-ny-kode1");
  await member.fill("#confirm", "helt-ny-kode1");
  await member.getByRole("button", { name: "Gem adgangskode" }).click();
  await expect(member).toHaveURL(/\/dashboard/);
  await member.getByRole("button", { name: "Log ud" }).click();
  await member.fill("#email", email);
  await member.fill("#password", "mettes-kode1");
  await member.getByRole("button", { name: "Log ind" }).click();
  await expect(member.getByRole("alert").filter({ hasText: "Forkert" })).toBeVisible();
  await login(member, email, "helt-ny-kode1");

  const options = await member.locator("#workspace option").allTextContents();
  expect(options).toEqual([OWNER.company]);

  await member.goto("/indstillinger/medlemmer");
  await expect(member.getByRole("button", { name: "Send invitation", exact: true })).toHaveCount(0);

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
