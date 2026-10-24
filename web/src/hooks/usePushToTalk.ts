import { useCallback, useEffect, useRef, useState } from "react";

interface PushToTalkOptions {
  onStart?: () => Promise<void> | void;
  onRecorded: (blob: Blob, durationMs: number) => Promise<void> | void;
  disabled?: boolean;
  maxDurationMs?: number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function usePushToTalk({
  onStart,
  onRecorded,
  disabled = false,
  maxDurationMs = 15_000,
}: PushToTalkOptions) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const requestedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    requestedRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (disabled || requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    setError(null);
    try {
      await onStart?.();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!requestedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = MIME_CANDIDATES.find((candidate) =>
        MediaRecorder.isTypeSupported(candidate),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        const durationMs = performance.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        requestedRef.current = false;
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setRecording(false);
        if (durationMs < 300) {
          setError("Hold the microphone a little longer.");
          return;
        }
        void onRecorded(blob, durationMs);
      });
      startedAtRef.current = performance.now();
      recorder.start();
      setRecording(true);
      timerRef.current = window.setTimeout(() => stop(), maxDurationMs);
    } catch (cause) {
      requestedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setError(
        cause instanceof Error
          ? cause.name === "NotAllowedError"
            ? "Microphone permission is required for voice questions."
            : cause.message
          : "Could not start the microphone.",
      );
    }
  }, [disabled, maxDurationMs, onRecorded, onStart, stop]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      return Boolean(
        element?.closest("input, textarea, select, button, a, [contenteditable='true']"),
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTyping(event.target)) {
        return;
      }
      event.preventDefault();
      void start();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTyping(event.target)) {
        return;
      }
      event.preventDefault();
      stop();
    };
    const handleBlur = () => {
      if (requestedRef.current) {
        stop();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && requestedRef.current) {
        stop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      requestedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [start, stop]);

  return {
    recording,
    error,
    start,
    stop,
  };
}
