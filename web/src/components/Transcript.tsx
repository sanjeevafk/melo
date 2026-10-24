import { useEffect, useMemo, useRef } from "react";
import { LockKeyhole } from "lucide-react";

import type { Mode, WordTiming } from "../api/types";

interface TranscriptProps {
  words: WordTiming[];
  currentMs: number;
  mode: Mode;
  onSeek: (ms: number) => void;
}

function activeWordIndex(words: WordTiming[], currentMs: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle].start_ms <= currentMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function Transcript({ words, currentMs, mode, onSeek }: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const manualScrollAtRef = useRef(0);
  const activeIndex = useMemo(() => activeWordIndex(words, currentMs), [currentMs, words]);

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

  const lockedCount = useMemo(() => {
    if (mode !== "story") return 0;
    return words.filter((w) => w.start_ms > currentMs).length;
  }, [words, currentMs, mode]);

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="transcript-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Synchronized transcript</p>
          <h2
            id="transcript-heading"
            className="mt-2 font-display text-xl tracking-[-0.02em] text-paper"
          >
            Follow the spoken word
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
            mode === "story"
              ? "border-safe/30 bg-safe/10 text-safe"
              : "border-amber/30 bg-amber/10 text-amber"
          }`}
        >
          {mode === "story" ? <LockKeyhole size={11} aria-hidden="true" /> : null}
          {mode === "story" ? "Future locked" : "Full text"}
        </span>
      </div>

      {words.length === 0 ? (
        <div className="mt-6 space-y-3" aria-hidden="true">
          <div className="h-4 w-11/12 animate-pulse rounded-full bg-white/10" />
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/[0.07]" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/[0.05]" />
        </div>
      ) : (
        <div
          ref={containerRef}
          onWheel={() => {
            manualScrollAtRef.current = Date.now();
          }}
          onTouchMove={() => {
            manualScrollAtRef.current = Date.now();
          }}
          className="relative mt-5 min-h-[14rem] max-h-[24rem] overflow-y-auto pr-3 font-display text-[17px] leading-[2.2] tracking-[0.01em] text-paper/90 lg:max-h-[28rem]"
        >
          {words.map((word, index) => {
            const isLocked = mode === "story" && word.start_ms > currentMs;
            const active = index === activeIndex;

            if (isLocked) {
              return (
                <span
                  key={`${word.chunk_id}-${index}`}
                  data-word={word.word}
                  aria-hidden="true"
                  title="Revealed as narration reaches this point"
                  className="word-token-locked"
                />
              );
            }

            return (
              <span
                key={`${word.chunk_id}-${index}`}
                ref={active ? activeRef : undefined}
                onClick={() => onSeek(word.start_ms)}
                className={`word-token cursor-pointer ${
                  active
                    ? "bg-amber/25 text-amber ring-1 ring-amber/40 shadow-[0_0_8px_rgba(224,164,88,0.25)]"
                    : "text-paper/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                {word.word}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs leading-5 text-white/35">
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
