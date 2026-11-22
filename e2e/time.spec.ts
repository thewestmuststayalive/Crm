import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, danishDate, emailsTo, OWNER, switchWorkspace, uid } from "./helpers";

async function logTime(page: Page, duration: string, company: string, description: string, billable = true) {
  const form = page.locator("form", { hasText: "Registrér tid" });
  await form.getByLabel("Tid", { exact: true }).fill(duration);
  await form.getByLabel("Kunde").selectOption({ label: company });
  await form.getByLabel("Beskrivelse").fill(description);
  if (!billable) await form.getByLabel(/Fakturerbar/).uncheck();
  await form.getByRole("button", { name: "Registrér tid" }).click();
  await expect(page.getByRole("status")).toContainText("Tiden er registreret");
}

test("tid og retainers: stopur, registrering, advarsel ved 80 % og 100 %, eksport", async ({ page, request }) => {
  const id = uid();
  const company = `Kunde ${id} ApS`;
  await createWorkspace(page, `Bureau ${id}`);

  await page.goto("/indstillinger");
  await page.getByLabel(/Tid og projekter/).check();
  await page.getByRole("button", { name: "Gem moduler" }).click();
  await expect(page.getByRole("status")).toContainText("Modulerne er gemt");
  await expect(page.getByRole("link", { name: "Tid", exact: true })).toBeVisible();

  await page.goto("/virksomheder/ny");
  await page.fill("#co-name", company);
  await page.getByRole("button", { name: "Opret virksomhed" }).click();
  await expect(page.locator("h1")).toHaveText(company);

  // Retainer på 2 timer pr. måned, 800 kr./t over budget
  await page.goto("/tid/retainers");
  const create = page.locator("form", { hasText: "Opret retainer" });
  await create.getByLabel("Kunde").selectOption({ label: company });
  await create.getByLabel("Aftale").fill(`SoMe ${id}`);
  await create.getByLabel("Timer pr. måned").fill("2");
  await create.getByLabel(/Pris pr. måned/).fill("5.000");
  await create.getByLabel(/Timepris/).fill("800");
  await create.getByRole("button", { name: "Opret retainer" }).click();
  const retainer = page.getByRole("listitem", { name: `Retainer ${company}` });
  await expect(retainer).toContainText("0:00 af 2:00 timer");

  // 1:30 = 75 %: ingen advarsel endnu
  await page.goto("/tid");
  await logTime(page, "1:30", company, `Annoncer ${id}`);
  await expect(page.getByRole("region", { name: /^Tid / }).first()).toContainText("1:30");
  // +15 min = 88 %: advarsel om 80 %
  await logTime(page, "15m", company, `Rapport ${id}`);
  await expect
    .poll(async () =>
      (await emailsTo(request, OWNER.email)).some((m) => m.subject === `${company} har brugt 88 % af retaineren`),
    )
    .toBe(true);
  // +30 min = 113 %: advarsel om hele retaineren – og kun én gang
  await logTime(page, "0,5t", company, `Møde ${id}`);
  await logTime(page, "1", company, `Internt møde ${id}`, false);
  const full = (await emailsTo(request, OWNER.email)).filter((m) => m.subject.startsWith(`${company} har brugt hele`));
  expect(full).toHaveLength(1);

  await page.goto("/tid/retainers");
  await expect(retainer).toContainText("2:15 af 2:00 timer");
  await expect(retainer).toContainText("0:15 timer over budget");
  await expect(retainer).toContainText("200,00");
  await expect(retainer.getByRole("meter")).toHaveAttribute("aria-valuenow", "113");

  // Stopur: start, vises i menuen, stop
  await page.goto("/tid");
  await page.locator("#timer-company").selectOption({ label: company });
  await page.getByLabel("Hvad laver du?").fill(`Stopur ${id}`);
  await page.getByRole("button", { name: "Start stopur" }).click();
  await expect(page.getByRole("link", { name: `Stopur kører: ${company}` })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("link", { name: /Stopur kører/ })).toHaveCount(0);
  await expect(page.locator("main")).toContainText(`Stopur ${id}`);

  // Virksomhedssiden viser månedens tid og retaineren
  await page.goto("/virksomheder");
  await page.getByRole("link", { name: company }).click();
  await expect(page.locator("main")).toContainText("fakturerbare timer");
  await expect(page.getByRole("meter")).toBeVisible();

  // Eksport af måneden
  const csv = await (await page.request.get(`/tid/eksport?maaned=${danishDate().slice(0, 7)}`)).text();
  expect(csv).toContain(company);
  expect(csv).toContain(`Annoncer ${id}`);
  expect(csv).toContain("1:30");

  // Slet en registrering
  await page.goto("/tid");
  await page.getByRole("button", { name: new RegExp(`Slet .*Møde ${id}`) }).click();
  await expect(page.locator("main")).not.toContainText(`Møde ${id}`);

  await switchWorkspace(page, OWNER.company);
});
