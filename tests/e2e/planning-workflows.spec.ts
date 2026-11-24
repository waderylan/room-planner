import { expect, test, type Page } from "@playwright/test";

async function apartment(page: Page, name: string) {
  await page.goto("/#designs");
  await page
    .getByRole("button", { name: "Start Empty room", exact: true })
    .click();
  await page.getByRole("button", { name: /^Rename / }).click();
  const input = page.getByRole("textbox", { name: "Design name", exact: true });
  await input.fill(name);
  await input.press("Enter");
  await page
    .getByRole("button", { name: "Back to designs", exact: true })
    .click();
}

test("custom furniture persists and trials compare true-size pieces without changing originals", async ({
  page,
}) => {
  await apartment(page, "Apartment A");
  await apartment(page, "Apartment B");
  await page.getByRole("link", { name: "My furniture", exact: true }).click();
  await page
    .getByRole("button", { name: "New furniture", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "New furniture",
    exact: true,
  });
  await dialog.getByLabel("Furniture name", { exact: true }).fill("My sofa");
  await dialog.getByLabel("Furniture units").selectOption("m");
  for (const [name, value] of [
    ["Width", "2"],
    ["Depth", "0.9"],
    ["Height", "0.8"],
  ]) {
    await dialog.getByRole("textbox", { name, exact: true }).fill(value);
    await dialog.getByRole("textbox", { name, exact: true }).press("Tab");
  }
  await dialog
    .getByRole("button", { name: "Save furniture", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My sofa", exact: true }),
  ).toBeVisible();
  await page.goto("/#compare");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Apartment A", exact: true }),
  });
  await expect(card.getByText("Not placed", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Try my furniture", exact: true })
    .click();
  await expect(card.getByText("Placed", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#compare$/);
  await card
    .getByRole("button", { name: "Save trial copy", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Trial saved", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Back to designs", exact: true })
    .click();
  await expect(page.locator(".design-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Open Apartment A", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select My sofa", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Back to designs", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Open Apartment A furniture trial",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Select My sofa", exact: true }),
  ).toBeVisible();
});

test("product import reviews extracted measurements and saves their source", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/furniture/import", async (route) => {
    requests++;
    expect(route.request().postDataJSON().url).toContain("ikea.com");
    await route.fulfill({
      json: {
        sourceUrl:
          "https://www.ikea.com/us/en/p/lack-side-table-white-30449908/",
        candidates: [
          {
            name: "LACK",
            widthM: 0.55,
            depthM: 0.55,
            heightM: 0.45,
            sku: "304.499.08",
          },
        ],
        warnings: [],
      },
    });
  });
  await page.goto("/#furniture");
  await page
    .getByRole("button", { name: "Import from link", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import furniture",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "Product link", exact: true })
    .fill("https://www.ikea.com/us/en/p/lack-side-table-white-30449908/");
  await dialog
    .getByRole("button", { name: "Find furniture", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Furniture name", exact: true }),
  ).toHaveValue("LACK");
  await dialog
    .getByRole("combobox", { name: "Dimension unit" })
    .selectOption("cm");
  await expect(
    dialog.getByLabel("Furniture width", { exact: true }),
  ).toHaveValue("55");
  await dialog
    .getByRole("combobox", { name: "Dimension unit" })
    .selectOption("in");
  await dialog
    .getByRole("combobox", { name: "Dimension unit" })
    .selectOption("cm");
  await expect(
    dialog.getByLabel("Furniture width", { exact: true }),
  ).toHaveValue("55");
  await dialog
    .getByRole("button", { name: "Save furniture", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "LACK", exact: true }),
  ).toBeVisible();
  const width = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("room-planner:inventory:v1")!).entries[0]
        .footprint.w,
  );
  expect(width).toBe(0.55);
  expect(requests).toBe(1);
  await page
    .getByRole("button", { name: "Furniture options for LACK" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Open product page" }),
  ).toBeVisible();
});

test("shared layouts persist cross-browser votes and comments, and owner revocation removes access", async ({
  page,
  browser,
}) => {
  await apartment(page, "Choice A");
  await apartment(page, "Choice B");
  await page.goto("/#compare");
  await page
    .getByRole("button", { name: "Share options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create invite link", exact: true })
    .click();
  const link = page.getByRole("textbox", {
    name: "Layout invite link",
    exact: true,
  });
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  expect(url).toMatch(/#share\/[a-f0-9]{48}$/);
  const visitor = await browser.newContext();
  try {
    const guest = await visitor.newPage();
    await guest.goto(url);
    await expect(
      guest.getByRole("heading", { name: "Layout options", exact: true }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Choose this layout", exact: true })
      .click();
    const name = guest.getByRole("dialog", { name: "Your name", exact: true });
    await name
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Taylor");
    await name
      .getByRole("button", { name: "Save choice", exact: true })
      .click();
    await expect(
      guest.getByRole("button", { name: "Your choice", exact: true }),
    ).toBeVisible();
    await guest
      .getByRole("textbox", { name: "Comment on Choice A", exact: true })
      .fill("The sofa leaves more room here.");
    const commentSaved = guest.waitForResponse(
      (response) =>
        response.url().endsWith("/comments") &&
        response.request().method() === "POST",
    );
    await guest
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    expect((await commentSaved).status()).toBe(201);
    await expect(
      guest.getByRole("textbox", { name: "Comment on Choice A", exact: true }),
    ).toHaveValue("");
    await guest.reload();
    await expect(
      guest.getByText("The sofa leaves more room here.", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Your choice", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await guest.reload();
    await expect(guest.getByRole("alert")).toContainText(
      /expired|revoked|unavailable|not found/i,
    );
  } finally {
    await visitor.close();
  }
});

test("new workspace pages fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["#designs", "#furniture", "#compare"]) {
    await page.goto(`/${route}`);
    await expect(page.locator("main")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
});
