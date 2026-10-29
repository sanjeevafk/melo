import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Ear, Mic, Quote, ShieldCheck, Square, TriangleAlert } from "./ui/icons";

import type { BookManifest, Mode } from "../api/types";
import { useHandsFree } from "../hooks/useHandsFree";
import { usePushToTalk } from "../hooks/usePushToTalk";
import { useVoiceAnswer } from "../hooks/useVoiceAnswer";
import { createEndpoint, type SpeechEndpoint } from "../lib/vad";
import { matchControlCommand } from "../lib/voiceCommands";
import { formatDuration } from "../lib/time";

interface VoiceDockProps {
  book: BookManifest | null;
  currentMs: number;
  mode: Mode;
  ready: boolean;
  showTimings: boolean;
  playing: boolean;
  simulated: boolean;
  onPause: () => Promise<boolean>;
  onResumeAt: (tMs: number) => void;
  onAnswered?: () => void;
  onSwitchMode?: (mode: Mode) => void;
}

const REFUSAL_SENTENCE = "I can't answer that from what you've heard so far.";
const BEYOND_MARKER = "Beyond the document:";

type VoiceStatus = ReturnType<typeof useVoiceAnswer>["state"]["status"];

function statusLabel(passiveListening: boolean, recording: boolean, status: VoiceStatus): string {
  if (recording) {
    return "Listening… release to send";
  }
  if (passiveListening) {
    return "Listening hands-free…";
  }
  switch (status) {
    case "transcribing":
      return "Transcribing locally…";
    case "thinking":
      return "Retrieving evidence…";
    case "speaking":
      return "Speaking…";
    case "done":
      return "Answer ready";
    case "error":
      return "Could not answer";
    default:
      return "Hold to ask companion";
  }
}

type OrbPhase = "idle" | "listening" | "working" | "speaking" | "error";

function orbPhase(passiveListening: boolean, recording: boolean, status: VoiceStatus): OrbPhase {
  if (recording) return "listening";
  if (status === "transcribing" || status === "thinking") return "working";
  if (status === "speaking") return "speaking";
  if (status === "error") return "error";
  if (passiveListening) return "listening";
  return "idle";
}

const ORB_GRADIENT: Record<OrbPhase, string> = {
  idle: "from-[#cba36e] to-[#9c7b4c]",
  listening: "from-[#c96a63] to-[#8f3a34]",
  working: "from-[#cba36e] via-[#e5dec9] to-[#9c7b4c]",
  speaking: "from-[#7ea38f] to-[#4e755f]",
  error: "from-[#c96a63] to-[#8f3a34]",
};

