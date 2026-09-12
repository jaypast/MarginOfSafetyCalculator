import { expect, test, type Page } from "@playwright/test";

const changesResponse = (newCount: number) => ({
  changes: [],
  quarters: [],
  lastCheckedAt: "2026-09-07T12:00:00.000Z",
  update: {
    newCount,
    checked: newCount > 0,
  },
});

async function mockSp500Changes(page: Page, checkCounts: number[]) {
  let checkIndex = 0;

  await page.route("**/api/sp500/changes**", async (route) => {
    const url = new URL(route.request().url());
    const isDailyCheck = url.searchParams.get("check") === "true";
    const newCount = isDailyCheck
      ? (checkCounts[checkIndex++] ?? checkCounts.at(-1) ?? 0)
      : 0;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(changesResponse(newCount)),
    });
  });
}

test.describe("S&P 500 just-added notification", () => {
  test("shows one toast that expires automatically", async ({ page }) => {
    await mockSp500Changes(page, [1]);
    await page.goto("/");

    const toast = page.getByText("Just added", { exact: true });
    await expect(toast).toHaveCount(1);
    await expect(toast).toBeVisible();
    await expect(page.getByText("1 new S&P 500 change were evaluated.", { exact: true })).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 7_000 });
  });

  test("View opens the changes page and mobile navigation stays on one row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSp500Changes(page, [1, 0]);
    await page.goto("/");

    await page.getByRole("button", { name: "View", exact: true }).click();
    await expect(page).toHaveURL(/\/sp500-changes$/);
    await expect(page.getByRole("heading", { name: "S&P 500 Changes" })).toBeVisible();

    const nav = page.getByTestId("mobile-nav");
    const links = nav.getByRole("link");
    const firstTop = await links.first().evaluate((element) => element.getBoundingClientRect().top);
    const lastTop = await links.last().evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(lastTop - firstTop)).toBeLessThan(8);
  });

  test("same-day repeat stays silent after dismissing the initial toast", async ({ page }) => {
    await mockSp500Changes(page, [1, 0]);
    await page.goto("/");

    const toast = page.getByText("Just added", { exact: true });
    await expect(toast).toBeVisible();
    await page.locator("[toast-close]").click();
    await expect(toast).toBeHidden();

    await page.reload();
    await expect(toast).toHaveCount(0);
  });

  test("an unchanged response stays silent", async ({ page }) => {
    await mockSp500Changes(page, [0]);
    await page.goto("/");
    await expect(page.getByText("Just added", { exact: true })).toHaveCount(0);
  });
});