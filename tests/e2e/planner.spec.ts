import { expect, test, type Page } from "@playwright/test";

async function createDesign(
  page: Page,
  name = "Test apartment",
  template = "Living room",
) {
  await page.goto("/");
  await page.getByRole("button", { name: template, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New design", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create design" }).click();
  await expect(page.getByRole("main", { name: "Room editor" })).toBeVisible();
}

test("design library creates, persists, duplicates, renames and deletes independent designs", async ({
  page,
}) => {
  await createDesign(page);
  await expect(
    page.getByRole("button", { name: "Test apartment", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to designs" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open Test apartment", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Options for Test apartment", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Test apartment copy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Options for Test apartment copy",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", {
    name: "Rename design",
    exact: true,
  });
  await rename.getByLabel("Name", { exact: true }).fill("Layout B");
  await rename.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Options for Layout B", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete design?" })
    .getByRole("button", { name: "Delete design", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Layout B", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open Test apartment", exact: true }),
  ).toBeVisible();
});

test("furniture edits support undo redo, save after reload and export standalone files", async ({
  page,
}) => {
  await createDesign(page, "Floorplan", "Empty room");
  await page.getByRole("button", { name: "Add Sofa", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Selection", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.keyboard.press("Control+s");
  await page.reload();
  await expect(page.locator("[data-floor-plan] svg").first()).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Design backup JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Floorplan.json");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const svgPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Floor plan SVG" }).click();
  expect((await svgPromise).suggestedFilename()).toBe("Floorplan.svg");
});

test("dialogs trap focus and Escape leaves the underlying editor untouched", async ({
  page,
}) => {
  await createDesign(page, "Keyboard plan", "Empty room");
  await page.getByRole("button", { name: "Add Sofa", exact: true }).click();
  await page
    .getByRole("button", { name: "Keyboard shortcuts", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Keyboard shortcuts",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Selection", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("search, dark appearance and mobile editing have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("textbox", { name: "Search designs" })
    .fill("not-present");
  await expect(
    page.getByText("No designs found", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await createDesign(page, "Mobile plan", "Empty room");
  await page
    .getByRole("button", { name: "Toggle sidebar", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Sofa", exact: true }).click();
  await page
    .getByRole("button", { name: "Close design tools", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("malformed imports preserve existing designs", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":4,"rooms":[{}]}'),
    });
  await expect(
    page.getByRole("button", { name: "Open Untitled design", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your designs" }),
  ).toBeVisible();
});

test("assistant completes a room tool loop through the browser and clears stale conversation", async ({
  page,
}) => {
  await page.route("**/api/local-ai/status", (route) =>
    route.fulfill({
      json: { available: true, provider: "codex", models: ["test-model"] },
    }),
  );
  let requests = 0;
  await page.route("**/api/local-ai/chat", async (route) => {
    const body = route.request().postDataJSON();
    requests++;
    if (requests === 1) {
      expect(body.tools.length).toBeLessThanOrEqual(16);
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "desk-call",
                    type: "function",
                    function: {
                      name: "place_item",
                      arguments: JSON.stringify({
                        presetId: "desk",
                        placement: "wall",
                        wall: "n",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    } else {
      expect(body.messages.at(-1).role).toBe("tool");
      expect(body.messages.at(-1).tool_call_id).toBe("desk-call");
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: "Desk placed along the north wall.",
                tool_calls: [],
              },
            },
          ],
        },
      });
    }
  });
  await createDesign(page, "Assistant plan", "Empty room");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message the assistant" })
    .fill("Add a desk");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Desk placed along the north wall.", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await page
    .getByRole("button", { name: "Back to designs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Untitled design", exact: true })
    .click();
  await expect(
    page.getByText("Desk placed along the north wall.", { exact: true }),
  ).toHaveCount(0);
});

test("stale tabs cannot silently overwrite saved designs", async ({
  page,
  context,
}) => {
  await createDesign(page, "Original", "Empty room");
  await page.keyboard.press("Control+s");
  const stale = await context.newPage();
  await stale.goto(page.url());
  await page.getByRole("button", { name: "Add Sofa", exact: true }).click();
  await page.keyboard.press("Control+s");
  await stale.getByRole("button", { name: "Add Desk", exact: true }).click();
  await stale.keyboard.press("Control+s");
  await expect(stale.getByRole("alert")).toContainText("another tab");
  await stale.getByRole("button", { name: "Export", exact: true }).click();
  const backup = stale.waitForEvent("download");
  await stale
    .getByRole("button", { name: "Design backup JSON", exact: true })
    .click();
  expect((await backup).suggestedFilename()).toBe("Original.json");
  await stale.close();
});

test("a fresh default design survives reload and unknown links return to the library", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Untitled design", exact: true })
    .click();
  const url = page.url();
  await page.reload();
  await expect(
    page.getByRole("main", { name: "Room editor", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  await page.goto("/#design/nonexistent");
  await expect(
    page.getByRole("heading", { name: "Your designs" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#designs$/);
});
