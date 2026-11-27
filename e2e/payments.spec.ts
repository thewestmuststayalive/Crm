import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { testSql } from "./db";
import { createWorkspace, emailsTo, OWNER, switchWorkspace, uid } from "./helpers";

const MOCK = "http://localhost:3999";
const KEY = "sk_test_kundespor123456";

async function connectStripe(page: import("@playwright/test").Page) {
  await page.goto("/indstillinger/betaling");
  await page.getByLabel("Hemmelig nøgle fra Stripe").fill(KEY);
  await page.getByRole("button", { name: "Forbind Stripe" }).click();
  await expect(page.getByText("Stripe er forbundet")).toBeVisible();
}

async function bookedInvoice(wsId: string, number: number) {
  const company = await testSql("insert into companies (workspace_id, name) values ($1, $2) returning id", [
    wsId,
    `Betaler ${number} ApS`,
  ]);
  const token = `tok-${uid()}-invoice-${number}-xxxxxx`;
  const inv = await testSql(
    `insert into invoices (workspace_id, company_id, status, economic_number, date, due_date, net_ore, vat_ore, gross_ore, remainder_ore, token, email)
     values ($1, $2, 'BOOKED', $3, current_date, current_date + 8, 100000, 25000, 125000, 125000, $4, 'betaler@example.com') returning id`,
    [wsId, company.rows[0].id, number, token],
  );
  return { id: inv.rows[0].id as string, token };
}

function signed(payload: string, secret = "whsec_test_secret") {
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

async function postWebhook(request: APIRequestContext, wsId: string, payload: string, signature: string) {
  return request.post(`/api/stripe/webhook/${wsId}`, {
    data: payload,
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
  });
}

test("Stripe: forbind, kunden betaler fakturaen med MobilePay/kort, og den markeres betalt", async ({ page, request }) => {
  const ws = `Betaling ${uid()}`;
  await createWorkspace(page, ws);
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;

  // Forkert nøgle afvises
  await page.goto("/indstillinger/betaling");
  await page.getByLabel("Hemmelig nøgle fra Stripe").fill("pk_test_offentlig");
  await page.getByRole("button", { name: "Forbind Stripe" }).click();
  await expect(page.getByText("Det ligner ikke en hemmelig nøgle fra Stripe")).toBeVisible();

  await connectStripe(page);
  await expect(page.getByText("Testfirma Betaling")).toBeVisible();
  await expect(page.getByText("testtilstand")).toBeVisible();
  const conn = await testSql("select secret_key_enc, webhook_secret_enc from stripe_connections where workspace_id = $1", [wsId]);
  expect(conn.rows[0].secret_key_enc).not.toContain(KEY);
  expect(conn.rows[0].webhook_secret_enc).not.toContain("whsec_");
  const hooks = (await (await request.get(`${MOCK}/stripe-api/v1/__webhooks`, { headers: { Authorization: `Bearer ${KEY}` } })).json()) as {
    url: string;
    events: string[];
  }[];
  expect(hooks.some((h) => h.url.endsWith(`/api/stripe/webhook/${wsId}`) && h.events.includes("checkout.session.completed"))).toBe(true);

  // Kunden betaler via fakturasiden
  const inv = await bookedInvoice(wsId, 9001);
  await page.goto(`/faktura/${inv.token}`);
  await page.getByRole("button", { name: "Betal med MobilePay eller kort" }).click();
  await expect(page).toHaveURL(new RegExp(`/faktura/${inv.token}\\?betaling=ok&session=cs_test_`));
  await expect(page.getByRole("status")).toContainText("Tak for din betaling.");
  await expect(page.getByText("Betalt", { exact: true })).toBeVisible();
  const paid = await testSql("select status, paid_via from invoices where id = $1", [inv.id]);
  expect(paid.rows[0]).toEqual({ status: "PAID", paid_via: "stripe" });

  // Internt: tydelig besked om at registrere betalingen i e-conomic
  await page.goto(`/fakturaer/${inv.id}`);
  await expect(page.getByText("Betalt online (MobilePay/kort)")).toBeVisible();
  await expect(page.getByText("Husk at registrere den i e-conomic")).toBeVisible();

  await switchWorkspace(page, OWNER.company);
});

test("Stripe-webhook: kun gyldige signaturer for det rigtige firma registrerer betaling", async ({ page, request }) => {
  const ws = `Webhook ${uid()}`;
  await createWorkspace(page, ws);
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  await connectStripe(page);
  const inv = await bookedInvoice(wsId, 9002);
  const event = (metadata: Record<string, string>) =>
    JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_hook000001", payment_status: "paid", amount_total: 125000, metadata } },
    });
  const status = async () => (await testSql("select status from invoices where id = $1", [inv.id])).rows[0].status;

  // Forkert signatur
  const forged = event({ kind: "invoice", id: inv.id, workspaceId: wsId });
  expect((await postWebhook(request, wsId, forged, signed(forged, "whsec_falsk"))).status()).toBe(400);
  // Gyldig signatur, men betalingen tilhører et andet firma
  const otherWs = event({ kind: "invoice", id: inv.id, workspaceId: "00000000-0000-4000-8000-000000000000" });
  expect((await postWebhook(request, wsId, otherWs, signed(otherWs))).status()).toBe(200);
  expect(await status()).toBe("BOOKED");
  // Gyldig betaling
  const ok = event({ kind: "invoice", id: inv.id, workspaceId: wsId });
  expect((await postWebhook(request, wsId, ok, signed(ok))).status()).toBe(200);
  expect(await status()).toBe("PAID");
  // Samme besked igen gør ingen skade
  expect((await postWebhook(request, wsId, ok, signed(ok))).status()).toBe(200);
  const notes = await testSql("select count(*)::int as n from notifications where workspace_id = $1 and type = 'INVOICE_PAID'", [wsId]);
  expect(notes.rows[0].n).toBeLessThanOrEqual(1);

  await switchWorkspace(page, OWNER.company);
});

