import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaSession } from "../hooks/useMediaSession";

describe("useMediaSession", () => {
  const handlers: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k]);

    // Mock navigator.mediaSession
    const mockMediaSession = {
      metadata: null,
      playbackState: "none",
      setActionHandler: vi.fn((action: string, handler: unknown) => {
        handlers[action] = handler;
      }),
      setPositionState: vi.fn(),
    };

    Object.defineProperty(navigator, "mediaSession", {
      value: mockMediaSession,
      writable: true,
      configurable: true,
    });
  });

  it("registers media session actions and updates playback state", () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onSeek = vi.fn();
    const onTriggerVoice = vi.fn();

    renderHook(() =>
      useMediaSession({
        title: "Test Book",
        artist: "Test Author",
        playing: true,
        currentMs: 30000,
        durationMs: 120000,
        onPlay,
        onPause,
        onSeek,
        onTriggerVoice,
      }),
    );

    expect(navigator.mediaSession.playbackState).toBe("playing");
    expect(handlers["play"]).toBe(onPlay);
    expect(handlers["pause"]).toBe(onPause);
    expect(handlers["nexttrack"]).toBe(onTriggerVoice);

    // Call nexttrack (earbud double tap)
    const trigger = handlers["nexttrack"] as () => void;
    trigger();
    expect(onTriggerVoice).toHaveBeenCalled();
  });
});