export function VoiceDock({
  book,
  currentMs,
  mode,
  ready,
  showTimings,
  playing,
  simulated,
  onPause,
  onResumeAt,
  onAnswered,
  onSwitchMode,
}: VoiceDockProps) {
  const voice = useVoiceAnswer();
  const wasPlayingRef = useRef(false);
  const capturedTMsRef = useRef(0);
  const [handsFreeOn, setHandsFreeOn] = useState(false);
  const [handsFreeError, setHandsFreeError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pushRecording, setPushRecording] = useState(false);
  const hintTimerRef = useRef<number | null>(null);
  const currentMsRef = useRef(currentMs);
  currentMsRef.current = currentMs;
  const handsFreeCaptureRef = useRef(false);
  const pushRecordingRef = useRef(false);

  const startRef = useRef<() => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);
  const bargeInRef = useRef<() => void>(() => undefined);
  const getThresholdRef = useRef<() => number>(() => Number.POSITIVE_INFINITY);
  const endpointRef = useRef<SpeechEndpoint | null>(null);
  if (endpointRef.current === null) {
    endpointRef.current = createEndpoint({
      getThreshold: () => getThresholdRef.current(),
      silenceEndMs: 800,
    });
  }

  const showHint = useCallback((message: string) => {
    setHint(message);
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => setHint(null), 3500);
  }, []);

  useEffect(
    () => () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    },
    [],
  );

  // During a barge-in capture, sustained silence ends the question.
  const handleRms = useCallback((rms: number, nowMs: number) => {
    if (!pushRecordingRef.current) {
      return;
    }
    if (endpointRef.current?.feed(rms, nowMs) === "end") {
      endpointRef.current?.reset();
      stopRef.current();
    }
  }, []);

  const handsFree = useHandsFree({
    enabled: handsFreeOn && Boolean(book) && ready && !simulated,
    active: playing || voice.state.status === "speaking",
    suspended: pushRecording,
    onBargeIn: () => bargeInRef.current(),
    onRms: handleRms,
    onError: setHandsFreeError,
  });
  getThresholdRef.current = handsFree.getThreshold;

  // Barge-in reuses the exact push-to-talk protocol via start() → onStart
  // (cancel in-flight, pause playback, chime, capture); it only arms the
  // hands-free flag and the endpoint detector around it.
  const handleBargeIn = useCallback(() => {
    if (!book) {
      return;
    }
    endpointRef.current?.reset();
    startRef.current();
    // Set after start() so it cannot be cleared mid-flight; this flag must
    // only be true for barge-in captures, never manual ones.
    handsFreeCaptureRef.current = true;
  }, [book]);
  bargeInRef.current = () => void handleBargeIn();

  const {
    recording,
    error: microphoneError,
    start,
    stop,
  } = usePushToTalk({
    disabled: !book || !ready,
    stream: handsFree.stream,
    keyboardControls: !handsFreeOn,
    onRecordingChange: setPushRecording,
    onStart: async () => {
      capturedTMsRef.current = currentMsRef.current;
      voice.cancel();
      voice.primeAudio();
      wasPlayingRef.current = await onPause();
      await voice.playChime();
    },
    onRecorded: async (blob) => {
      if (!book) {
        return;
      }
      const wasHandsFree = handsFreeCaptureRef.current;
      handsFreeCaptureRef.current = false;
      const outcome = await voice.send(blob, {
        bookId: book.id,
        tMs: capturedTMsRef.current,
        mode,
        onTranscript: (text) => (matchControlCommand(text) ? "consume" : "continue"),
      });
      if (outcome === "consumed") {
        showHint("Paused — press play to continue.");
        return;
      }
      if (outcome === "empty" && wasHandsFree) {
        showHint("Didn't catch that — picking up where we left off.");
        if (wasPlayingRef.current) {
          await new Promise((resolve) => window.setTimeout(resolve, 800));
          onResumeAt(Math.max(0, capturedTMsRef.current - 5000));
        }
        return;
      }
      onAnswered?.();
      if (wasPlayingRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        onResumeAt(Math.max(0, capturedTMsRef.current - 5000));
      }
    },
  });

  startRef.current = start;
  stopRef.current = stop;
  pushRecordingRef.current = recording;

  // When a capture ends without sending (discarded short clip), a hands-free
  // capture resumes the book instead of nagging with an error.
  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (prevRecordingRef.current && !recording) {
      handsFree.resetVad();
      if (handsFreeCaptureRef.current && microphoneError) {
        handsFreeCaptureRef.current = false;
        showHint("Didn't catch that — picking up where we left off.");
        if (wasPlayingRef.current) {
          onResumeAt(Math.max(0, capturedTMsRef.current - 5000));
        }
      }
    }
    prevRecordingRef.current = recording;
  }, [recording, microphoneError, handsFree, showHint, onResumeAt]);

  const micDisabledRef = useRef(!book || !ready);
  micDisabledRef.current = !book || !ready;

  const error = microphoneError ?? voice.state.error ?? handsFreeError;
  const timings = voice.state.timings;
  const firstAudioMs = timings ? timings.llm_first_token_ms + timings.tts_first_sentence_ms : null;
  const passiveListening =
    handsFreeOn &&
    handsFree.listening &&
    (voice.state.status === "idle" || voice.state.status === "done");
  const phase = orbPhase(passiveListening, recording, voice.state.status);
  const label = ready
    ? statusLabel(passiveListening, recording, voice.state.status)
    : "Loading models…";
  const busy = phase === "working";
  useEffect(() => {
    const handleStart = () => {
      if (!micDisabledRef.current) {
        void startRef.current();
      }
    };
    const handleStop = () => stopRef.current();
    window.addEventListener("melo:voice-start", handleStart);
    window.addEventListener("echoread:voice-start", handleStart);
    window.addEventListener("melo:voice-stop", handleStop);
    window.addEventListener("echoread:voice-stop", handleStop);
    return () => {
      window.removeEventListener("melo:voice-start", handleStart);
      window.removeEventListener("echoread:voice-start", handleStart);
      window.removeEventListener("melo:voice-stop", handleStop);
      window.removeEventListener("echoread:voice-stop", handleStop);
    };
  }, []);

  // Mirror the voice phase onto <html> so the dock mic can restyle itself.
  useEffect(() => {
    document.documentElement.dataset.voicePhase = phase;
    return () => {
      delete document.documentElement.dataset.voicePhase;
    };
  }, [phase]);

  // Answer-panel states from the streamed answer text.
  const answer = voice.state.answer;
  const beyondIdx = answer ? answer.indexOf(BEYOND_MARKER) : -1;
  const groundedAnswer =
    answer === null ? null : beyondIdx >= 0 ? answer.slice(0, beyondIdx).trim() : answer;
  const beyondAnswer =
    answer && beyondIdx >= 0 ? answer.slice(beyondIdx + BEYOND_MARKER.length).trim() : null;
  const isRefusal = Boolean(answer && answer.startsWith(REFUSAL_SENTENCE));

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="voice-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-[#cba36e]">
            <AudioLines size={13} aria-hidden="true" />
            Companion
          </p>
          <h2 id="voice-heading" className="mt-1.5 font-display text-lg font-medium text-[#f5f0e6]">
            Voice inquiry
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!simulated ? (
            <button
              type="button"
              role="switch"
              aria-checked={handsFreeOn}
              aria-label="Hands-free listening"
              disabled={!book || !ready}
              onClick={() => {
                setHandsFreeOn((previous) => !previous);
                setHandsFreeError(null);
              }}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                handsFreeOn
                  ? "border-amber/50 bg-amber/10 text-amber"
                  : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/25 hover:text-white/60"
              }`}
            >
              <Ear size={11} aria-hidden="true" />
              Hands-free
            </button>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
            Private inference
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/30 p-3.5">
        {/* Interactive Mic Orb */}
        <div className="relative grid size-16 shrink-0 place-items-center">
          {(phase === "listening" || phase === "speaking") && (
            <>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 animate-ping rounded-full border opacity-50 ${
                  phase === "listening" ? "border-[#c96a63]" : "border-[#7ea38f]"
                }`}
              />
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-2 animate-pulse rounded-full border opacity-30 ${
                  phase === "listening" ? "border-[#c96a63]" : "border-[#7ea38f]"
                }`}
              />
            </>
          )}

          <button
            type="button"
            disabled={!book || !ready}
            onPointerDown={(event) => {
              if (event.button !== 0 || !book || !ready) {
                return;
              }
              event.currentTarget.setPointerCapture(event.pointerId);
              void start();
            }}
            onPointerUp={() => stop()}
            onPointerCancel={() => stop()}
            onPointerLeave={() => {
              if (recording) {
                stop();
              }
            }}
            aria-label={recording ? "Stop recording and ask" : "Hold to ask a question"}
            aria-pressed={recording}
            className={`relative grid size-12 place-items-center overflow-hidden rounded-full bg-gradient-to-br text-[#0c0d10] shadow-md transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${ORB_GRADIENT[phase]}`}
          >
            <span className="relative grid place-items-center">
              {recording ? (
                <Square size={15} fill="currentColor" aria-hidden="true" />
              ) : (
                <Mic size={18} aria-hidden="true" />
              )}
            </span>
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[#f5f0e6]/90 transition-opacity duration-200">
            {label}
          </p>
          {handsFreeOn ? (
            <p className="mt-0.5 text-[11px] text-white/40">
              Just speak — say “stop” or ask a question. Best in Chrome/Edge or with headphones.
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-white/40">
              Hold button or{" "}
              <kbd className="rounded border border-white/15 bg-white/[0.05] px-1 py-0.5 font-mono text-[9px] text-white/60">
                Space
              </kbd>{" "}
              to speak.
            </p>
          )}

          {/* Equalizer Waveform indicator */}
          <div className="mt-2.5 flex h-3 items-end gap-[2px]" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, index) => {
              const isLive = phase === "listening" || phase === "speaking";
              const barHeight = isLive
                ? `${35 + ((index * 29) % 65)}%`
                : busy
                  ? `${20 + ((index * 17) % 55)}%`
                  : "15%";
              return (
                <span
                  key={index}
                  className={`w-[2px] rounded-full transition-all duration-300 ${
                    phase === "listening"
                      ? "bg-[#c96a63]"
                      : phase === "speaking"
                        ? "bg-[#7ea38f]"
                        : busy
                          ? "bg-[#cba36e]/60"
                          : "bg-white/10"
                  }`}
                  style={{
                    height: barHeight,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3.5 rounded-xl border border-[#c96a63]/30 bg-[#c96a63]/10 p-3 text-xs text-[#c96a63] transition-opacity duration-200">
          <p className="flex items-center gap-2">
            <TriangleAlert size={14} aria-hidden="true" />
            {error}
          </p>
        </div>
      ) : null}

      {hint ? (
        <div className="mt-3.5 rounded-xl border border-amber/30 bg-amber/[0.06] p-3 text-xs text-amber transition-opacity duration-200">
          <p className="flex items-center gap-2">
            <AudioLines size={14} aria-hidden="true" />
            {hint}
          </p>
        </div>
      ) : null}

      {voice.state.transcript ? (
        <div className="mt-3.5 transition-opacity duration-200">
          <p className="eyebrow text-white/40">You asked</p>
          <p className="mt-1 rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs text-white/70">
            {voice.state.transcript}
          </p>
        </div>
      ) : null}

      {answer ? (
        <div className="mt-3.5 transition-opacity duration-200">
          {/* Header: mode badge + listener position stamp */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow text-[#cba36e]">Answer</p>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                mode === "story"
                  ? "border-amber/40 bg-amber/10 text-amber"
                  : "border-[#6FB7C9]/40 bg-[#6FB7C9]/10 text-[#6FB7C9]"
              }`}
            >
              {mode}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">
              Answered as of {formatDuration(capturedTMsRef.current)}
            </span>
          </div>

          {isRefusal ? (
            /* Refusal state — calm, never styled as an error */
            <div className="mt-2 rounded-xl border border-amber/40 bg-amber/[0.06] p-4">
              <p className="flex items-center gap-2 font-display text-sm text-amber">
                <ShieldCheck size={16} aria-hidden="true" />
                {REFUSAL_SENTENCE}
              </p>
              <p className="mt-1.5 text-xs text-white/50">
                Keep listening, or switch to Study mode.
              </p>
              {onSwitchMode && (
                <button
                  type="button"
                  onClick={() => onSwitchMode("study")}
                  className="btn-ghost mt-2.5"
                >
                  Switch to Study mode
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="relative mt-1 select-text rounded-xl border border-[#cba36e]/20 bg-[#cba36e]/[0.04] p-3.5">
                <p
                  aria-live="polite"
                  className="font-display text-[14px] leading-relaxed text-[#f5f0e6]"
                >
                  {groundedAnswer}
                  {phase === "speaking" ? (
                    <span
                      aria-hidden="true"
                      className="ml-1 inline-block h-3.5 w-[2px] translate-y-0.5 animate-caret bg-[#cba36e]"
                    />
                  ) : null}
                </p>
              </div>
              {beyondAnswer ? (
                /* Study mode only: clearly separated background knowledge */
                <div className="mt-2 rounded-xl border border-[#6FB7C9]/25 border-l-4 border-l-[#6FB7C9] bg-[#6FB7C9]/[0.05] p-3.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6FB7C9]">
                    {BEYOND_MARKER}
                  </p>
                  <p className="mt-1 select-text font-display text-[13px] leading-relaxed text-white/75">
                    {beyondAnswer}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {voice.state.context ? (
        <div className="mt-3 transition-opacity duration-200">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/40">
            {[
              `cutoff ${formatDuration(voice.state.context.cutoff_ms)}`,
              `${voice.state.context.blocked_chunks} locked`,
              `${voice.state.context.retrieved.length} retrieved`,
            ].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 font-mono"
              >
                {chip}
              </span>
            ))}
          </div>

          {/* "Heard so far" source chips — past moments only; click to seek */}
          {voice.state.context.retrieved.length > 0 ? (
            <div className="mt-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                Heard so far
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {voice.state.context.retrieved.slice(0, 3).map((excerpt) => (
                  <button
                    key={excerpt.chunk_id}
                    type="button"
                    onClick={() => onResumeAt(excerpt.start_ms)}
                    className="group flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 text-left transition-colors hover:border-[#cba36e]/40 hover:bg-[#cba36e]/[0.05]"
                  >
                    <Quote
                      size={11}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[#cba36e]/70"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] text-white/60 group-hover:text-white/80">
                        {excerpt.text.length > 90 ? `${excerpt.text.slice(0, 90)}…` : excerpt.text}
                      </span>
                      <span className="mt-0.5 block font-mono text-[9px] text-white/35">
                        {formatDuration(excerpt.start_ms)}–{formatDuration(excerpt.end_ms)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {timings && showTimings ? (
        <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden border-t border-white/[0.07] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-white/35 sm:grid-cols-4">
          <span>STT {timings.stt_ms} ms</span>
          <span>Retrieve {timings.retrieval_ms} ms</span>
          <span>LLM {timings.llm_first_token_ms} ms</span>
          <span>{firstAudioMs === null ? "" : `TTS ~${firstAudioMs} ms`}</span>
        </div>
      ) : null}
    </section>
  );
}
