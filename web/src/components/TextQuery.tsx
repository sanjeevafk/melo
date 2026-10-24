import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, LoaderCircle, MessageSquareText, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { postQuery } from "../api/client";
import type { Mode, QueryResponse } from "../api/types";
import { revealText, spring } from "../lib/motion";
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
          <h2 id="text-query-heading" className="mt-2 font-display text-lg font-medium tracking-[-0.02em] text-paper">
            Ask the same spoiler-safe question
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
          {mode}
        </span>
      </div>

      <form
        className="group mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-1.5 transition-all duration-300 focus-within:border-amber/50 focus-within:shadow-[0_0_0_4px_rgba(232,173,98,0.08),0_10px_40px_-10px_rgba(232,173,98,0.35)]"
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
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-white/85 outline-none placeholder:text-white/25 disabled:opacity-40"
        />
        <motion.button
          type="submit"
          disabled={!bookId || busy || !question.trim()}
          aria-label="Ask question"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          transition={spring}
          className="btn-primary grid size-10 shrink-0 place-items-center rounded-xl disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <CornerDownLeft size={16} aria-hidden="true" />
          )}
        </motion.button>
      </form>

      <AnimatePresence>
        {error ? (
          <motion.p
            key="error"
            variants={revealText}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-3 flex items-center gap-2 text-xs text-danger"
          >
            <TriangleAlert size={13} aria-hidden="true" />
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {busy ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5"
            aria-hidden="true"
          >
            <div className="skeleton h-3 w-11/12 rounded-full" />
            <div className="skeleton h-3 w-3/4 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </motion.div>
        ) : result ? (
          <motion.div
            key={result.answer}
            variants={revealText}
            initial="hidden"
            animate="show"
            exit="exit"
            className="relative mt-4 overflow-hidden rounded-2xl border border-amber/20 bg-gradient-to-br from-amber/[0.09] to-amber/[0.02] p-3.5"
          >
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
            <p aria-live="polite" className="relative font-display text-[15px] leading-7 text-paper/95">
              {result.answer}
            </p>
            <div className="relative mt-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white/35">
              <span>cutoff {formatDuration(result.context.cutoff_ms)}</span>
              <span>{result.context.retrieved.length} retrieved</span>
              <span>{result.context.blocked_chunks} locked</span>
              {showTimings ? <span>{result.timings.total_ms} ms</span> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
