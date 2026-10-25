import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHandsFree, type HandsFreeOptions } from "../hooks/useHandsFree";

const TICK_MS = 40;

function makeAnalyser() {
  const queue: number[] = [];
  const analyser = {
    fftSize: 2048,
    getFloatTimeDomainData: (target: Float32Array) => {
      target.fill(queue.shift() ?? 0);
    },
  };
  return { analyser, queue };
}

function makeBrowser(analyser: { fftSize: number }) {
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  const getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  const contextRef: {
    current: { close: (options?: unknown) => Promise<void>; resume: () => Promise<void> } | null;
  } = { current: null };
  const ContextClass = class {
    destination = {};
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
    createAnalyser = vi.fn(() => analyser);
    constructor() {
      contextRef.current = this;
    }
  };
  vi.stubGlobal("AudioContext", ContextClass);
  return {
    track,
    getUserMedia,
    context: () => contextRef.current,
  };
}

async function ticks(count: number) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICK_MS);
    });
  }
}

function renderHandsFree(overrides: Partial<HandsFreeOptions> = {}) {
  const onBargeIn = vi.fn();
  const onRms = vi.fn();
  const onError = vi.fn();
  const hook = renderHook((props: Partial<HandsFreeOptions> = {}) =>
    useHandsFree({
      enabled: true,
      active: true,
      suspended: false,
      onBargeIn,
      onRms,
      onError,
      ...overrides,
      ...props,
    }),
  );
  return { hook, onBargeIn, onRms, onError };
}

describe("useHandsFree", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    const navigatorWithMedia = navigator as { mediaDevices?: unknown };
    delete navigatorWithMedia.mediaDevices;
  });

  it("fires barge-in exactly once after sustained speech over the floor", async () => {
    const { analyser, queue } = makeAnalyser();
    makeBrowser(analyser);
    const { hook, onBargeIn } = renderHandsFree();

    await ticks(1); // getUserMedia resolves, interval starts
    expect(hook.result.current.stream).not.toBeNull();
    expect(hook.result.current.listening).toBe(true);

    await ticks(15); // calibration on the 0.001 floor
    queue.push(...Array<number>(15).fill(0.001));
    await ticks(15);
    expect(hook.result.current.getThreshold()).toBeCloseTo(0.004, 6);

    queue.push(...Array<number>(12).fill(0.1));
    await ticks(12);
    expect(onBargeIn).toHaveBeenCalledTimes(1);

    queue.push(...Array<number>(5).fill(0.1));
    await ticks(5);
    expect(onBargeIn).toHaveBeenCalledTimes(1);
  });

  it("never fires while inactive and still streams RMS", async () => {
    const { analyser, queue } = makeAnalyser();
    makeBrowser(analyser);
    const { hook, onBargeIn, onRms } = renderHandsFree({ active: false });

    await ticks(1);
    queue.push(...Array<number>(30).fill(0.1));
    await ticks(30);

    expect(onBargeIn).not.toHaveBeenCalled();
    const rmsValues = onRms.mock.calls.map((call) => call[0] as number);
    expect(rmsValues.some((rms) => Math.abs(rms - 0.1) < 1e-6)).toBe(true);
    // Re-arming requires a fresh calibration window after the gate opens.
    hook.rerender(makeProps({ active: true }));
    queue.push(...Array<number>(12).fill(0.1));
    await ticks(12);
    expect(onBargeIn).not.toHaveBeenCalled();
  });

  it("does not fire while suspended by manual push-to-talk", async () => {
    const { analyser, queue } = makeAnalyser();
    makeBrowser(analyser);
    const { hook, onBargeIn } = renderHandsFree();

    await ticks(1);
    hook.rerender(makeProps({ suspended: true }));
    queue.push(...Array<number>(30).fill(0.1));
    await ticks(30);
    expect(onBargeIn).not.toHaveBeenCalled();
  });

  it("stops tracks and closes the context when disabled", async () => {
    const { analyser } = makeAnalyser();
    const browser = makeBrowser(analyser);
    const { hook } = renderHandsFree();

    await ticks(1);
    hook.rerender(makeProps({ enabled: false }));

    expect(browser.track.stop).toHaveBeenCalled();
    expect(browser.context()?.close).toHaveBeenCalled();
    expect(hook.result.current.stream).toBeNull();
  });

  it("surfaces permission failures through onError", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("AudioContext", class { createAnalyser = vi.fn(); });
    const { hook, onError } = renderHandsFree();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICK_MS);
    });

    expect(onError).toHaveBeenCalledWith(
      "Microphone permission is required for hands-free listening.",
    );
    expect(hook.result.current.stream).toBeNull();
  });
});

function makeProps(overrides: Partial<HandsFreeOptions>): HandsFreeOptions {
  return {
    enabled: true,
    active: true,
    suspended: false,
    onBargeIn: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}
