import { LockKeyhole, ShieldCheck, TriangleAlert, Waypoints } from "lucide-react";

import type { ContextPreview, Mode } from "../api/types";
import { formatDuration } from "../lib/time";

interface ContextPanelProps {
  mode: Mode;
  context: ContextPreview | null;
  error: string | null;
  durationMs: number;
}

export function ContextPanel({ mode, context, error, durationMs }: ContextPanelProps) {
  const isStory = mode === "story";
  const cutoff = context?.cutoff_ms ?? 0;
  const safePercent = durationMs > 0 ? Math.min(100, (cutoff / durationMs) * 100) : 0;

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="context-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={13} aria-hidden="true" />
            Temporal horizon
          </p>
          <h2
            id="context-heading"
            className="mt-2 font-display text-xl tracking-[-0.02em] text-paper"
          >
            {isStory ? "Spoiler shield armed" : "Study mode: full document"}
          </h2>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
            isStory
              ? "border-safe/30 bg-safe/10 text-safe"
              : "border-amber/30 bg-amber/10 text-amber"
          }`}
        >
          {isStory ? "Story" : "Study"}
        </span>
      </div>

      <div className="mt-7">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          <span>Safe context</span>
          <span>{isStory ? "Locked ahead" : "Open"}</span>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-safe/70 transition-[width] duration-300"
            style={{ width: `${safePercent}%` }}
          />
          <div
            className="absolute inset-y-0 w-[1px] bg-paper shadow-[0_0_12px_rgba(241,237,227,0.8)] transition-[left] duration-300"
            style={{ left: `${safePercent}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-white/40">
          <span>{formatDuration(cutoff)}</span>
          <span className="inline-flex items-center gap-1.5">
            {isStory ? (
              <LockKeyhole size={12} aria-hidden="true" />
            ) : (
              <Waypoints size={12} aria-hidden="true" />
            )}
            {isStory ? "Future text stays out of context" : "Whole book is available"}
          </span>
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            Blocked chunks
          </p>
          <p className="mt-1 font-display text-2xl text-paper">
            {context ? context.blocked_chunks : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            Retrieved
          </p>
          <p className="mt-1 font-display text-2xl text-paper">
            {context ? context.retrieved.length : "—"}
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert size={15} aria-hidden="true" />
            Context inspector unavailable
          </p>
          <p className="mt-1 text-danger/75">{error}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
                Immediate buffer
              </p>
              <span className="font-mono text-[10px] text-white/25">
                {context?.immediate_words.length ?? 0} words
              </span>
            </div>
            <p className="mt-2 max-h-20 overflow-y-auto text-xs leading-5 text-white/55">
              {context?.immediate_text
                ? context.immediate_text.length > 260
                  ? `${context.immediate_text.slice(0, 260)}…`
                  : context.immediate_text
                : "No narration has reached this moment yet."}
            </p>
          </div>

          {context?.retrieved.length ? (
            <div className="space-y-2">
              {context.retrieved.map((excerpt) => (
                <div
                  key={excerpt.chunk_id}
                  className="rounded-xl border border-safe/15 bg-safe/[0.045] p-3"
                >
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-safe/65">
                    <span>Past passage</span>
                    <span>
                      {formatDuration(excerpt.start_ms)}–{formatDuration(excerpt.end_ms)}
                    </span>
                  </div>
                  <p className="mt-1.5 max-h-24 overflow-y-auto text-xs leading-5 text-white/55">
                    {excerpt.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/35">
              {isStory
                ? "Nothing from the past matches yet. The shield is still armed."
                : "No matching document passages yet."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
