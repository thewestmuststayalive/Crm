import { expect, test } from "@playwright/test";
import { OWNER, latestEmailTo, uid } from "./helpers";

test("nyt lead: notifikation, e-mail, Venter på svar og svartid", async ({ page, request }) => {
  const id = uid();
  const leadName = `Vera Venter ${id}`;

  // En kontaktformular, hvor ejeren får de nye leads
  await page.goto("/indstillinger/kontaktformular");
  await page.fill("#lf-name", `venter-${id}.dk`);
  await page.getByRole("button", { name: "Opret formular" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const snippet = (await page.locator("section", { hasText: `venter-${id}.dk` }).locator("pre code").textContent())!;
  const endpoint = snippet.match(/action="([^"]+)"/)![1];

  const res = await request.post(endpoint, {
    headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 200)}.1` },
    data: { name: leadName, email: `vera-${id}@example.com`, message: "Kan I ringe mig op?" },
  });
  expect(res.status()).toBe(200);

  // Ejeren får en e-mail om det nye lead
  const mail = await latestEmailTo(request, OWNER.email);
  expect(mail.subject).toBe(`Nyt lead: ${leadName}`);

  // Notifikation med klokke-tæller, og klik åbner kontakten
  await page.goto("/notifikationer");
  const item = page.getByRole("button", { name: new RegExp(`Nyt lead: ${leadName}`) });
  await expect(item).toBeVisible();
  await expect(page.getByRole("link", { name: /Notifikationer, \d+ ulæste/ })).toBeVisible();
  await item.click();
  await expect(page.locator("h1")).toHaveText(leadName);

  // Leadet står under Venter på svar
  await page.goto("/venter");
  const list = page.getByRole("list", { name: "Venter på svar" });
  const row = list.locator("li", { hasText: leadName });
  await expect(row).toContainText("venter");
  await expect(page.getByRole("link", { name: /Venter på svar/ })).toContainText(/\d/);

  // "Jeg har kontaktet" fjerner det og registrerer svartiden
  await row.getByRole("button", { name: "Jeg har kontaktet" }).click();
  await expect(list.locator("li", { hasText: leadName })).toHaveCount(0);
  await expect(page.locator("main")).toContainText("under 1 min");

  // Kontakten har nu et registreret opkald på tidslinjen
  await page.goto(`/kunder?q=${id}`);
  await page.getByRole("link", { name: leadName }).click();
  await expect(page.locator("ol")).toContainText("Kontaktet (markeret fra Venter på svar)");
});

test("'Kræver ikke svar' fjerner en henvendelse uden at påvirke svartiden", async ({ page, request }) => {
  const id = uid();
  await page.goto("/indstillinger/kontaktformular");
  await page.fill("#lf-name", `spam-${id}.dk`);
  await page.getByRole("button", { name: "Opret formular" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const snippet = (await page.locator("section", { hasText: `spam-${id}.dk` }).locator("pre code").textContent())!;
  const endpoint = snippet.match(/action="([^"]+)"/)![1];
  await request.post(endpoint, {
    headers: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 200)}.1` },
    data: { name: `Sælger ${id}`, email: `saelger-${id}@example.com`, message: "Vil I købe annoncer?" },
  });

  await page.goto("/venter");
  const row = page.getByRole("list", { name: "Venter på svar" }).locator("li", { hasText: `Sælger ${id}` });
  await row.getByRole("button", { name: "Kræver ikke svar" }).click();
  await expect(page.locator("main")).not.toContainText(`Sælger ${id}`);
});
