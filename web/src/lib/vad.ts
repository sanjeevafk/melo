export interface VadOptions {
  /** Time window of frames used to learn the ambient noise floor. */
  calibrationMs?: number;
  /** Sustained speech above threshold required before a barge-in fires. */
  minSpeechMs?: number;
  /** Minimum lock after a fire even if reset() is called earlier. */
  refractoryMs?: number;
  /** Threshold = median(calibration floor) * this. */
  floorMultiplier?: number;
  /** Lower clamp so a near-silent floor cannot make silence look like speech. */
  minThreshold?: number;
}

const DEFAULTS = {
  calibrationMs: 500,
  minSpeechMs: 350,
  refractoryMs: 1500,
  floorMultiplier: 2.5,
  minThreshold: 0.004,
} as const;

export type VadState = "calibrating" | "armed" | "refractory";

export interface Vad {
  feed(rms: number, nowMs: number): "barge-in" | null;
  /** Re-learn the noise floor; ignored while still inside the refractory lock. */
  reset(nowMs: number): void;
  readonly threshold: number;
  readonly state: VadState;
}

/**
 * Energy barge-in detector for hands-free listening. Calibration learns the
 * post-echo-cancellation floor while playback runs; a run of sustained speech
 * above `median(floor) * floorMultiplier` (clamped) fires once and then locks
 * until reset(). Pure and synchronous so tests can drive it frame by frame.
 */
export function createVad(options: VadOptions = {}): Vad {
  const config = { ...DEFAULTS, ...options };
  let state: VadState = "calibrating";
  let floorSamples: number[] = [];
  let calibrationStartMs = 0;
  let threshold = config.minThreshold;
  let speechStartMs = 0;
  let inSpeech = false;
  let lastFeedMs = 0;
  let refractoryUntilMs = 0;

  const startCalibration = (nowMs: number) => {
    state = "calibrating";
    floorSamples = [];
    calibrationStartMs = nowMs;
    inSpeech = false;
  };

  return {
    get threshold() {
      return threshold;
    },
    get state() {
      return state;
    },
    reset(nowMs: number) {
      if (state === "refractory" && nowMs < refractoryUntilMs) {
        return;
      }
      startCalibration(nowMs);
    },
    feed(rms: number, nowMs: number): "barge-in" | null {
      // Long gaps (throttled background tabs) break any speech run.
      if (nowMs - lastFeedMs > 200) {
        inSpeech = false;
      }
      lastFeedMs = nowMs;

      if (state === "calibrating") {
        if (floorSamples.length === 0) {
          calibrationStartMs = nowMs;
        }
        floorSamples.push(rms);
        if (nowMs - calibrationStartMs >= config.calibrationMs) {
          const sorted = [...floorSamples].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
          threshold = Math.max(config.minThreshold, median * config.floorMultiplier);
          state = "armed";
        }
        return null;
      }
      if (state === "refractory") {
        return null;
      }
      if (rms > threshold) {
        if (!inSpeech) {
          inSpeech = true;
          speechStartMs = nowMs;
        }
        if (nowMs - speechStartMs >= config.minSpeechMs) {
          state = "refractory";
          refractoryUntilMs = nowMs + config.refractoryMs;
          return "barge-in";
        }
      } else {
        inSpeech = false;
      }
      return null;
    },
  };
}

export interface EndpointOptions {
  /** Silence duration, after speech was seen, that ends the question. */
  silenceEndMs?: number;
  /** Shared with the VAD so both use the same calibrated threshold. */
  getThreshold: () => number;
}

export interface SpeechEndpoint {
  feed(rms: number, nowMs: number): "end" | null;
  reset(): void;
}

/** End-of-utterance detector: once speech was seen, silence for
 * silenceEndMs reports "end". The swap point for a learned endpointer. */
export function createEndpoint(options: EndpointOptions): SpeechEndpoint {
  const silenceEndMs = options.silenceEndMs ?? 800;
  let speechSeen = false;
  let lastAboveMs = 0;
  return {
    feed(rms: number, nowMs: number): "end" | null {
      if (rms > options.getThreshold()) {
        speechSeen = true;
        lastAboveMs = nowMs;
        return null;
      }
      if (!speechSeen) {
        return null;
      }
      return nowMs - lastAboveMs >= silenceEndMs ? "end" : null;
    },
    reset() {
      speechSeen = false;
      lastAboveMs = 0;
    },
  };
}
