import { expect, test, type APIRequestContext } from "@playwright/test";
import { testSql } from "./db";
import { bookAsCustomer, createWorkspace, OWNER, setupBooking, switchWorkspace, uid } from "./helpers";

type Sms = { sender: string; message: string; recipients: { msisdn: number }[] };

async function smsTo(request: APIRequestContext, msisdn: number) {
  const log = (await (await request.get("http://localhost:3999/__requests")).json()) as {
    method: string;
    path: string;
    body: Sms;
  }[];
  return log
    .filter((r) => r.method === "POST" && r.path === "/gatewayapi/rest/mtsms" && r.body.recipients[0].msisdn === msisdn)
    .map((r) => r.body);
}

test("SMS: opsætning, bekræftelse ved onlinebooking, påmindelse dagen før og loft", async ({ page, browser, request }) => {
  const id = uid();
  const ws = `SMS ${id}`;
  const service = `Vask ${id}`;
  await createWorkspace(page, ws);
  const link = await setupBooking(page, service);
  const wsId = (await testSql("select id from workspaces where name = $1", [ws])).rows[0].id;

  // Opsætning: forkert nøgle afvises, rigtig nøgle gemmes krypteret
  await page.goto("/indstillinger/sms");
  await page.getByLabel("API-nøgle fra GatewayAPI").fill("forkert-noegle-1234567890");
  await page.getByLabel("Afsendernavn (højst 11 tegn)").fill("Bilpleje");
  await page.getByRole("button", { name: "Gem SMS-indstillinger" }).click();
  await expect(page.getByText("GatewayAPI afviste nøglen")).toBeVisible();
  await page.getByLabel("API-nøgle fra GatewayAPI").fill("test-sms-token-1234567890");
  await page.getByRole("button", { name: "Gem SMS-indstillinger" }).click();
  await expect(page.getByText("SMS-indstillingerne er gemt.")).toBeVisible();
  const saved = await testSql("select token_enc from sms_settings where workspace_id = $1", [wsId]);
  expect(saved.rows[0].token_enc).not.toContain("test-sms-token");

  // Test-SMS
  await page.getByLabel("Dit mobilnummer").fill("+45 11 22 33 44");
  await page.getByRole("button", { name: "Send test-SMS" }).click();
  await expect(page.getByText("Test-SMS'en er sendt.")).toBeVisible();
  expect((await smsTo(request, 4511223344))[0].message).toContain("SMS virker");

  // Kunden booker → bekræftelse på SMS (dansk nummer får +45)
  const phone = 4520000000 + Math.floor(Math.random() * 9_000_000);
  const local = String(phone).slice(2);
  const { ctx } = await bookAsCustomer(browser, link, {
    service,
    name: `Søren SMS ${id}`,
    phone: `${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6)}`,
    email: `sms-${id}@example.com`,
  });
  await ctx.close();
  const [confirmation] = await smsTo(request, phone);
  expect(confirmation.sender).toBe("Bilpleje");
  expect(confirmation.message).toMatch(new RegExp(`^Hej Søren\\. Din tid hos ${ws} er bekræftet: ${service} .+ Se eller aflys: \\S+/book/aflys/`));

  // Påmindelse dagen før – kun én gang, selv hvis den daglige kørsel kører to gange
  await testSql(
    "update bookings set starts_at = (current_date + 1 + time '10:00') at time zone 'Europe/Copenhagen', ends_at = (current_date + 1 + time '11:00') at time zone 'Europe/Copenhagen' where workspace_id = $1",
    [wsId],
  );
  for (let i = 0; i < 2; i++) {
    const cron = await request.get("/api/cron/daily", { headers: { authorization: "Bearer test-cron" } });
    expect(cron.status()).toBe(200);
  }
  const all = await smsTo(request, phone);
  expect(all).toHaveLength(2);
  expect(all[1].message).toContain(`Påmindelse: ${service} i morgen kl. 10:00 hos ${ws}`);

  // Loftet stopper flere SMS'er
  await testSql("update sms_settings set monthly_limit = 0 where workspace_id = $1", [wsId]);
  const phone2 = phone + 1;
  const local2 = String(phone2).slice(2);
  const second = await bookAsCustomer(browser, link, {
    service,
    name: `Sanne SMS ${id}`,
    phone: local2,
    email: `sms2-${id}@example.com`,
    dayIndex: 3,
  });
  await second.ctx.close();
  expect(await smsTo(request, phone2)).toHaveLength(0);

  // Ingen telefonnumre gemmes i SMS-loggen
  const logRow = await testSql("select * from sms_log where workspace_id = $1 limit 1", [wsId]);
  expect(JSON.stringify(logRow.rows[0])).not.toContain(local);

  await switchWorkspace(page, OWNER.company);
});
