import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function createDesign(
  page: Page,
  name = "Test apartment",
  template = "Living room",
) {
  await page.goto("/");
  await page
    .getByRole("button", { name: `Start ${template}`, exact: true })
    .click();
  await expect(page.getByRole("main", { name: "Room editor" })).toBeVisible();
  await page.getByRole("button", { name: /^Rename / }).click();
  await page
    .getByRole("textbox", { name: "Design name", exact: true })
    .fill(name);
  await page
    .getByRole("textbox", { name: "Design name", exact: true })
    .press("Enter");
}

test("design library creates, persists, duplicates, renames and deletes independent designs", async ({
  page,
}) => {
  await createDesign(page);
  await expect(
    page.getByRole("button", { name: "Rename Test apartment", exact: true }),
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
    page
      .getByRole("tablist", { name: "Design tools", exact: true })
      .getByRole("tab", { name: "Furniture", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Select Sofa", exact: false }).click();
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
  await page
    .getByRole("menuitem", { name: "Design backup (JSON)", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Floorplan.json");
  const document = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(document.rooms[0].items).toHaveLength(1);
  expect(document.rooms[0].items[0].name).toBe("Sofa");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const svgPromise = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Floor plan (SVG)", exact: true })
    .click();
  const svg = await svgPromise;
  expect(svg.suggestedFilename()).toBe("Floorplan.svg");
  const drawing = await readFile((await svg.path())!, "utf8");
  expect(drawing).toContain("Sofa");
  expect(drawing).not.toMatch(/var\(|data-editor-only|tabindex|onpointer/i);
});

test("every room preset opens directly with no second picker or placeholder designs", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".design-card")).toHaveCount(0);
  for (const name of ["Empty room", "Living room", "Bedroom", "Home office"]) {
    await page
      .getByRole("button", { name: `Start ${name}`, exact: true })
      .click();
    await expect(
      page.getByRole("main", { name: "Room editor", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Rename ${name === "Empty room" ? "Untitled design" : name}`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to designs", exact: true })
      .click();
  }
  await expect(page.locator(".design-card")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Start Living room", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Rename Living room 2", exact: true }),
  ).toBeVisible();
});

test("deleting the last design leaves the library empty after reload", async ({
  page,
}) => {
  await createDesign(page, "Remove me", "Empty room");
  await page
    .getByRole("button", { name: "Back to designs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Options for Remove me", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete design?", exact: true })
    .getByRole("button", { name: "Delete design", exact: true })
    .click();
  await expect(page.locator(".design-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".design-card")).toHaveCount(0);
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(
    page.getByRole("main", { name: "Room editor", exact: true }),
  ).toBeVisible();
});

test("adding furniture preserves catalog filters and selecting it opens the inspector", async ({
  page,
}) => {
  await createDesign(page, "Catalog plan", "Empty room");
  const tabs = page.getByRole("tablist", { name: "Design tools", exact: true });
  await page.getByRole("button", { name: "Office", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search furniture", exact: true })
    .fill("desk");
  await page.getByRole("button", { name: "Add Desk", exact: true }).click();
  await expect(
    tabs.getByRole("tab", { name: "Furniture", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("searchbox", { name: "Search furniture", exact: true }),
  ).toHaveValue("desk");
  await page.getByRole("button", { name: "Select Desk", exact: false }).click();
  await expect(
    tabs.getByRole("tab", { name: "Selection", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Work desk");
  await name.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Work desk", exact: true }),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Furniture", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search furniture", exact: true }),
  ).toHaveValue("desk");
  await expect(
    page.getByRole("button", { name: "Office", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Escape cancels renaming and menu keystrokes never edit the selected furniture", async ({
  page,
}) => {
  await createDesign(page, "Keep this name", "Empty room");
  await page
    .getByRole("button", { name: "Rename Keep this name", exact: true })
    .click();
  const title = page.getByRole("textbox", { name: "Design name", exact: true });
  await title.fill("Cancel this name");
  await title.press("Escape");
  await expect(
    page.getByRole("button", { name: "Rename Keep this name", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Sofa", exact: true }).click();
  await page.getByRole("button", { name: "Select Sofa", exact: false }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Cancel this furniture name");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .press("Escape");
  await expect(
    page.getByRole("heading", { name: "Sofa", exact: true }),
  ).toBeVisible();
  const options = page.getByRole("button", { name: "Design options", exact: true });
  await options.focus();
  // Keep these events in one browser task, before the menu's animation-frame autofocus.
  await options.evaluate(async (trigger) => {
    trigger.click();
    await Promise.resolve();
    if (!document.querySelector('[role="menu"]')) throw new Error("Design menu did not open");
    for (const key of ["r", "Delete"]) {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
  });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Rotation", exact: true })).toHaveValue("0");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("r");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(options).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Rotation", exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("heading", { name: "Sofa", exact: true }),
  ).toBeVisible();
});

test("floor plan export works from 3D without changing views", async ({
  page,
}) => {
  await createDesign(page, "Bedroom export", "Bedroom");
  await page.getByRole("tab", { name: "3D view", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Floor plan (SVG)", exact: true })
    .click();
  const download = await pending;
  const drawing = await readFile((await download.path())!, "utf8");
  expect(drawing).toContain("Bed (Queen)");
  expect(drawing).toContain("Nightstand");
  await expect(
    page.getByRole("tab", { name: "3D view", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("mobile drawers keep keyboard focus inside and Escape restores the canvas controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createDesign(page, "Mobile drawers", "Empty room");
  await page
    .getByRole("button", { name: "Toggle sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close design tools", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Close design tools", exact: true })
    .press("Shift+Tab");
  await expect
    .poll(() =>
      page.evaluate(() => !!document.activeElement?.closest(".editor-sidebar")),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Toggle sidebar", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Add Sofa", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Room assistant", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("complementary", { name: "Room assistant", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Assistant", exact: true }),
  ).toBeFocused();
});

test("assistant setup and settings preserve drafts and apply edits only on Done", async ({
  page,
}) => {
  await page.route("**/api/local-ai/status", (route) =>
    route.fulfill({
      json: {
        available: false,
        provider: "codex",
        models: [],
        reason: "Start Room Planner with Kessel.",
      },
    }),
  );
  await createDesign(page, "Assistant draft", "Empty room");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const draft = page.getByRole("textbox", {
    name: "Message the assistant",
    exact: true,
  });
  await draft.fill("Keep my desk and add a bed");
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Set up assistant", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Assistant settings",
    exact: true,
  });
  await settings.getByRole("tab", { name: "OpenAI", exact: true }).click();
  await settings
    .getByRole("textbox", { name: "Model", exact: true })
    .fill("discard-this-model");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(draft).toHaveValue("Keep my desk and add a bed");
  await page
    .getByRole("button", { name: "Assistant settings", exact: true })
    .click();
  await expect(
    settings.getByRole("tab", { name: "Local Codex", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await settings.getByRole("tab", { name: "OpenAI", exact: true }).click();
  await expect(
    settings.getByRole("textbox", { name: "Model", exact: true }),
  ).not.toHaveValue("discard-this-model");
  await settings
    .getByRole("textbox", { name: "Model", exact: true })
    .fill("saved-model");
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(draft).toHaveValue("Keep my desk and add a bed");
  await page
    .getByRole("button", { name: "Assistant settings", exact: true })
    .click();
  await expect(
    settings.getByRole("tab", { name: "OpenAI", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    settings.getByRole("textbox", { name: "Model", exact: true }),
  ).toHaveValue("saved-model");
});

test("a failed assistant send restores the request and preserves it when closed", async ({
  page,
}) => {
  await page.route("**/api/local-ai/status", (route) =>
    route.fulfill({
      json: { available: true, provider: "codex", models: ["test-model"] },
    }),
  );
  await page.route("**/api/local-ai/chat", (route) =>
    route.fulfill({ status: 502, json: { error: "Unavailable" } }),
  );
  await createDesign(page, "Retry plan", "Empty room");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.getByRole("button", { name: "Add a desk", exact: true }).click();
  const draft = page.getByRole("textbox", {
    name: "Message the assistant",
    exact: true,
  });
  await expect(draft).toHaveValue("Add a desk");
  await expect(
    page.getByRole("log", { name: "Assistant conversation", exact: true }),
  ).toContainText("502");
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(draft).toHaveValue("Add a desk");
  await expect(
    page.getByRole("log", { name: "Assistant conversation", exact: true }),
  ).toContainText("502");
});

test("dialogs trap focus and Escape leaves the underlying editor untouched", async ({
  page,
}) => {
  await createDesign(page, "Keyboard plan", "Empty room");
  await page.getByRole("button", { name: "Add Sofa", exact: true }).click();
  await page.getByRole("button", { name: "Select Sofa", exact: false }).click();
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
  await createDesign(page, "Keep me", "Empty room");
  await page
    .getByRole("button", { name: "Back to designs", exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":4,"rooms":[{}]}'),
  });
  await expect(
    page.getByRole("button", { name: "Open Keep me", exact: true }),
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
  await page.getByRole("button", { name: "New design", exact: true }).click();
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
    .getByRole("menuitem", { name: "Design backup (JSON)", exact: true })
    .click();
  expect((await backup).suggestedFilename()).toBe("Original.json");
  await stale.close();
});

test("a new design opens directly, survives reload and unknown links return to the library", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New design", exact: true }).click();
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
