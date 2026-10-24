import { useRef } from "react";
import { AudioLines, Mic, Square, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { BookManifest, Mode } from "../api/types";
import { usePushToTalk } from "../hooks/usePushToTalk";
import { useVoiceAnswer } from "../hooks/useVoiceAnswer";
import { revealText, spring } from "../lib/motion";
import { formatDuration } from "../lib/time";

interface VoiceDockProps {
  book: BookManifest | null;
  currentMs: number;
  mode: Mode;
  ready: boolean;
  showTimings: boolean;
  onPause: () => Promise<boolean>;
  onResumeAt: (tMs: number) => void;
  onAnswered?: () => void;
}

type VoiceStatus = ReturnType<typeof useVoiceAnswer>["state"]["status"];

function statusLabel(recording: boolean, status: VoiceStatus): string {
  if (recording) {
    return "Listening… release to send";
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

function orbPhase(recording: boolean, status: VoiceStatus): OrbPhase {
  if (recording) return "listening";
  if (status === "transcribing" || status === "thinking") return "working";
  if (status === "speaking") return "speaking";
  if (status === "error") return "error";
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
  onPause,
  onResumeAt,
  onAnswered,
}: VoiceDockProps) {
  const voice = useVoiceAnswer();
  const wasPlayingRef = useRef(false);
  const capturedTMsRef = useRef(0);

  const { recording, error: microphoneError, start, stop } = usePushToTalk({
    disabled: !book || !ready,
    onStart: async () => {
      capturedTMsRef.current = currentMs;
      voice.cancel();
      voice.primeAudio();
      wasPlayingRef.current = await onPause();
      await voice.playChime();
    },
    onRecorded: async (blob) => {
      if (!book) {
        return;
      }
      await voice.send(blob, {
        bookId: book.id,
        tMs: capturedTMsRef.current,
        mode,
      });
      onAnswered?.();
      if (wasPlayingRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        onResumeAt(Math.max(0, capturedTMsRef.current - 5000));
      }
    },
  });

  const error = microphoneError ?? voice.state.error;
  const timings = voice.state.timings;
  const firstAudioMs = timings
    ? timings.llm_first_token_ms + timings.tts_first_sentence_ms
    : null;
  const phase = orbPhase(recording, voice.state.status);
  const label = ready ? statusLabel(recording, voice.state.status) : "Loading models…";
  const busy = phase === "working";

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
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
          Private inference
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/30 p-3.5">
        {/* Interactive Mic Orb */}
        <div className="relative grid size-16 shrink-0 place-items-center">
          <AnimatePresence>
            {(phase === "listening" || phase === "speaking") &&
              [0, 1].map((ring) => (
                <motion.span
                  key={`${phase}-${ring}`}
                  aria-hidden="true"
                  className={`absolute inset-1 rounded-full border ${
                    phase === "listening" ? "border-[#c96a63]/50" : "border-[#7ea38f]/50"
                  }`}
                  initial={{ scale: 0.9, opacity: 0.6 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: ring * 0.6, ease: "easeOut" }}
                />
              ))}
          </AnimatePresence>

          <motion.button
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
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.92 }}
            transition={spring}
            className={`relative grid size-12 place-items-center overflow-hidden rounded-full bg-gradient-to-br text-[#0c0d10] shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ORB_GRADIENT[phase]}`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={recording ? "stop" : "mic"}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="relative grid place-items-center"
              >
                {recording ? (
                  <Square size={15} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Mic size={18} aria-hidden="true" />
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="text-xs font-medium text-[#f5f0e6]/90"
            >
              {label}
            </motion.p>
          </AnimatePresence>
          <p className="mt-0.5 text-[11px] text-white/40">
            Hold button or{" "}
            <kbd className="rounded border border-white/15 bg-white/[0.05] px-1 py-0.5 font-mono text-[9px] text-white/60">
              Space
            </kbd>{" "}
            to speak.
          </p>

          {/* Equalizer Waveform indicator */}
          <div className="mt-2.5 flex h-3 items-end gap-[2px]" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, index) => (
              <motion.span
                key={index}
                className={`w-[2px] rounded-full ${
                  phase === "listening"
                    ? "bg-[#c96a63]"
                    : phase === "speaking"
                      ? "bg-[#7ea38f]"
                      : busy
                        ? "bg-[#cba36e]/60"
                        : "bg-white/10"
                }`}
                animate={
                  phase === "listening" || phase === "speaking"
                    ? { height: ["15%", `${35 + ((index * 29) % 65)}%`, "20%"] }
                    : busy
                      ? { height: ["20%", "70%", "20%"] }
                      : { height: "15%" }
                }
                transition={{
                  duration: 0.5 + (index % 4) * 0.1,
                  repeat: phase === "listening" || phase === "speaking" || busy ? Infinity : 0,
                  ease: "easeInOut",
                  delay: index * 0.04,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error ? (
          <motion.div
            key="error"
            variants={revealText}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-3.5 rounded-xl border border-[#c96a63]/30 bg-[#c96a63]/10 p-3 text-xs text-[#c96a63]"
          >
            <p className="flex items-center gap-2">
              <TriangleAlert size={14} aria-hidden="true" />
              {error}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {voice.state.transcript ? (
          <motion.div key="transcript" variants={revealText} initial="hidden" animate="show" exit="exit" className="mt-3.5">
            <p className="eyebrow text-white/40">You asked</p>
            <p className="mt-1 rounded-xl border border-white/10 bg-black/20 p-2.5 text-xs text-white/70">
              {voice.state.transcript}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {voice.state.answer ? (
          <motion.div key="answer" variants={revealText} initial="hidden" animate="show" exit="exit" className="mt-3.5">
            <p className="eyebrow text-[#cba36e]">Answer</p>
            <div className="relative mt-1 select-text rounded-xl border border-[#cba36e]/20 bg-[#cba36e]/[0.04] p-3.5">
              <p aria-live="polite" className="font-display text-[14px] leading-relaxed text-[#f5f0e6]">
                {voice.state.answer}
                {phase === "speaking" ? (
                  <span aria-hidden="true" className="ml-1 inline-block h-3.5 w-[2px] translate-y-0.5 animate-caret bg-[#cba36e]" />
                ) : null}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {voice.state.context ? (
          <motion.div
            key="ctx"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-white/40"
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {timings && showTimings ? (
          <motion.div
            key="timings"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden border-t border-white/[0.07] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-white/35 sm:grid-cols-4"
          >
            <span>STT {timings.stt_ms} ms</span>
            <span>Retrieve {timings.retrieval_ms} ms</span>
            <span>LLM {timings.llm_first_token_ms} ms</span>
            <span>{firstAudioMs === null ? "" : `TTS ~${firstAudioMs} ms`}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