test("depositum ved onlinebooking betales med MobilePay/kort og vises i kalenderen", async ({ page, browser, request }) => {
  const id = uid();
  const ws = `Depositum ${id}`;
  const service = `Polering ${id}`;
  await createWorkspace(page, ws);
  await page.goto("/indstillinger");
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");

  await page.goto("/indstillinger/booking");
  const add = page.locator("form", { hasText: "Ny ydelse" });
  await add.getByLabel("Navn på ydelse").fill(service);
  await add.getByLabel("Varighed i minutter").fill("60");
  await add.getByLabel("Pris i kr. inkl. moms").fill("800");
  await add.getByRole("button", { name: "Tilføj ydelse" }).click();
  await expect(page.getByRole("status")).toContainText(`Ydelsen "${service}" er oprettet`);
  for (const day of ["Lørdag", "Søndag"]) {
    await page.getByLabel(day, { exact: true }).check();
    await page.getByLabel(`${day} fra`).fill("08:00");
    await page.getByLabel(`${day} til`).fill("16:00");
  }
  await page.getByLabel("Kunden skal booke mindst (timer før)").fill("0");
  await page.getByRole("button", { name: "Gem", exact: true }).last().click();
  await expect(page.getByText("Gemt.", { exact: true })).toBeVisible();
  const link = await page.getByRole("textbox", { name: "Bookinglink" }).inputValue();

  await connectStripe(page);
  await page.getByLabel("Depositum (kr.)").fill("100");
  await page.getByRole("button", { name: "Gem depositum" }).click();
  await expect(page.getByText("Depositum er gemt.")).toBeVisible();

  // Kunden booker og betaler depositum
  const email = `kunde-${id}@example.com`;
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const c = await ctx.newPage();
  await c.goto(link);
  await c.getByRole("radio", { name: new RegExp(service) }).click();
  await c.getByRole("radiogroup", { name: "Dag" }).getByRole("radio").nth(2).click();
  await c.getByRole("radio", { name: "10:00", exact: true }).click();
  await c.getByLabel("Navn").fill(`Dorte Depositum ${id}`);
  await c.getByLabel("Telefon").fill("30405060");
  await c.getByLabel("E-mail (til bekræftelse)").fill(email);
  await c.getByRole("checkbox").check();
  await c.getByRole("button", { name: "Book tid" }).click();
  await expect(c.getByRole("status")).toContainText("Betal venligst depositum på 100,00");
  const [confirmation] = await emailsTo(request, email);
  expect(confirmation.text).toMatch(/Betal depositum på 100,00\skr\. med MobilePay eller kort her: \S+\/book\/betal\//);

  await c.getByRole("button", { name: "Betal depositum med MobilePay eller kort" }).click();
  await expect(c).toHaveURL(/\/book\/betal\/[A-Za-z0-9_-]+\?betaling=ok/);
  await expect(c.getByRole("status")).toContainText("Depositum er betalt.");
  await ctx.close();

  // Personalet ser, at depositum er betalt
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;
  const booking = (await testSql("select id, deposit_ore, deposit_paid_at from bookings where workspace_id = $1", [wsId])).rows[0];
  expect(booking.deposit_ore).toBe(10000);
  expect(booking.deposit_paid_at).not.toBeNull();
  await page.goto(`/kalender/${booking.id}`);
  await expect(page.getByText("betalt online")).toBeVisible();

  await switchWorkspace(page, OWNER.company);
});
