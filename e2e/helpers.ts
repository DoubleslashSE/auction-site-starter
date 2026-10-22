import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// People the tests sign in as. Against the fake API they exist already; against a real house (E2E_TARGET=stack) the
// platform's CI creates them first and passes their addresses and password.
export const BUYER = process.env.E2E_BUYER ?? "buyer@example.com";
export const SELLER = process.env.E2E_SELLER ?? "seller@example.com";
export const PASSWORD = process.env.E2E_PASSWORD ?? "Passw0rd!Dev";
export const RIVAL = process.env.E2E_RIVAL ?? "rival@example.com";
const RIVAL_PASSWORD = process.env.E2E_RIVAL_PASSWORD ?? PASSWORD;
export const STACK = process.env.E2E_TARGET === "stack";

/** Signs in from the site's header through the house's sign-in page and comes back signed in. */
export async function signIn(page: Page, email: string, from = "/") {
  await page.goto(from);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(email === RIVAL ? RIVAL_PASSWORD : PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByRole("link", { name: "My pages" })).toBeVisible();
}

/** No WCAG 2.1 A/AA violations on the page as it is now. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

export function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}
