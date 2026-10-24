import { LockKeyhole, ShieldCheck, TriangleAlert, Waypoints } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { ContextPreview, Mode } from "../api/types";
import { revealText, softSpring } from "../lib/motion";
import { formatDuration } from "../lib/time";
import { AnimatedNumber } from "./ui/AnimatedNumber";

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
    <section className="card overflow-hidden p-5 lg:p-6" aria-labelledby="context-heading">
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={13} aria-hidden="true" />
            Temporal horizon
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={mode}
              id="context-heading"
              variants={revealText}
              initial="hidden"
              animate="show"
              exit="exit"
              className="mt-2 font-display text-xl font-medium tracking-[-0.02em] text-paper"
            >
              {isStory ? "Spoiler shield armed" : "Study mode: full document"}
            </motion.h2>
          </AnimatePresence>
        </div>
        <motion.span
          layout
          className={`relative grid size-10 place-items-center rounded-2xl border ${
            isStory ? "border-safe/30 bg-safe/10 text-safe" : "border-amber/30 bg-amber/10 text-amber"
          }`}
          aria-hidden="true"
        >
          {isStory && (
            <motion.span
              className="absolute inset-0 rounded-2xl border border-safe/40"
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          {isStory ? <ShieldCheck size={18} /> : <Waypoints size={18} />}
        </motion.span>
      </div>

      <div className="relative mt-7">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          <span>Safe context</span>
          <span>{isStory ? "Locked ahead" : "Open"}</span>
        </div>
        <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
          {isStory && (
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0 6px, transparent 6px 12px)",
              }}
            />
          )}
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${
              isStory ? "bg-gradient-to-r from-safe/60 to-safe" : "bg-gradient-to-r from-amber/60 to-amber"
            }`}
            animate={{ width: isStory ? `${safePercent}%` : "100%" }}
            transition={softSpring}
          />
          <motion.div
            className="absolute inset-y-[-2px] w-[2px] rounded-full bg-paper shadow-[0_0_12px_rgba(244,239,228,0.9)]"
            animate={{ left: `${isStory ? safePercent : 100}%` }}
            transition={softSpring}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-white/40">
          <span className="font-mono tabular-nums">{formatDuration(cutoff)}</span>
          <span className="inline-flex items-center gap-1.5">
            {isStory ? <LockKeyhole size={12} aria-hidden="true" /> : <Waypoints size={12} aria-hidden="true" />}
            {isStory ? "Future text stays out of context" : "Whole book is available"}
          </span>
          <span className="font-mono tabular-nums">{formatDuration(durationMs)}</span>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3">
        {[
          { label: "Blocked chunks", value: context?.blocked_chunks, accent: "from-danger/20" },
          { label: "Retrieved", value: context?.retrieved.length, accent: "from-safe/20" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ y: -3 }}
            transition={softSpring}
            className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br ${stat.accent} to-transparent p-3.5`}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{stat.label}</p>
            <p className="mt-1 font-display text-3xl font-medium tabular-nums text-paper">
              {typeof stat.value === "number" ? <AnimatedNumber value={stat.value} /> : "—"}
            </p>
          </motion.div>
        ))}
      </div>

      {error ? (
        <div className="relative mt-5 rounded-2xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert size={15} aria-hidden="true" />
            Context inspector unavailable
          </p>
          <p className="mt-1 text-danger/75">{error}</p>
        </div>
      ) : (
        <div className="relative mt-5 space-y-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">Immediate buffer</p>
              <span className="font-mono text-[10px] text-white/30">
                <AnimatedNumber value={context?.immediate_words.length ?? 0} /> words
              </span>
            </div>
            <p className="mt-2 max-h-20 overflow-y-auto text-xs leading-5 text-white/55">
              {context?.immediate_text
                ? context.immediate_text.length > 260
                  ? `…${context.immediate_text.slice(-260)}`
                  : context.immediate_text
                : "No narration has reached this moment yet."}
            </p>
          </div>

          {context?.retrieved.length ? (
            <motion.div layout className="space-y-2">
              <AnimatePresence initial={false}>
                {context.retrieved.map((excerpt, index) => (
                  <motion.div
                    key={excerpt.chunk_id}
                    layout
                    initial={{ opacity: 0, x: -12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ ...softSpring, delay: index * 0.05 }}
                    className="rounded-xl border border-safe/15 bg-safe/[0.045] p-3 transition-colors hover:border-safe/30"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-safe/70">
                      <span>Past passage</span>
                      <span>
                        {formatDuration(excerpt.start_ms)}–{formatDuration(excerpt.end_ms)}
                      </span>
                    </div>
                    <p className="mt-1.5 max-h-24 overflow-y-auto text-xs leading-5 text-white/55">{excerpt.text}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/35">
              {isStory ? "Nothing from the past matches yet. The shield is still armed." : "No matching document passages yet."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
