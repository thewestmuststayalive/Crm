import { expect, type Page } from "@playwright/test";

export const OWNER = { name: "Olivia Ejer", email: "ejer@example.com", password: "hemmelig123", company: "Firma A" };

/** Unikt suffiks, så tests ikke støder ind i hinandens data. */
export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Vælger firma i firmavælgeren og venter på, at siden skifter. */
export async function switchWorkspace(page: Page, name: string) {
  await page.goto("/dashboard");
  await page.selectOption("#workspace", { label: name });
  await expect(page.locator("main")).toContainText(`Du arbejder i ${name}`);
}
