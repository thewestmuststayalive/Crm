import { expect, test } from "@playwright/test";
import { uid } from "./helpers";

test("kontaktformular: henvendelse bliver til lead, deal og opgave uden dubletter", async ({ page, request }) => {
  const id = uid();
  const formName = `site-${id}.dk`;

  await page.goto("/indstillinger/kontaktformular");
  await page.fill("#lf-name", formName);
  await page.getByRole("button", { name: "Opret formular" }).click();
  await expect(page.getByRole("status")).toContainText("Formularen er oprettet");

  const card = page.locator("section", { hasText: formName });
  const snippet = (await card.locator("pre code").textContent())!;
  const endpoint = snippet.match(/action="([^"]+)"/)![1];

  // 1) En besøgende udfylder formularen på "hjemmesiden"
  const visitor = await page.context().browser()!.newPage();
  await visitor.setExtraHTTPHeaders({ "x-forwarded-for": `10.0.1.${Math.floor(Math.random() * 200)}` });
  await visitor.setContent(snippet);
  await visitor.fill('input[name="name"]', `Lone Lead ${id}`);
  await visitor.fill('input[name="email"]', `lone-${id}@example.com`);
  await visitor.fill('input[name="phone"]', "+45 11 22 33 44");
  await visitor.fill('textarea[name="message"]', "Vi vil gerne have et tilbud på en ny hjemmeside");
  await visitor.click('button[type="submit"]');
  await expect(visitor.locator("h1")).toHaveText("Tak for din henvendelse");
  await visitor.close();

  // 2) Samme person skriver igen via JSON (fx fetch) – må ikke give en dublet
  const again = await request.post(endpoint, {
    headers: { "x-forwarded-for": "10.0.2.1" },
    data: { name: "Lone", email: `LONE-${id}@example.com`, message: "Har I set min besked?" },
  });
  expect(again.status()).toBe(200);
  expect((await again.json()).ok).toBe(true);

  // 3) Bot der udfylder spam-fælden: svarer OK, men gemmer intet
  const bot = await request.post(endpoint, {
    headers: { "x-forwarded-for": "10.0.3.1" },
    form: { name: `Spam ${id}`, email: `spam-${id}@example.com`, _hp: "http://spam" },
  });
  expect(bot.status()).toBe(200);

  await page.goto(`/kunder?q=${id}`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Hjemmeside");
  await expect(page.locator("tbody")).not.toContainText("Spam");

  await page.getByRole("link", { name: `Lone Lead ${id}` }).click();
  await expect(page.locator("ol")).toContainText("Vi vil gerne have et tilbud");
  await expect(page.locator("ol")).toContainText("Har I set min besked?");
  await expect(page.locator("ol")).toContainText("Kontakten fandtes i forvejen");
  // Én deal (den anden henvendelse genbruger den åbne deal), og opfølgningsopgaver til den ansvarlige
  const dealsCard = page.locator("section", { has: page.getByRole("heading", { name: /^Deals/ }) });
  await expect(dealsCard.getByRole("heading")).toHaveText("Deals (1)");
  await expect(dealsCard).toContainText(`Henvendelse: Lone Lead ${id}`);
  await expect(page.getByText(`Følg op på henvendelse fra Lone Lead ${id}`)).toBeVisible();
});

test("kontaktformular: ukendt nøgle, manglende kontaktinfo og for mange forsøg afvises", async ({ page, request }) => {
  expect((await request.post("/api/leads/findes-ikke", { data: { email: "a@b.dk" } })).status()).toBe(404);

  const formName = `limit-${uid()}`;
  await page.goto("/indstillinger/kontaktformular");
  await page.fill("#lf-name", formName);
  await page.getByRole("button", { name: "Opret formular" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const snippet = (await page.locator("section", { hasText: formName }).locator("pre code").textContent())!;
  const endpoint = snippet.match(/action="([^"]+)"/)![1];

  const missing = await request.post(endpoint, { headers: { "x-forwarded-for": "10.0.4.1" }, data: { name: "Uden info" } });
  expect(missing.status()).toBe(400);

  const ip = `10.0.5.${Math.floor(Math.random() * 200)}`;
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await request.post(endpoint, {
      headers: { "x-forwarded-for": ip },
      data: { name: `Flood ${i}`, email: `flood-${i}-${ip}@example.com` },
    });
    statuses.push(r.status());
  }
  expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
  expect(statuses[5]).toBe(429);
});
