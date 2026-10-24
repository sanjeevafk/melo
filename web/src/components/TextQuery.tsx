import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, LoaderCircle, MessageSquareText, TriangleAlert } from "lucide-react";

import { postQuery } from "../api/client";
import type { Mode, QueryResponse } from "../api/types";
import { formatDuration } from "../lib/time";

interface TextQueryProps {
  bookId: string | null;
  tMs: number;
  mode: Mode;
  showTimings: boolean;
  onAnswered?: () => void;
}

export function TextQuery({ bookId, tMs, mode, showTimings, onAnswered }: TextQueryProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const ask = async () => {
    const trimmed = question.trim();
    if (!bookId || !trimmed || busy) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const next = await postQuery(
        { book_id: bookId, t_ms: Math.round(tMs), mode, question: trimmed },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setResult(next);
        setQuestion("");
        onAnswered?.();
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not answer that question.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  };

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="text-query-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            <MessageSquareText size={13} aria-hidden="true" />
            Type instead
          </p>
          <h2
            id="text-query-heading"
            className="mt-2 font-display text-lg tracking-[-0.02em] text-paper"
          >
            Ask the same spoiler-safe question
          </h2>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
          {mode}
        </span>
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="text-question" className="sr-only">
          Your question
        </label>
        <input
          id="text-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={!bookId || busy}
          placeholder="Who is at the door?"
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white/80 outline-none transition placeholder:text-white/25 focus:border-amber/50 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!bookId || busy || !question.trim()}
          aria-label="Ask question"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-ink-950 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <CornerDownLeft size={16} aria-hidden="true" />
          )}
        </button>
      </form>

      {error ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-danger">
          <TriangleAlert size={13} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-2xl border border-amber/15 bg-amber/[0.045] p-3">
          <p aria-live="polite" className="text-sm leading-6 text-paper/90">
            {result.answer}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white/30">
            <span>cutoff {formatDuration(result.context.cutoff_ms)}</span>
            <span>{result.context.retrieved.length} retrieved</span>
            <span>{result.context.blocked_chunks} locked</span>
            {showTimings ? <span>{result.timings.total_ms} ms</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
