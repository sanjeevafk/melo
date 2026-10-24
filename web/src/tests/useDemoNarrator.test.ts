import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDemoNarrator } from "../hooks/useDemoNarrator";
import type { WordTiming as ApiWordTiming } from "../api/types";

const words: ApiWordTiming[] = [
  { word: "THE", start_ms: 0, end_ms: 300, chunk_id: "c1" },
  { word: "CITY", start_ms: 350, end_ms: 700, chunk_id: "c1" },
  { word: "NEVER", start_ms: 750, end_ms: 1100, chunk_id: "c1" },
  { word: "SLEEPS,", start_ms: 1150, end_ms: 1500, chunk_id: "c1" },
  { word: "She", start_ms: 3000, end_ms: 3300, chunk_id: "c2" },
  { word: "leapt.", start_ms: 3350, end_ms: 3700, chunk_id: "c2" },
];

describe("useDemoNarrator", () => {
  let speak: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speak = vi.fn();
    cancel = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      text: string;
      rate = 1;
      pitch = 1;
      volume = 1;
      lang = "";
      voice: SpeechSynthesisVoice | null = null;
      constructor(text: string) {
        this.text = text;
      }
    });
    vi.stubGlobal("speechSynthesis", {
      getVoices: vi.fn(() => []),
      speak,
      cancel,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speaks the sentence under the playhead while playing", () => {
    const { rerender } = renderHook(() =>
      useDemoNarrator({ enabled: true, playing: true, rate: 1, words, currentMs: 0, bookId: "b1" }),
    );
    rerender();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toBe("THE CITY NEVER SLEEPS,");
  });

  it("does not restart speech while the playhead moves within one sentence", () => {
    const { rerender } = renderHook(
      ({ currentMs }: { currentMs: number }) =>
        useDemoNarrator({ enabled: true, playing: true, rate: 1, words, currentMs, bookId: "b1" }),
      { initialProps: { currentMs: 0 } },
    );
    rerender({ currentMs: 800 });
    rerender({ currentMs: 1200 });
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("speaks the next sentence when the playhead crosses into it", () => {
    const { rerender } = renderHook(
      ({ currentMs }: { currentMs: number }) =>
        useDemoNarrator({ enabled: true, playing: true, rate: 1, words, currentMs, bookId: "b1" }),
      { initialProps: { currentMs: 0 } },
    );
    rerender({ currentMs: 3100 });
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][0].text).toBe("She leapt.");
  });

  it("cancels speech when playback pauses", () => {
    const { rerender } = renderHook(
      ({ playing }: { playing: boolean }) =>
        useDemoNarrator({
          enabled: true,
          playing,
          rate: 1,
          words,
          currentMs: 0,
          bookId: "b1",
        }),
      { initialProps: { playing: true } },
    );
    rerender({ playing: false });
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("stays silent when disabled", () => {
    renderHook(() =>
      useDemoNarrator({ enabled: false, playing: true, rate: 1, words, currentMs: 0, bookId: "b1" }),
    );
    expect(speak).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it("never speaks words beyond the playhead's sentence", () => {
    const { rerender } = renderHook(
      ({ currentMs }: { currentMs: number }) =>
        useDemoNarrator({ enabled: true, playing: true, rate: 1, words, currentMs, bookId: "b1" }),
      { initialProps: { currentMs: 700 } },
    );
    rerender({ currentMs: 3699 });
    const spoken = speak.mock.calls.map((call) => call[0].text as string);
    expect(spoken[0]).toBe("THE CITY NEVER SLEEPS,");
    expect(spoken[1]).toBe("She leapt.");
    expect(spoken.every((text) => !text.includes("NEVER SLEEPS, She"))).toBe(true);
  });
});
