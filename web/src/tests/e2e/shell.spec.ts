import { expect, test } from "@playwright/test";

test("loads the MELO shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MELO" })).toBeVisible();
  await expect(page.getByText("A listening companion that stays exactly where you are.")).toBeVisible();
});

test("toggles the Lore Log drawer", async ({ page }) => {
  await page.goto("/");
  const loreButton = page.getByRole("button", { name: /lore log/i });
  await expect(loreButton).toBeVisible();
  await loreButton.click();
  await expect(page.getByRole("heading", { name: "Lore Log" })).toBeVisible();
  await page.getByRole("button", { name: /close lore log/i }).click();
  await expect(page.getByRole("heading", { name: "Lore Log" })).not.toBeVisible();
});

test("opens and cancels the local import dialog", async ({ page }) => {
  await page.goto("/");
  const uploadButton = page.getByRole("button", { name: /add content/i });
  await expect(uploadButton).toBeVisible();
  await uploadButton.click();
  await expect(page.getByRole("heading", { name: "Add audio or document" })).toBeVisible();
  await expect(page.getByText(/MP3, M4B, M4A, EPUB, or TXT/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Add audio or document" })).not.toBeVisible();
});
