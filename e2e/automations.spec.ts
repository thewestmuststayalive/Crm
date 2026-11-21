import { expect, test } from "@playwright/test";
import { testSql } from "./db";
import { OWNER, latestEmailTo, uid } from "./helpers";

test.describe.configure({ mode: "serial" });

test("automatiske regler opretter opfølgning på glemte leads og tilbud – én gang", async ({ page }) => {
  const id = uid();
  const lead = `Glemt Gunnar ${id}`;
  const deal = `Tilbud til tagrenovering ${id}`;

  await page.goto("/kunder/ny");
  await page.fill("#c-name", lead);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(lead);

  await page.goto("/pipeline/ny");
  await page.fill("#d-title", deal);
  await page.selectOption("#d-stage", { label: "Tilbud sendt" });
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("h1")).toHaveText(deal);

  // Skru tiden tilbage: leadet er 4 dage gammelt, og tilbuddet blev sendt for 6 dage siden.
  await testSql("update contacts set created_at = now() - interval '4 days' where name = $1", [lead]);
  await testSql("update deals set updated_at = now() - interval '6 days' where title = $1", [deal]);
  await testSql(
    "update activities set created_at = now() - interval '6 days' where deal_id = (select id from deals where title = $1)",
    [deal],
  );

  await page.goto("/indstillinger/automatik");
  await page.getByRole("button", { name: "Kør reglerne nu" }).click();
  await expect(page.getByRole("status")).toContainText("2 opgaver oprettet");

  // Køres reglerne igen, kommer der ingen dubletter
  await page.getByRole("button", { name: "Kør reglerne nu" }).click();
  await expect(page.getByRole("status")).toContainText("ingen nye opfølgninger");

  await page.goto("/opgaver");
  await expect(page.locator("main")).toContainText(`Følg op på ${lead}`);
  await expect(page.locator("main")).toContainText(`Følg op på deal: ${deal}`);
});

test("en slået-fra regel opretter ingen opgaver", async ({ page }) => {
  const lead = `Slumrende Sofie ${uid()}`;
  await page.goto("/kunder/ny");
  await page.fill("#c-name", lead);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await expect(page.locator("h1")).toHaveText(lead);
  await testSql("update contacts set created_at = now() - interval '10 days' where name = $1", [lead]);

  await page.goto("/indstillinger/automatik");
  const card = page.locator("section", { hasText: "Glemte leads" });
  await card.getByLabel("Slået til").uncheck();
  await card.getByRole("button", { name: "Gem" }).click();
  await expect(card.getByLabel("Slået til")).not.toBeChecked();

  await page.getByRole("button", { name: "Kør reglerne nu" }).click();
  await expect(page.getByRole("status")).toContainText("ingen nye opfølgninger");

  // Slå reglen til igen, så andre tests ikke påvirkes
  await card.getByLabel("Slået til").check();
  await card.getByRole("button", { name: "Gem" }).click();
  await expect(card.getByLabel("Slået til")).toBeChecked();
});

test("daglig kørsel sender en oversigt på e-mail", async ({ request }) => {
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  const res = await request.get("/api/cron/daily", { headers: { authorization: "Bearer test-cron" } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.digests).toBeGreaterThanOrEqual(1);

  const digest = await latestEmailTo(request, OWNER.email);
  expect(digest.subject).toContain("Din dag i Kundespor");
  expect(digest.text).toContain("Godmorgen Olivia");
  expect(digest.text).toContain("opgave");
});
