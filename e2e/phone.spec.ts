import { expect, test } from "@playwright/test";

test("telefon: QR-kode, vejledning og app-manifest", async ({ page, request }) => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Brug på telefonen" }).click();
  await expect(page.getByRole("heading", { name: "Brug Kundespor på telefonen" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR-kode til Kundespor" }).locator("svg")).toBeVisible();
  await expect(page.getByText(/\/dashboard$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "iPhone" })).toContainText("Føj til hjemmeskærm");
  await expect(page.getByRole("region", { name: "Android" })).toContainText("Installer app");

  // Fuld skærm på iPhone og plads til kameraudskæringen
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");

  // Manifestet har ikoner i de størrelser, telefonerne kræver, og de kan hentes
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ""}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512", "512x512 maskable"]));
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});

test("telefon: menuen på mobil linker til vejledningen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Mere" }).click();
  await page.getByRole("link", { name: "Læg på hjemmeskærm" }).click();
  await expect(page).toHaveURL(/\/telefon$/);
});
