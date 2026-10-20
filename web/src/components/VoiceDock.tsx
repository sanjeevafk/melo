import { useRef } from "react";
import { AudioLines, Mic, Square, TriangleAlert } from "lucide-react";

import type { BookManifest, Mode } from "../api/types";
import { usePushToTalk } from "../hooks/usePushToTalk";
import { useVoiceAnswer } from "../hooks/useVoiceAnswer";
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

function statusLabel(
  recording: boolean,
  status: ReturnType<typeof useVoiceAnswer>["state"]["status"],
): string {
  if (recording) {
    return "Listening… release to send";
  }
  switch (status) {
    case "transcribing":
      return "Transcribing locally…";
    case "thinking":
      return "Checking the story so far…";
    case "speaking":
      return "Speaking…";
    case "done":
      return "Answer ready";
    case "error":
      return "Could not answer";
    default:
      return "Hold to ask about this moment";
  }
}

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

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="voice-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">
            <AudioLines size={13} aria-hidden="true" />
            Companion
          </p>
          <h2 id="voice-heading" className="mt-2 font-display text-xl tracking-[-0.02em] text-paper">
            Ask about what you just heard
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">Local only</span>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
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
          className={`grid size-12 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
            recording
              ? "bg-danger text-ink-950 shadow-[0_0_0_8px_rgba(220,119,113,0.12)]"
              : "bg-paper text-ink-950 enabled:hover:bg-white"
          }`}
        >
          {recording ? (
            <Square size={16} fill="currentColor" aria-hidden="true" />
          ) : (
            <Mic size={19} aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/70">
            {ready ? statusLabel(recording, voice.state.status) : "Loading local models…"}
          </p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Hold the button or <kbd className="rounded border border-white/15 bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-white/60">Space</kbd>{" "}
            while the narration pauses.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
          <p className="flex items-center gap-2">
            <TriangleAlert size={14} aria-hidden="true" />
            {error}
          </p>
        </div>
      ) : null}

      {voice.state.transcript ? (
        <div className="mt-4">
          <p className="eyebrow">You asked</p>
          <p className="mt-1.5 rounded-xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-white/60">
            {voice.state.transcript}
          </p>
        </div>
      ) : null}

      {voice.state.answer ? (
        <div className="mt-4">
          <p className="eyebrow">Answer</p>
          <p
            aria-live="polite"
            className="mt-1.5 rounded-xl border border-amber/15 bg-amber/[0.055] p-3 text-sm leading-6 text-paper/90"
          >
            {voice.state.answer}
          </p>
        </div>
      ) : null}

      {voice.state.context ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/35">
          <span className="rounded-full border border-white/10 px-2 py-1">
            cutoff {formatDuration(voice.state.context.cutoff_ms)}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-1">
            {voice.state.context.blocked_chunks} locked
          </span>
          <span className="rounded-full border border-white/10 px-2 py-1">
            {voice.state.context.retrieved.length} retrieved
          </span>
        </div>
      ) : null}

      {timings && showTimings ? (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-white/30 sm:grid-cols-4">
          <span>STT {timings.stt_ms} ms</span>
          <span>Retrieve {timings.retrieval_ms} ms</span>
          <span>First token {timings.llm_first_token_ms} ms</span>
          <span>{firstAudioMs === null ? "" : `Audio ~${firstAudioMs} ms`}</span>
        </div>
      ) : null}
    </section>
  );
}
