import { expect, test } from "@playwright/test";

/**
 * Hands-free barge-in, end to end but model-free: the mic is Chrome's fake
 * device and an init script rewrites every analyser frame with a one-shot
 * speech envelope (silent for 1.2s after the first play, then a 1.4s burst,
 * then silent forever), while /api/voice-query is scripted per scenario.
 */

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

const HEALTH = {
  ready: true,
  profile: "cpu",
  models: {},
  db: "ready",
};

function ndjson(events: object[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

async function setupHandsFree(page: import("@playwright/test").Page, voiceEvents: object[]) {
  await page.addInitScript(() => {
    const media = HTMLMediaElement.prototype;
    const originalPlay = media.play;
    const originalPause = media.pause;
    const originalGet = AnalyserNode.prototype.getFloatTimeDomainData;
    let playStartedAt: number | null = null;
    let burstDone = false;
    media.play = function () {
      if (!burstDone) {
        playStartedAt = performance.now();
      }
      return originalPlay.call(this);
    };
    media.pause = function () {
      return originalPause.call(this);
    };
    AnalyserNode.prototype.getFloatTimeDomainData = function (target: Float32Array<ArrayBuffer>) {
      originalGet.call(this, target);
      let value = 0.0005;
      if (!burstDone && playStartedAt !== null) {
        const since = performance.now() - playStartedAt;
        // One long burst (1.2s–8s after play): short enough to end the
        // capture via silence endpointing, long enough to still be speaking
        // whenever the barge-in capture actually starts.
        if (since > 8000) {
          burstDone = true;
        } else if (since > 1200) {
          value = 0.2;
        }
      }
      target.fill(value);
    };
  });

  await page.route("**/api/health", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HEALTH) });
  });
  await page.route("**/api/voice-query", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson(voiceEvents),
    });
  });

  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Hands-free listening" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  return toggle;
}

test.describe("hands-free barge-in", () => {
  test("speech over playback pauses the book and honours “stop”", async ({ page }) => {
    await setupHandsFree(page, [
      { type: "status", stage: "transcribing" },
      { type: "transcript", text: "stop." },
    ]);

    await page.getByRole("button", { name: "Play narration" }).click();

    // The speech burst trips the VAD; barge-in pauses the book.
    await expect(page.getByRole("button", { name: "Play narration" })).toBeVisible({
      timeout: 8_000,
    });
    // The captured question is intercepted as a control word: the stream is
    // consumed before the answer pipeline, and the book stays paused.
    await expect(page.getByText("Paused — press play to continue.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Play narration" })).toBeVisible();
  });

  test("a false barge-in resumes the book instead of erroring", async ({ page }) => {
    await setupHandsFree(page, [
      { type: "status", stage: "transcribing" },
      { type: "error", code: "mic_empty", message: "I did not catch any speech" },
      { type: "done" },
    ]);

    await page.getByRole("button", { name: "Play narration" }).click();

    await expect(page.getByRole("button", { name: "Play narration" })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("Didn't catch that — picking up where we left off.")).toBeVisible({
      timeout: 20_000,
    });
    // Auto-resume puts the narration back in play.
    await expect(page.getByRole("button", { name: "Pause narration" })).toBeVisible({
      timeout: 5_000,
    });
  });
});
