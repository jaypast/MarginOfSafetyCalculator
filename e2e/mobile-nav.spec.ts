import { expect, test } from "@playwright/test";

test("mobile navigation remains a single row at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const nav = page.getByTestId("mobile-nav");
  await expect(nav).toBeVisible();

  const height = await nav.evaluate((element) =>
    element.getBoundingClientRect().height,
  );

  expect(height).toBeLessThanOrEqual(70);
});