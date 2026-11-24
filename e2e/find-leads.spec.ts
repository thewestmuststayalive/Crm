import { expect, test } from "@playwright/test";
import { testSql } from "./db";
import { createWorkspace, danishDate, OWNER, switchWorkspace, uid } from "./helpers";

async function workspaceId(name: string) {
  return (await testSql("select id from workspaces where name = $1", [name])).rows[0].id as string;
}

test("Google Maps: søg, gem i liste, hjemmeside-tjek, opfølgning og gør til kunde", async ({ page }) => {
  const ws = `Leads G ${uid()}`;
  await createWorkspace(page, ws);

  await page.getByRole("link", { name: "Find leads" }).first().click();
  await expect(page.getByRole("heading", { name: "Find leads" })).toBeVisible();
  await page.getByRole("link", { name: "Søg i Google Maps" }).first().click();

  // Søg og hent næste side
  await page.getByLabel("Søg i Google Maps").fill("frisør Aarhus");
  await page.getByRole("button", { name: "Søg", exact: true }).click();
  const results = page.getByRole("list", { name: "Søgeresultater" });
  await expect(results).toContainText("Salon Klip");
  await expect(results).toContainText("★ 4,6 (120)");
  await expect(results).not.toContainText("Lukket Salon");
  await page.getByRole("button", { name: "Hent 20 flere" }).click();
  await expect(results).toContainText("Hår & Co");
  await expect(page.getByText(/2 brugt/)).toBeVisible();

  // Gem alle i en ny liste
  await page.getByLabel("Vælg alle").check();
  await page.getByLabel("Gem i liste").selectOption("");
  await page.getByLabel("Navn på ny liste").fill("Frisører Aarhus");
  await page.getByRole("button", { name: "Gem 3 valgte" }).click();
  await expect(page.getByText('3 firmaer gemt i "Frisører Aarhus".')).toBeVisible();
  await expect(results.getByText("Gemt i en liste")).toHaveCount(3);
  await page.getByRole("link", { name: "Åbn listen →" }).click();

  // Hjemmeside-tjek af hele listen
  const list = page.getByRole("list", { name: "Firmaer i listen" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Tjek hjemmesider (3)" }).click();
  await expect(page.getByRole("status")).toContainText("2 hjemmesider tjekket.");
  await expect(list.getByRole("listitem").filter({ hasText: "Salon Klip" })).toContainText("Hjemmeside 25/100");
  await expect(list.getByRole("listitem").filter({ hasText: "Hår & Co" })).toContainText("Hjemmeside 80/100");
  await expect(list.getByRole("listitem").filter({ hasText: "Frisør Uden Side" })).toContainText("Hjemmeside 0/100");

  // Hurtigt statusskift fra listen
  await page.getByLabel("Status for Frisør Uden Side").selectOption("NOT_INTERESTED");
  await expect
    .poll(async () => (await testSql("select status from prospects where name = 'Frisør Uden Side' and workspace_id = $1", [await workspaceId(ws)])).rows[0].status)
    .toBe("NOT_INTERESTED");

  // Firmaets side: salgsvinkler, "Ring igen" bliver til en opgave
  await list.getByRole("link", { name: "Salon Klip" }).click();
  const angles = page.getByRole("list", { name: "Salgsvinkler" });
  await expect(angles).toContainText("ikke mobilvenlig");
  await expect(angles).toContainText("© 2016");
  await expect(page.getByRole("link", { name: "Ring 86 12 34 56" })).toHaveAttribute("href", "tel:86123456");
  await page.getByLabel("Status", { exact: true }).selectOption("CALL_BACK");
  await expect(page.getByLabel("Ring igen den")).toHaveValue(danishDate(1));
  await page.getByLabel("Noter fra samtalen").fill("Ring efter frokost");
  await page.getByRole("button", { name: "Gem", exact: true }).click();
  await expect(page.getByText("Gemt. Der er oprettet en opgave.")).toBeVisible();
  const wsId = await workspaceId(ws);
  const task = await testSql("select due_date::text as d from tasks where workspace_id = $1 and title like 'Ring til Salon Klip%'", [wsId]);
  expect(task.rows[0].d).toBe(danishDate(1));

  // Gør til kunde med kontakt og deal
  await page.getByLabel("Kontaktperson (valgfrit)").fill("Karin Klip");
  await page.getByLabel("Forventet værdi (kr.)").fill("15.000");
  await page.getByRole("button", { name: "Gør til kunde" }).click();
  await expect(page).toHaveURL(/\/virksomheder\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Salon Klip" })).toBeVisible();
  await expect(page.getByText("Fundet via leadsøgning (Frisører Aarhus).")).toBeVisible();
  const deal = await testSql("select value, source from deals where workspace_id = $1 and title = 'Salon Klip'", [wsId]);
  expect(deal.rows[0]).toEqual({ value: 15000, source: "PROSPECTING" });
  const contact = await testSql("select source from contacts where workspace_id = $1 and name = 'Karin Klip'", [wsId]);
  expect(contact.rows[0].source).toBe("PROSPECTING");

  // En ny søgning viser, at firmaerne er gemt og findes i CRM'et
  await page.goto("/leads/google");
  await page.getByLabel("Søg i Google Maps").fill("frisør Aarhus");
  await page.getByRole("button", { name: "Søg", exact: true }).click();
  const klip = results.getByRole("listitem").filter({ hasText: "Salon Klip" });
  await expect(klip).toContainText("Gemt i en liste");
  await expect(klip).toContainText("Findes i CRM'et");

  // Loftet over Google-søgninger stopper flere søgninger
  await testSql("update workspaces set lead_search_monthly_limit = 3 where id = $1", [wsId]);
  await page.getByRole("button", { name: "Søg", exact: true }).click();
  await expect(page.getByText("Månedens loft på 3 søgninger er nået")).toBeVisible();

  await switchWorkspace(page, OWNER.company);
});

test("CVR: filtre, reklamebeskyttede sorteres fra, og listen kan eksporteres", async ({ page }) => {
  const ws = `Leads C ${uid()}`;
  await createWorkspace(page, ws);
  await page.goto("/leads/cvr");
  await page.getByLabel("Branche (tekst eller branchekode)").fill("frisør");
  await page.getByLabel("Postnummer").fill("8000-8270");
  await page.getByLabel("Nystartede").selectOption("3");
  await page.getByLabel("Virksomhedsform").selectOption("80");
  await page.getByRole("button", { name: "Søg i CVR" }).click();

  const results = page.getByRole("list", { name: "Søgeresultater" });
  await expect(results).toContainText("Nyt Hår ApS");
  await expect(results).toContainText("2–4 ansatte");
  await expect(results).toContainText("Nygade 5, 8000 Aarhus C");
  await expect(results).not.toContainText("Beskyttet Frisør");

  // Forespørgslen til CVR har de rigtige filtre og udelukker altid reklamebeskyttede
  const log = (await (await page.request.get("http://localhost:3999/__requests")).json()) as {
    path: string;
    body: { query: { bool: { filter: unknown[]; must_not: unknown[] } } };
  }[];
  const sent = log.filter((r) => r.path === "/cvr-permanent/virksomhed/_search").at(-1)!.body;
  const json = JSON.stringify(sent);
  expect(sent.query.bool.must_not).toEqual([{ term: { "Vrvirksomhed.reklamebeskyttet": true } }]);
  expect(json).toContain('"match_phrase_prefix":{"Vrvirksomhed.virksomhedMetadata.nyesteHovedbranche.branchetekst":"frisør"}');
  expect(json).toContain('"Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse.postnummer":{"gte":8000,"lte":8270}');
  expect(json).toContain('"Vrvirksomhed.virksomhedMetadata.nyesteVirksomhedsform.virksomhedsformkode":80');
  expect(json).toContain('"Vrvirksomhed.virksomhedMetadata.stiftelsesDato":{"gte":"');

  // Gem og eksportér
  await page.getByLabel("Vælg Nyt Hår ApS").check();
  await page.getByLabel("Gem i liste").selectOption("");
  await page.getByLabel("Navn på ny liste").fill("Nye frisører");
  await page.getByRole("button", { name: "Gem 1 valgte" }).click();
  await expect(page.getByText('1 firma gemt i "Nye frisører".')).toBeVisible();
  await page.getByRole("link", { name: "Åbn listen →" }).click();
  await expect(page.getByRole("list", { name: "Firmaer i listen" })).toContainText("40404040");
  const listUrl = page.url();
  const csv = await (await page.request.get(`${listUrl}/eksport`)).text();
  expect(csv).toContain("Nyt Hår ApS;40404040");
  expect(csv).toContain("Frisører (960210)");

  await switchWorkspace(page, OWNER.company);
});

test("hjemmeside-tjek afviser interne adresser, og manuelle firmaer kan tilføjes", async ({ page }) => {
  const ws = `Leads S ${uid()}`;
  await createWorkspace(page, ws);
  await page.goto("/leads");
  await page.getByLabel("Navn på listen").fill("Manuel liste");
  await page.getByRole("button", { name: "Opret liste" }).click();
  await expect(page.getByRole("heading", { name: "Manuel liste" })).toBeVisible();

  for (const [name, website] of [
    ["Intern Server", "http://127.0.0.1:3100/api/health"],
    ["Lokal Vært", "http://localhost/"],
    ["Metadata", "http://169.254.169.254/latest/meta-data"],
  ]) {
    await page.getByLabel("Firmanavn").fill(name);
    await page.getByLabel("Hjemmeside").fill(website);
    await page.getByRole("button", { name: "Tilføj firma" }).click();
    await expect(page.getByText(`${name} er tilføjet.`)).toBeVisible();
  }
  const list = page.getByRole("list", { name: "Firmaer i listen" });
  await expect(list.getByRole("listitem")).toHaveCount(3);

  await list.getByRole("link", { name: "Intern Server" }).click();
  await page.getByRole("button", { name: "Tjek hjemmeside" }).click();
  await expect(page.getByText("Adressen kan ikke tjekkes")).toBeVisible();

  const wsId = await workspaceId(ws);
  await page.getByRole("link", { name: "← Manuel liste" }).click();
  await page.getByRole("button", { name: "Tjek hjemmesider (2)" }).click();
  await expect
    .poll(async () =>
      (
        await testSql(
          "select name, website_check->>'error' as error from prospects where workspace_id = $1 order by name",
          [wsId],
        )
      ).rows,
    )
    .toEqual([
      { name: "Intern Server", error: "Adressen kan ikke tjekkes" },
      { name: "Lokal Vært", error: "Adressen kan ikke tjekkes" },
      { name: "Metadata", error: "Adressen kan ikke tjekkes" },
    ]);

  await switchWorkspace(page, OWNER.company);
});
