import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

// Hele Meta-forløbet mod den falske Graph-server (e2e/meta-mock.ts):
// forbind Facebook → kobl side og annoncekonto på → leads og beskeder via webhook → svar → rapport.

const SECRET = "test-secret";

function sign(body: string) {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

async function webhook(request: APIRequestContext, payload: unknown, signed = true) {
  const body = JSON.stringify(payload);
  return request.post("/api/meta/webhook", {
    headers: { "content-type": "application/json", ...(signed ? { "x-hub-signature-256": sign(body) } : {}) },
    data: body,
  });
}

async function mockRequests(request: APIRequestContext) {
  const res = await request.get("http://localhost:3999/__requests");
  return (await res.json()) as { method: string; path: string; query: Record<string, string>; body: { recipient?: { id: string }; message?: { text: string } } }[];
}

test.describe.configure({ mode: "serial" });

test("webhook-bekræftelse og signaturtjek", async ({ request }) => {
  const ok = await request.get("/api/meta/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=12345");
  expect(await ok.text()).toBe("12345");
  const wrong = await request.get("/api/meta/webhook?hub.mode=subscribe&hub.verify_token=forkert&hub.challenge=1");
  expect(wrong.status()).toBe(403);
  const unsigned = await webhook(request, { object: "page", entry: [] }, false);
  expect(unsigned.status()).toBe(401);
});

test("forbind Facebook og kobl side og annoncekonto på", async ({ page }) => {
  await page.goto("/indstillinger/meta");
  await page.getByRole("link", { name: "Forbind med Facebook" }).click();
  await expect(page.getByRole("status").first()).toContainText("Facebook er forbundet");
  await expect(page.locator("main")).toContainText("Forbundet som Test Admin");

  await page.getByRole("button", { name: /Kobl til/ }).first().click();
  await expect(page.getByRole("status").first()).toContainText("Testsiden er koblet på. 1 samtaler hentet.");
  await expect(page.locator("main")).toContainText("Instagram @testsiden");

  await page.getByRole("button", { name: /Kobl til/ }).first().click();
  await expect(page.getByRole("status").first()).toContainText("Testkonto er koblet på");
});

test("lead fra Meta Lead Ads oprettes én gang", async ({ page, request }) => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "PAGE1",
        time: Date.now(),
        changes: [{ field: "leadgen", value: { leadgen_id: "LEAD123", page_id: "PAGE1", form_id: "F1", campaign_id: "C1" } }],
      },
    ],
  };
  expect((await webhook(request, payload)).status()).toBe(200);
  expect((await webhook(request, payload)).status()).toBe(200); // Meta sender ofte samme hændelse igen

  await page.goto("/kunder?q=Maja");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Meta Lead Ads");
  await page.getByRole("link", { name: "Maja Meta" }).click();
  await expect(page.locator("ol")).toContainText('Meta Lead Ads (kampagne "Vinterkampagne")');
  await expect(page.locator("ol")).toContainText("Hurtigst muligt");
});

test("beskeder fra Messenger og Instagram lander i indbakken, og man kan svare", async ({ page, request }) => {
  const now = Date.now();
  expect(
    (
      await webhook(request, {
        object: "page",
        entry: [
          {
            id: "PAGE1",
            time: now,
            messaging: [
              { sender: { id: "PSID_NEW" }, recipient: { id: "PAGE1" }, timestamp: now, message: { mid: "m_in_1", text: "Hej! Har I tid på fredag?" } },
            ],
          },
        ],
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await webhook(request, {
        object: "instagram",
        entry: [
          {
            id: "IG1",
            time: now,
            messaging: [
              { sender: { id: "IGSID_NEW" }, recipient: { id: "IG1" }, timestamp: now, message: { mid: "m_in_2", text: "Hej fra Instagram" } },
            ],
          },
        ],
      })
    ).status(),
  ).toBe(200);

  await page.goto("/indbakke");
  await expect(page.getByRole("link", { name: /Indbakke/ })).toContainText("2");
  const list = page.getByRole("navigation", { name: "Samtaler" });
  await expect(list).toContainText("Mads Messenger");
  await expect(list).toContainText("Ida Insta");
  await expect(list).toContainText("Gammel Kunde");

  // Begge nye samtaler venter på svar
  await page.goto("/venter");
  const waiting = page.getByRole("list", { name: "Venter på svar" });
  await expect(waiting).toContainText("Mads Messenger");
  await expect(waiting).toContainText("Ida Insta");
  await page.goto("/indbakke");

  // Svar på Messenger
  await list.getByRole("link", { name: /Mads Messenger/ }).click();
  await expect(page.getByRole("list", { name: "Beskeder" })).toContainText("Har I tid på fredag?");
  await page.fill("#reply", "Ja, kl. 10 passer fint");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("list", { name: "Beskeder" })).toContainText("Ja, kl. 10 passer fint");

  const sent = (await mockRequests(request)).filter((r) => r.method === "POST" && r.path === "/PAGE1/messages");
  expect(sent.at(-1)?.body.recipient?.id).toBe("PSID_NEW");
  expect(sent.at(-1)?.body.message?.text).toBe("Ja, kl. 10 passer fint");

  // Meta sender vores egen besked tilbage som "echo" – den må ikke blive en dublet.
  await webhook(request, {
    object: "page",
    entry: [
      {
        id: "PAGE1",
        time: now,
        messaging: [
          { sender: { id: "PAGE1" }, recipient: { id: "PSID_NEW" }, timestamp: Date.now(), message: { mid: "m_out_1", text: "Ja, kl. 10 passer fint", is_echo: true } },
        ],
      },
    ],
  });
  await page.reload();
  await expect(page.getByRole("list", { name: "Beskeder" }).getByText("Ja, kl. 10 passer fint")).toHaveCount(1);

  // Når der er svaret, venter Mads ikke længere – men Ida gør
  await page.goto("/venter");
  await expect(waiting).not.toContainText("Mads Messenger");
  await expect(waiting).toContainText("Ida Insta");
  await page.goto("/indbakke");
  await list.getByRole("link", { name: /Mads Messenger/ }).click();

  // Opret afsenderen som lead
  await page.getByRole("button", { name: "Opret som lead" }).click();
  await expect(page.getByRole("link", { name: "Kontakt: Mads Messenger" })).toBeVisible();

  // En samtale ældre end 24 timer kan ikke besvares herfra
  await list.getByRole("link", { name: /Gammel Kunde/ }).click();
  await expect(page.locator("main")).toContainText("mere end 24 timer");
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
});

test("annoncerapport viser forbrug, leads og pris pr. lead", async ({ page, request }) => {
  const cron = await request.get("/api/cron/meta-insights", { headers: { authorization: "Bearer test-cron" } });
  expect(cron.status()).toBe(200);
  expect((await request.get("/api/cron/meta-insights")).status()).toBe(401);

  await page.goto("/annoncer");
  const table = page.locator("table");
  await expect(table).toContainText("Vinterkampagne");
  await expect(page.locator("main")).toContainText("751"); // 500,00 + 250,50 kr.
  const row = table.locator("tbody tr", { hasText: "Vinterkampagne" });
  await expect(row.locator("td").nth(3)).toHaveText("1"); // Maja Meta
});
