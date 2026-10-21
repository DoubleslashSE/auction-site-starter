import { expect, test, type Browser } from "@playwright/test";
import { BUYER, expectAccessible, signIn, SELLER, unique } from "./helpers";

// The whole buyer and seller journey on the site: list a lot with a photo, find it, watch it, bid with confirmation,
// get outbid live, and the signed-out, sign-up and phone views. Runs against the fake API by default and against a real
// house with E2E_TARGET=stack (playwright.config.ts).

const RIVAL = process.env.E2E_RIVAL ?? "rival@example.com";

// A 1×1 PNG.
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function listLot(browser: Browser, title: string, startingPrice = "500") {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, SELLER, "/sell");
  await page.goto("/sell");
  await page.getByLabel("Add photos").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PHOTO });
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Listed by the end-to-end tests.");
  await page.getByLabel(/Starting price/).fill(startingPrice);
  await page.getByLabel(/Minimum increment/).fill("50");
  await page.getByRole("button", { name: "List the lot" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const url = page.url();
  await page.context().close();
  return new URL(url).pathname;
}

test("a seller lists a lot with a photo and buyers find it by searching", async ({ browser, page }) => {
  const title = unique("Brass telescope");
  const path = await listLot(browser, title);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "All lots" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Search lots").fill((title.split(" ").at(-1) ?? title).slice(0, 5));
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
  await expect(card).toBeVisible();
  await expect(card.getByText("No bids yet")).toBeVisible();
  await card.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("img", { name: `${title}, photo 1 of 1` })).toBeVisible();
});

test("signed out, the lot page asks to sign in to bid", async ({ browser, page }) => {
  const path = await listLot(browser, unique("Copper kettle"));
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Sign in to bid" })).toBeVisible();
  await expect(page.getByLabel(/Your bid/)).toHaveCount(0);
  await expectAccessible(page);
});

test("a buyer bids after confirming, leads, and sees a rival's bid arrive live", async ({ browser, page }) => {
  const title = unique("Pocket watch");
  const path = await listLot(browser, title, "1000");

  await signIn(page, BUYER, path);
  await page.goto(path);
  await page.getByLabel(/Your bid/).fill("1000");
  await page.getByRole("button", { name: "Place bid" }).click();
  await expect(page.getByText(/Confirm your bid of/)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Confirm bid" }).click();
  await expect(page.getByText("You are the highest bidder")).toBeVisible();
  await expect(page.getByTestId("bids")).toContainText("You (Bidder 1)");

  // A rival in another browser bids more; the buyer's page follows without a reload.
  const rival = await (await browser.newContext()).newPage();
  await signIn(rival, RIVAL, path);
  await rival.goto(path);
  await rival.getByRole("button", { name: /1,050|1 050|1050/ }).first().click();
  await rival.getByRole("button", { name: "Place bid" }).click();
  await rival.getByRole("button", { name: "Confirm bid" }).click();
  await expect(rival.getByText("You are the highest bidder")).toBeVisible();

  await expect(page.getByText("You have been outbid")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("current-price")).toContainText(/1,050|1 050|1050/);
  await rival.context().close();

  await page.goto("/my/bids");
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText("Outbid");
});

test("a buyer watches a lot and finds it on the watchlist", async ({ browser, page }) => {
  const title = unique("Silver spoon");
  const path = await listLot(browser, title);
  await signIn(page, BUYER, path);
  await page.goto(path);
  await page.getByRole("button", { name: "Watch this lot" }).click();
  await expect(page.getByRole("button", { name: "Watching" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: `Stop watching ${title}` }).click();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("browsing by category and sorting keeps the choice in the address", async ({ page }) => {
  await page.goto("/");
  const categories = page.getByRole("navigation", { name: "Categories" });
  if (await categories.isVisible()) {
    const first = categories.getByRole("link").nth(1);
    const name = (await first.textContent()) ?? "";
    await first.click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page).toHaveURL(/category=/);
  }

  await page.getByLabel("Sort by").selectOption("price-desc");
  await expect(page).toHaveURL(/sort=price-desc/);
  await page.getByLabel("No bids yet").check();
  await expect(page).toHaveURL(/noBids=true/);
});

test("a visitor asks for an account and is told to check their email", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(`${unique("new").replace(/\s/g, "")}@example.com`);
  await page.getByRole("button", { name: "Send me the link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expectAccessible(page);
});

test("on a phone the lot grid and the lot page fit the screen @phone", async ({ browser, page }) => {
  const path = await listLot(browser, unique("Teak bowl"));
  for (const url of ["/", path]) {
    await page.goto(url);
    await expect(page.getByRole("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
