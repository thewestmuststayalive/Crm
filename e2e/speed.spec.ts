import { expect, test } from "@playwright/test";
import { testSql } from "./db";
import { createWorkspace, danishDate, OWNER, switchWorkspace, uid } from "./helpers";

test("svarskabeloner, klik-for-at-booke og udsæt opgaver", async ({ page }) => {
  const id = uid();
  const ws = `Hurtig ${id}`;
  await createWorkspace(page, ws);

  // Svarskabeloner: standardsvar lægges ind og bruges i indbakken
  await page.goto("/indstillinger/svar");
  await page.getByRole("button", { name: "Tilføj standardsvar" }).click();
  await expect(page.getByRole("list", { name: "Svarskabeloner" })).toContainText("Tak for beskeden");

  // En samtale i indbakken (oprettet direkte i databasen)
  const wsRow = await testSql("select id from workspaces where name = $1", [ws]);
  const wsId = wsRow.rows[0].id;
  const pageRow = await testSql(
    "insert into meta_pages (workspace_id, page_id, name, page_token_enc) values ($1, $2, 'Testside', 'x') returning id",
    [wsId, `page-${id}`],
  );
  const conv = await testSql(
    `insert into conversations (workspace_id, meta_page_id, platform, external_user_id, name, last_message_at, last_inbound_at)
     values ($1, $2, 'MESSENGER', $3, $4, now(), now()) returning id`,
    [wsId, pageRow.rows[0].id, `psid-${id}`, `Karin Kunde ${id}`],
  );
  await page.goto(`/indbakke/${conv.rows[0].id}`);
  await page.getByRole("button", { name: "Tak for beskeden" }).click();
  const reply = page.locator("#reply");
  await expect(reply).toHaveValue(/^Hej Karin\n\nTak for din besked!/);
  await expect(reply).toHaveValue(new RegExp(`${ws}$`));

  // Kalender: klik på et tomt tidspunkt åbner en ny booking med dato og tid udfyldt
  await page.goto("/indstillinger");
  await page.getByLabel(/Booking og biler/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");
  const day = danishDate(1);
  await page.goto(`/kalender?uge=${day}`);
  await page
    .getByRole("link", { name: new RegExp(`^Ny booking .* kl\\. 10:00$`) })
    .nth(0)
    .click();
  await expect(page).toHaveURL(/\/kalender\/ny\?dato=\d{4}-\d{2}-\d{2}&tid=10:00/);
  await expect(page.getByLabel("Tidspunkt")).toHaveValue("10:00");

  // Opgaver: udsæt med ét klik
  await page.goto("/opgaver");
  await page.fill("#task-title", `Ring til Karin ${id}`);
  await page.fill("#task-due", danishDate(0));
  await page.getByRole("button", { name: "Opret opgave" }).click();
  await page.getByRole("button", { name: `Udsæt Ring til Karin ${id} en uge` }).click();
  await expect
    .poll(
      async () =>
        (await testSql("select due_date::text as d from tasks where title = $1", [`Ring til Karin ${id}`])).rows[0].d,
    )
    .toBe(danishDate(7));

  await switchWorkspace(page, OWNER.company);
});
