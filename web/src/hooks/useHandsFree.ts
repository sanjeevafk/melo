import { useEffect, useRef, useState } from "react";

import { createVad, type Vad } from "../lib/vad";

export interface HandsFreeOptions {
  /** Master switch; acquiring the mic is gated on this alone. */
  enabled: boolean;
  /** Listening makes sense right now (playback or spoken answer). */
  active: boolean;
  /** Manual push-to-talk owns the conversation — suspend the VAD. */
  suspended: boolean;
  onBargeIn: () => void;
  /** Raw RMS each tick, regardless of gating; feeds end-of-question detection
   * during capture (when the VAD gate is closed). */
  onRms?: (rms: number, nowMs: number) => void;
  onError: (message: string) => void;
}

export interface HandsFreeController {
  /** The open mic stream; hand it to usePushToTalk for question capture. */
  stream: MediaStream | null;
  listening: boolean;
  resetVad: (nowMs?: number) => void;
  getThreshold: () => number;
}

const VAD_OPTIONS = {
  calibrationMs: 500,
  minSpeechMs: 250,
  refractoryMs: 1500,
  floorMultiplier: 2.0,
  minThreshold: 0.004,
} as const;

const TICK_MS = 40;

/**
 * Passive barge-in listener: one long-lived echo-cancelled mic stream plus an
 * energy VAD calibrated against the residual playback floor. The mic is only
 * open while `enabled`; samples are only judged while `active` and not
 * `suspended`. Best with Chrome/Edge AEC or headphones — Firefox on Linux
 * does not reliably cancel speaker audio.
 */
export function useHandsFree({
  enabled,
  active,
  suspended,
  onBargeIn,
  onRms,
  onError,
}: HandsFreeOptions): HandsFreeController {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const vadRef = useRef<Vad | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const onBargeInRef = useRef(onBargeIn);
  onBargeInRef.current = onBargeIn;
  const onRmsRef = useRef(onRms);
  onRmsRef.current = onRms;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let disposed = false;
    let teardown: (() => void) | null = null;
    let gateWasOpen = false;

    const run = async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (disposed) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        const context = new AudioContext();
        // A suspended context never runs its graph — resume so analysis
        // receives samples even though this effect is outside the gesture.
        await context.resume().catch(() => undefined);
        const source = context.createMediaStreamSource(media);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const vad = createVad(VAD_OPTIONS);
        vadRef.current = vad;
        const buffer = new Float32Array(analyser.fftSize);

        const tick = () => {
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let index = 0; index < buffer.length; index += 1) {
            sum += buffer[index] * buffer[index];
          }
          const rms = Math.sqrt(sum / buffer.length);
          const nowMs = performance.now();
          onRmsRef.current?.(rms, nowMs);
          const gateOpen = activeRef.current && !suspendedRef.current;
          if (!gateOpen) {
            if (gateWasOpen) {
              vad.reset(nowMs);
              gateWasOpen = false;
            }
            return;
          }
          gateWasOpen = true;
          if (vad.feed(rms, nowMs) === "barge-in") {
            onBargeInRef.current();
          }
        };
        const interval = window.setInterval(tick, TICK_MS);

        teardown = () => {
          window.clearInterval(interval);
          source.disconnect();
          void context.close().catch(() => undefined);
          media.getTracks().forEach((track) => track.stop());
          vadRef.current = null;
        };
        setStream(media);
      } catch (cause) {
        if (disposed) {
          return;
        }
        // Duck-type the name: DOMException is not an Error subclass in every
        // DOM implementation we run under.
        const name = (cause as { name?: string } | null)?.name;
        const message =
          name === "NotAllowedError"
            ? "Microphone permission is required for hands-free listening."
            : cause instanceof Error
              ? cause.message
              : "Could not start the microphone.";
        onErrorRef.current(message);
      }
    };

    void run();
    return () => {
      disposed = true;
      teardown?.();
      setStream(null);
    };
  }, [enabled]);

  return {
    stream,
    listening: enabled && active && !suspended && stream !== null,
    resetVad: (nowMs?: number) => {
      vadRef.current?.reset(nowMs ?? performance.now());
    },
    getThreshold: () => vadRef.current?.threshold ?? Number.POSITIVE_INFINITY,
  };
}
