import { useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, Unlock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { Mode, WordTiming } from "../api/types";
import { formatDuration } from "../lib/time";
import { activeWordIndex } from "./book/bookPagination";

interface TranscriptProps {
  words: WordTiming[];
  currentMs: number;
  mode: Mode;
  onSeek: (ms: number) => void;
}

export function Transcript({ words, currentMs, mode, onSeek }: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const manualScrollAtRef = useRef(0);
  const [awayFromPlayhead, setAwayFromPlayhead] = useState(false);
  const activeIndex = useMemo(() => activeWordIndex(words, currentMs), [currentMs, words]);

  const activeChunkId = activeIndex >= 0 ? words[activeIndex]?.chunk_id ?? null : null;
  const firstLockedIdx = useMemo(
    () => (mode === "story" ? words.findIndex((w) => w.start_ms > currentMs) : -1),
    [words, currentMs, mode],
  );

  useEffect(() => {
    const container = containerRef.current;
    const active = activeRef.current;
    if (!container || !active || Date.now() - manualScrollAtRef.current < 3000) {
      return;
    }
    const target = Math.max(0, active.offsetTop - container.clientHeight / 2);
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: target, behavior: "smooth" });
    } else {
      container.scrollTop = target;
    }
  }, [activeIndex]);

  const handleScroll = () => {
    const container = containerRef.current;
    const active = activeRef.current;
    if (!container || !active) {
      setAwayFromPlayhead(false);
      return;
    }
    const target = Math.max(0, active.offsetTop - container.clientHeight / 2);
    setAwayFromPlayhead(Math.abs(container.scrollTop - target) > container.clientHeight * 0.6);
  };

  const jumpToNow = () => {
    const container = containerRef.current;
    const active = activeRef.current;
    if (!container || !active) {
      return;
    }
    manualScrollAtRef.current = 0;
    const target = Math.max(0, active.offsetTop - container.clientHeight / 2);
    container.scrollTo({ top: target, behavior: "smooth" });
    setAwayFromPlayhead(false);
  };

  const lockedCount = useMemo(() => {
    if (mode !== "story") return 0;
    return words.filter((w) => w.start_ms > currentMs).length;
  }, [words, currentMs, mode]);

  const readFraction = words.length > 0 ? Math.max(0, activeIndex + 1) / words.length : 0;

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="transcript-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Synchronized transcript</p>
          <h2 id="transcript-heading" className="mt-2 font-display text-xl font-medium tracking-[-0.02em] text-paper">
            Follow the spoken word
          </h2>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mode}
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -4 }}
            transition={{ duration: 0.2 }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
              mode === "story"
                ? "border-amber/30 bg-amber/10 text-amber"
                : "border-[#6FB7C9]/30 bg-[#6FB7C9]/10 text-[#6FB7C9]"
            }`}
          >
            {mode === "story" ? <LockKeyhole size={11} aria-hidden="true" /> : <Unlock size={11} aria-hidden="true" />}
            {mode === "story" ? "Future locked" : "Full text"}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-safe via-amber to-ember"
          animate={{ width: `${readFraction * 100}%` }}
          transition={{ type: "tween", ease: "linear", duration: 0.25 }}
        />
      </div>

      {words.length === 0 ? (
        <div className="mt-6 space-y-3" aria-hidden="true">
          <div className="skeleton h-4 w-11/12 rounded-full" />
          <div className="skeleton h-4 w-4/5 rounded-full" />
          <div className="skeleton h-4 w-2/3 rounded-full" />
          <div className="skeleton h-4 w-3/4 rounded-full" />
        </div>
      ) : (
        <div className="relative">
          <div
            ref={containerRef}
            onWheel={() => {
              manualScrollAtRef.current = Date.now();
            }}
            onTouchMove={() => {
              manualScrollAtRef.current = Date.now();
            }}
            onScroll={handleScroll}
            className="fade-mask-y relative mt-3 min-h-[14rem] max-h-[24rem] overflow-y-auto py-6 pr-3 font-display text-[20px] leading-[1.7] text-paper/90 lg:max-h-[28rem]"
          >
            {words.map((word, index) => {
              const isLocked = mode === "story" && word.start_ms > currentMs;
              const active = index === activeIndex;
              const live = activeChunkId !== null && word.chunk_id === activeChunkId;

              if (isLocked) {
                return (
                  <span
                    key={`${word.chunk_id}-${index}`}
                    data-word={word.word}
                    aria-hidden="true"
                    title="Hidden until you listen to it"
                    className="word-token-locked"
                  >
                    {index === firstLockedIdx ? (
                      <LockKeyhole
                        size={13}
                        aria-hidden="true"
                        className="mr-1 inline-block align-[-2px] text-white/40"
                      />
                    ) : null}
                  </span>
                );
              }

              return (
                <span
                  key={`${word.chunk_id}-${index}`}
                  ref={active ? activeRef : undefined}
                  data-time={formatDuration(word.start_ms)}
                  onClick={() => onSeek(word.start_ms)}
                  className={`word-token cursor-pointer ${active ? "word-token-active" : `word-token-past ${live ? "word-token-live" : ""}`}`}
                >
                  {word.word}
                </span>
              );
            })}
          </div>

          <AnimatePresence>
            {awayFromPlayhead && (
              <motion.button
                key="jump"
                type="button"
                onClick={jumpToNow}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="tr-jump"
              >
                Jump to now
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs leading-5 text-white/35">
        <p>
          {mode === "story"
            ? "Words unlock seamlessly with zero layout shift as spoken. Click any revealed word to seek."
            : "Click any word to jump to that moment. Full document is available in Study mode."}
        </p>
        {mode === "story" && lockedCount > 0 && (
          <span className="font-mono text-[11px] text-white/30 shrink-0 ml-3">
            {lockedCount} words ahead
          </span>
        )}
      </div>
    </section>
  );
}
