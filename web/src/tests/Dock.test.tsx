import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Dock } from "../components/Dock";
import { generateWaveformBars } from "../lib/waveform";
import type { BookManifest } from "../api/types";

const mockBook: BookManifest = {
  id: "styles-ch2",
  title: "The Mysterious Affair at Styles",
  author: "Agatha Christie",
  audio_url: "/media/styles.mp3",
  duration_ms: 120000,
  default_mode: "story",
  provenance: null,
  chapters: [],
  words: [],
  chunks: [],
};

describe("Dock component", () => {
  it("enables mic when a book is loaded even if voice narration is off", () => {
    render(
      <Dock
        book={mockBook}
        currentMs={10000}
        durationMs={120000}
        playing={false}
        rate={1}
        volume={1}
        voiceAvailable={false}
        voiceOn={false}
        onToggleVoice={vi.fn()}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onSkip={vi.fn()}
        onRateChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const micBtn = screen.getByRole("button", { name: /hold to ask/i });
    expect(micBtn).not.toBeDisabled();
  });

  it("triggers 5s rewind when Back button is clicked", () => {
    const handleSkip = vi.fn();
    render(
      <Dock
        book={mockBook}
        currentMs={10000}
        durationMs={120000}
        playing={false}
        rate={1}
        volume={1}
        voiceAvailable={false}
        voiceOn={false}
        onToggleVoice={vi.fn()}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onSkip={handleSkip}
        onRateChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const backBtn = screen.getByTitle("Back 5s");
    fireEvent.click(backBtn);
    expect(handleSkip).toHaveBeenCalledWith(-5000);
  });

  it("dispatches melo:voice-start and melo:voice-stop events", () => {
    const startListener = vi.fn();
    const stopListener = vi.fn();
    window.addEventListener("melo:voice-start", startListener);
    window.addEventListener("melo:voice-stop", stopListener);

    render(
      <Dock
        book={mockBook}
        currentMs={10000}
        durationMs={120000}
        playing={false}
        rate={1}
        volume={1}
        voiceAvailable={false}
        voiceOn={false}
        onToggleVoice={vi.fn()}
        onToggle={vi.fn()}
        onSeek={vi.fn()}
        onSkip={vi.fn()}
        onRateChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const micBtn = screen.getByRole("button", { name: /hold to ask/i });
    fireEvent.pointerDown(micBtn, { button: 0 });
    expect(startListener).toHaveBeenCalled();

    fireEvent.pointerUp(micBtn);
    expect(stopListener).toHaveBeenCalled();

    window.removeEventListener("melo:voice-start", startListener);
    window.removeEventListener("melo:voice-stop", stopListener);
  });
});

describe("generateWaveformBars", () => {
  it("generates correct number of bars within bounds", () => {
    const bars = generateWaveformBars(24);
    expect(bars).toHaveLength(24);
    for (const b of bars) {
      expect(b).toBeGreaterThanOrEqual(15);
      expect(b).toBeLessThanOrEqual(95);
    }
  });
});
