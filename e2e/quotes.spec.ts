import { expect, test, type APIRequestContext } from "@playwright/test";
import { uid } from "./helpers";

/** Seneste link til et tilbud sendt på e-mail til `to` (via den falske Resend i e2e/meta-mock.ts). */
async function quoteEmailTo(request: APIRequestContext, to: string, subject: RegExp) {
  const res = await request.get("http://localhost:3999/__requests");
  const log = (await res.json()) as {
    method: string;
    path: string;
    body: { to: string; subject: string; text: string };
  }[];
  const email = log.filter((r) => r.path === "/emails" && r.body.to === to && subject.test(r.body.subject)).at(-1);
  if (!email) throw new Error(`Ingen e-mail til ${to} med emne ${subject}`);
  return { ...email.body, link: email.body.text.match(/https?:\/\/\S+\/tilbud\/[A-Za-z0-9_-]+/)?.[0] ?? null };
}

test("tilbud: linjer og moms, send, kunden åbner og accepterer, dealen vindes", async ({ page, browser, request }) => {
  const id = uid();
  const contactName = `Tina Tilbud ${id}`;
  const email = `tina-${id}@example.com`;
  const dealTitle = `Ny tagrende ${id}`;

  // Firmaoplysninger og standardbetingelser vises på tilbuddet
  await page.goto("/indstillinger");
  await page.fill("#s-cvr", "12345678");
  await page.fill("#s-terms", `Betaling netto 8 dage ${id}`);
  await page.getByRole("button", { name: "Gem" }).last().click();
  await expect(page.getByRole("status")).toContainText("Oplysningerne på tilbud er gemt");

  // Kontakt med e-mail og en deal
  await page.goto("/kunder/ny");
  await page.fill("#c-name", contactName);
  await page.fill("#c-email", email);
  await page.getByRole("button", { name: "Opret kontakt" }).click();
  await page.getByRole("link", { name: "Ny deal" }).click();
  await page.fill("#d-title", dealTitle);
  await page.fill("#d-value", "10.000");
  await page.getByRole("button", { name: "Opret deal" }).click();
  await expect(page.locator("h1")).toHaveText(dealTitle);
  const dealUrl = page.url();

  // Nyt tilbud starter med dealens titel og værdi
  await page.getByRole("button", { name: "Nyt tilbud" }).click();
  await expect(page.locator("h1")).toHaveText(/Tilbud #\d+/);
  await expect(page.getByLabel("Beskrivelse, linje 1")).toHaveValue(dealTitle);
  await expect(page.getByLabel("Pris, linje 1")).toHaveValue("10000");
  await expect(page.getByLabel("Betingelser")).toHaveValue(`Betaling netto 8 dage ${id}`);

  // Rediger linjer – totalen regnes ud med det samme
  await page.getByLabel("Antal, linje 1").fill("2");
  await page.getByLabel("Pris, linje 1").fill("1.250,50");
  await page.getByRole("button", { name: "+ Tilføj linje" }).click();
  await page.getByLabel("Beskrivelse, linje 2").fill("Opsætning");
  await page.getByLabel("Pris, linje 2").fill("500");
  await page.getByLabel("Rabat i procent, linje 2").fill("10");
  // 2 × 1.250,50 + 500 − 10 % = 2.951,00 ekskl. moms → 3.688,75 inkl. 25 % moms
  await expect(page.getByTestId("editor-total")).toHaveText(/3\.688,75\s*kr\./);

  // Ugyldig pris afvises
  await page.getByLabel("Pris, linje 2").fill("gratis");
  await page.getByRole("button", { name: "Gem", exact: true }).click();
  await expect(page.getByText("Linje 2: ugyldig pris")).toBeVisible();
  await page.getByLabel("Pris, linje 2").fill("500");

  // Send: kunden får en e-mail med linket
  await page.getByRole("button", { name: "Gem og send" }).click();
  await expect(page.getByRole("status")).toContainText(`Tilbuddet er sendt til ${email}`);
  const sent = await quoteEmailTo(request, email, /^Tilbud #/);
  expect(sent.text).toContain("3.688,75");
  expect(sent.link).toBeTruthy();
  const editorUrl = page.url();

  // Kunden (ikke logget ind) åbner og accepterer
  const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const cp = await customer.newPage();
  await cp.goto(sent.link!);
  await expect(cp.locator("h1")).toHaveText(dealTitle);
  await expect(cp.locator("article")).toContainText("CVR 12345678");
  await expect(cp.locator("article")).toContainText("Opsætning");
  await expect(cp.getByTestId("quote-total")).toHaveText(/3\.688,75\s*kr\./);

  // Sælgeren kan se, at kunden har åbnet tilbuddet
  await page.goto(editorUrl);
  await expect(page.locator("dl").first()).not.toContainText("Ikke endnu");

  await expect(cp.getByLabel("Dit fulde navn")).toHaveValue(contactName);
  await cp.getByRole("checkbox").check();
  await cp.getByRole("button", { name: "Accepter tilbud" }).click();
  await expect(cp.getByRole("status")).toContainText("Tilbuddet er accepteret");
  await cp.reload();
  await expect(cp.locator("article")).toContainText(`Accepteret af ${contactName}`);
  await expect(cp.getByRole("button", { name: "Accepter tilbud" })).toHaveCount(0);
  await expect((await quoteEmailTo(request, email, /^Bekræftelse/)).subject).toContain("accepteret");

  // Dealen er vundet til tilbuddets beløb ekskl. moms, og tilbuddet er låst
  await page.goto(dealUrl);
  await expect(page.locator("header")).toContainText("Vundet");
  await expect(page.locator("header")).toContainText("2.951");
  await expect(page.locator("ol")).toContainText(`accepteret online af ${contactName}`);
  await page
    .getByRole("link", { name: new RegExp(dealTitle) })
    .first()
    .click();
  await expect(page.getByText("Tilbuddet er besvaret og kan ikke ændres")).toBeVisible();
  await expect(page.getByRole("button", { name: "Slet" })).toHaveCount(0);

  // Et nyt tilbud på samme deal afvises af kunden med en begrundelse
  await page.goto(dealUrl);
  await page.getByRole("button", { name: "Nyt tilbud" }).click();
  await expect(page.getByLabel("Beskrivelse, linje 1")).toHaveValue(dealTitle);
  const draftPreview = await page.getByRole("link", { name: "Forhåndsvis" }).getAttribute("href");

  // En kladde kan forhåndsvises af firmaet, men ikke af kunden
  await cp.goto(draftPreview!);
  await expect(cp.locator("body")).toContainText(/findes ikke|ikke fundet|404/i);
  const preview = await page.context().newPage();
  await preview.goto(draftPreview!);
  await expect(preview.getByText("Forhåndsvisning af en kladde")).toBeVisible();
  await preview.close();

  await page.getByRole("button", { name: "Gem og send" }).click();
  await expect(page.getByRole("status")).toContainText("sendt til");
  await cp.goto(draftPreview!);
  await cp.getByRole("button", { name: /Afvis det her/ }).click();
  await cp.getByLabel(/Fortæl os gerne hvorfor/).fill("For dyrt");
  await cp.getByRole("button", { name: "Afvis tilbud" }).click();
  await expect(cp.getByRole("status")).toContainText("Tak for dit svar");
  await customer.close();

  await page.reload();
  await expect(page.locator("header")).toContainText("Afvist");
  await expect(page.locator("dl").first()).toContainText("For dyrt");
});
