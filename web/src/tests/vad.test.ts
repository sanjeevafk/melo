import { describe, expect, it } from "vitest";

import { createEndpoint, createVad } from "../lib/vad";

const TICK_MS = 40;

function feedFrames(
  vad: { feed: (rms: number, nowMs: number) => string | null },
  values: number[],
  startMs = 0,
): { event: string; at: number }[] {
  const events: { event: string; at: number }[] = [];
  let nowMs = startMs;
  for (const value of values) {
    const fired = vad.feed(value, nowMs);
    if (fired) {
      events.push({ event: fired, at: nowMs });
    }
    nowMs += TICK_MS;
  }
  return events;
}

describe("createVad", () => {
  it("stays silent through calibration and fires once on sustained speech", () => {
    const vad = createVad();
    const frames = [
      ...Array<number>(15).fill(0.001),
      ...Array<number>(12).fill(0.1),
    ];
    const events = feedFrames(vad, frames);
    // Calibration completes on frame 13 (t=520ms); the speech run starting at
    // t=600ms reaches minSpeechMs on its 9th frame (t=960ms).
    expect(events).toEqual([{ event: "barge-in", at: 24 * TICK_MS }]);
    expect(vad.state).toBe("refractory");
  });

  it("ignores brief bursts shorter than minSpeechMs", () => {
    const vad = createVad();
    const frames = [
      ...Array<number>(15).fill(0.001),
      ...Array<number>(2).fill(0.1),
      0.001,
      ...Array<number>(5).fill(0.1),
      0.001,
    ];
    expect(feedFrames(vad, frames)).toEqual([]);
    expect(vad.state).toBe("armed");
  });

  it("does not fire again until reset after the refractory lock", () => {
    const vad = createVad();
    feedFrames(vad, [...Array<number>(15).fill(0.001), ...Array<number>(10).fill(0.1)]);
    expect(feedFrames(vad, Array<number>(5).fill(0.1))).toEqual([]);
    // reset() inside the refractory lock is ignored.
    vad.reset(0);
    expect(vad.state).toBe("refractory");
    // The lock expired by t=2460 (fired at 960 + 1500); reset() re-arms.
    vad.reset(2500);
    expect(vad.state).toBe("calibrating");
    feedFrames(vad, Array<number>(15).fill(0.001));
    expect(vad.state).toBe("armed");
    expect(feedFrames(vad, Array<number>(10).fill(0.1))).toHaveLength(1);
  });

  it("derives the threshold from the calibration median and clamps it", () => {
    const clamped = createVad({ minThreshold: 0.004 });
    feedFrames(clamped, Array<number>(15).fill(0.001));
    expect(clamped.threshold).toBeCloseTo(0.004, 6);

    const derived = createVad({ minThreshold: 0.001 });
    feedFrames(derived, Array<number>(15).fill(0.01));
    expect(derived.threshold).toBeCloseTo(0.025, 6);
  });

  it("keeps the speech run honest across long feed gaps", () => {
    const vad = createVad();
    feedFrames(vad, Array<number>(15).fill(0.001));
    expect(vad.state).toBe("armed");
    // Two 40ms runs separated by a >200ms gap never accumulate to minSpeechMs.
    feedFrames(vad, [0.1, 0.1], 100_000);
    const events = feedFrames(vad, [0.1, 0.1], 100_500);
    expect(events).toEqual([]);
    expect(vad.state).toBe("armed");
  });
});

describe("createEndpoint", () => {
  it("ends after silence once speech was seen", () => {
    const endpoint = createEndpoint({ getThreshold: () => 0.01, silenceEndMs: 800 });
    const frames = [
      ...Array<number>(5).fill(0.1),
      ...Array<number>(20).fill(0.001),
    ];
    const events = feedFrames(endpoint, frames);
    // Last speech at t=160ms; 800ms of silence completes at t=960ms.
    expect(events).toEqual([{ event: "end", at: 24 * TICK_MS }]);
  });

  it("never ends when silence precedes any speech", () => {
    const endpoint = createEndpoint({ getThreshold: () => 0.01, silenceEndMs: 800 });
    expect(feedFrames(endpoint, Array<number>(30).fill(0.001))).toEqual([]);
  });

  it("restarts the silence clock on new speech", () => {
    const endpoint = createEndpoint({ getThreshold: () => 0.01, silenceEndMs: 800 });
    const frames = [
      ...Array<number>(5).fill(0.1),
      ...Array<number>(10).fill(0.001),
      0.1,
      ...Array<number>(20).fill(0.001),
    ];
    const events = feedFrames(endpoint, frames);
    // The mid-stream speech at t=600ms resets the clock; end at t=1400ms.
    expect(events).toEqual([{ event: "end", at: 35 * TICK_MS }]);
  });
});
