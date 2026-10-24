import { useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Headphones, ShieldCheck, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { BookManifest, ContextPreview, Mode } from "../api/types";
import { formatDuration } from "../lib/time";
import { generateWaveformBars } from "../lib/waveform";
import { AnimatedBook } from "./book/AnimatedBook";
import { AnimatedNumber } from "./ui/AnimatedNumber";

interface PlayerProps {
  book: BookManifest | null;
  currentMs: number;
  durationMs: number;
  playing: boolean;
  context: ContextPreview | null;
  mode: Mode;
  onSeek: (ms: number) => void;
}

const BAR_COUNT = 64;

export function Player({
  book,
  currentMs,
  durationMs,
  playing,
  context,
  mode,
  onSeek,
}: PlayerProps) {
  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const bars = useMemo(() => generateWaveformBars(BAR_COUNT), []);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const chapters = useMemo(() => book?.chapters ?? [], [book?.chapters]);
  const currentChapterIndex = useMemo(() => {
    if (chapters.length === 0) return -1;
    return chapters.findIndex((ch) => currentMs >= ch.start_ms && currentMs < ch.end_ms);
  }, [chapters, currentMs]);

  const currentChapter = currentChapterIndex >= 0 ? chapters[currentChapterIndex] : chapters[0] ?? null;

  const handlePrevChapter = () => {
    if (chapters.length === 0) return;
    const targetIdx = Math.max(0, currentChapterIndex - 1);
    onSeek(chapters[targetIdx].start_ms);
  };

  const handleNextChapter = () => {
    if (chapters.length === 0) return;
    const targetIdx = Math.min(chapters.length - 1, currentChapterIndex + 1);
    onSeek(chapters[targetIdx].start_ms);
  };

  const fractionFromEvent = (event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  };

  const canSeek = Boolean(book) && durationMs > 0;

  const scrubHandlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (!canSeek) return;
      draggingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onSeek(fractionFromEvent(event) * durationMs);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const fraction = fractionFromEvent(event);
      setHoverFraction(fraction);
      if (draggingRef.current && canSeek) {
        onSeek(fraction * durationMs);
      }
    },
    onPointerUp: () => {
      draggingRef.current = false;
    },
    onPointerLeave: () => {
      setHoverFraction(null);
    },
    onClick: (event: MouseEvent<HTMLDivElement>) => {
      if (!canSeek) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      onSeek(fraction * durationMs);
    },
  };

  return (
    <section
      className="card relative overflow-hidden border border-white/[0.08] bg-[#0e1014]/85 p-6 lg:p-8"
      aria-labelledby="player-heading"
    >
      {/* Subtle warm studio backdrop glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 size-96 rounded-full bg-[#cba36e]/[0.07] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-20 size-80 rounded-full bg-[#7ea38f]/[0.05] blur-3xl"
      />

      <div className="relative grid gap-8 lg:grid-cols-[280px_1fr] lg:items-center">
        {/* Self-reading hardcover book showcase */}
        <div className="relative mx-auto flex h-[340px] w-full max-w-[280px] items-center justify-center">
          <AnimatedBook
            className="h-full w-full"
            title={book?.title ?? "The Mysterious Affair at Styles"}
            author={book?.author ?? "Agatha Christie"}
            bookId={book?.id ?? "styles-ch2"}
            playing={playing}
            words={book?.words ?? []}
            currentMs={currentMs}
            mode={mode}
          />
        </div>

        {/* Literary Details & Player Controls */}
        <div className="flex flex-col justify-between">
          <div>
            {/* Header / Chapter pill */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="eyebrow text-[#cba36e]/90">
                  <Headphones size={13} aria-hidden="true" />
                  Now listening
                </p>
                {currentChapter ? (
                  <motion.span
                    key={currentChapter.title}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-md border border-[#cba36e]/25 bg-[#cba36e]/[0.08] px-2.5 py-0.5 font-mono text-[11px] text-[#cba36e]"
                  >
                    {currentChapter.title}
                  </motion.span>
                ) : null}
              </div>

              {/* Chapter Seek Navigation Buttons */}
              {chapters.length > 1 && (
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] p-0.5">
                  <button
                    type="button"
                    onClick={handlePrevChapter}
                    disabled={currentChapterIndex <= 0}
                    className="rounded-full p-1 text-white/40 hover:text-white disabled:opacity-20"
                    title="Previous chapter"
                    aria-label="Previous chapter"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-1 font-mono text-[10px] text-white/50">
                    {currentChapterIndex + 1}/{chapters.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextChapter}
                    disabled={currentChapterIndex >= chapters.length - 1}
                    className="rounded-full p-1 text-white/40 hover:text-white disabled:opacity-20"
                    title="Next chapter"
                    aria-label="Next chapter"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Book Title — keyed remount swaps instantly on book change
                (AnimatePresence mode="wait" could hang on its exit and show
                the previous book's title indefinitely) */}
            <motion.h2
              key={book?.id ?? "empty"}
              id="player-heading"
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3.5 font-display text-2xl font-medium tracking-tight text-[#f5f0e6] lg:text-[2.25rem] lg:leading-[1.12]"
            >
              {book?.title ?? "The Mysterious Affair at Styles"}
            </motion.h2>

            {/* Author & metadata */}
            <p className="mt-2 text-sm text-white/50">
              <span className="font-display italic text-[#cba36e]/90">
                {book?.author ?? "Agatha Christie"}
              </span>
              <span className="mx-2 text-white/20">·</span>
              <span className="font-mono text-xs text-white/40">
                {formatDuration(book?.duration_ms ?? durationMs)}
              </span>
              {book?.provenance?.source && (
                <>
                  <span className="mx-2 text-white/20">·</span>
                  <span className="text-xs text-white/35">{book.provenance.source}</span>
                </>
              )}
            </p>
          </div>

          {/* Restrained Waveform & Scrubbing Bar */}
          <div className="relative mt-6 rounded-2xl border border-white/[0.07] bg-black/35 p-4 shadow-inner">
            <div
              className="group relative flex h-14 cursor-pointer touch-none items-center justify-between gap-[3px] select-none"
              role="slider"
              aria-label="Audio position"
              aria-valuemin={0}
              aria-valuemax={durationMs}
              aria-valuenow={currentMs}
              {...scrubHandlers}
            >
              {bars.map((height, index) => {
                const barFraction = index / bars.length;
                const played = barFraction <= progress;
                const isNearPlayhead = Math.abs(barFraction - progress) < 1.4 / bars.length;
                const hovered = hoverFraction !== null && barFraction <= hoverFraction && !played;

                return (
                  <span
                    key={index}
                    className={`wave-bar flex-1 rounded-full transition-colors duration-150 ${
                      isNearPlayhead
                        ? "bg-[#f5f0e6] shadow-[0_0_10px_rgba(245,240,230,0.85)]"
                        : played
                          ? "bg-gradient-to-t from-[#cba36e] to-[#e5dec9]"
                          : hovered
                            ? "bg-white/30"
                            : "bg-white/[0.12]"
                    }`}
                    style={{
                      height: `${height}%`,
                      animationDelay: `${(index % 10) * -0.12}s`,
                      animationPlayState: playing ? "running" : "paused",
                    }}
                  />
                );
              })}

              {/* Playhead Marker */}
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-[-4px] w-[2px] rounded-full bg-[#f5f0e6] shadow-[0_0_12px_rgba(245,240,230,0.8)]"
                animate={{ left: `${progress * 100}%` }}
                transition={{ type: "tween", ease: "linear", duration: 0.2 }}
              />

              {/* Scrubbing Hover Tooltip */}
              <AnimatePresence>
                {hoverFraction !== null && canSeek ? (
                  <motion.span
                    aria-hidden="true"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded border border-white/10 bg-[#16181e] px-2 py-0.5 font-mono text-[10px] text-[#f5f0e6] shadow-xl"
                    style={{ left: `${hoverFraction * 100}%` }}
                  >
                    {formatDuration(hoverFraction * durationMs)}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Micro Progress Track & Spoiler Horizon Indicator */}
            <div
              className="relative mt-2.5 h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/[0.08]"
              onClick={scrubHandlers.onClick}
            >
              {mode === "story" && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0 4px, transparent 4px 8px)",
                  }}
                  title="Locked spoiler shield"
                />
              )}
              <motion.div
                className={`h-full rounded-full ${
                  mode === "story"
                    ? "bg-gradient-to-r from-[#7bc47f]/80 via-[#cba36e] to-[#f5f0e6]"
                    : "bg-gradient-to-r from-[#cba36e] to-[#f5f0e6]"
                }`}
                animate={{ width: `${Math.min(100, progress * 100)}%` }}
                transition={{ type: "tween", ease: "linear", duration: 0.2 }}
              />
            </div>

            {/* Time Indicators */}
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] tabular-nums text-white/45">
              <span className="font-medium text-[#f5f0e6]">{formatDuration(currentMs)}</span>
              {mode === "story" ? (
                <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#7bc47f]/85">
                  <span className="inline-block size-1.5 rounded-full bg-[#7bc47f]" />
                  Safe Zone
                </span>
              ) : null}
              <span>-{formatDuration(Math.max(0, durationMs - currentMs))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grounded Stats Bar */}
      <div className="relative mt-8 grid gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-3">
        {[
          {
            icon: <ShieldCheck size={12} aria-hidden="true" />,
            label: "Context window",
            value: context
              ? `${formatDuration(context.buffer_start_ms)} → ${formatDuration(context.t_ms)}`
              : "Last 90s verbatim",
          },
          {
            icon: <Sparkles size={12} aria-hidden="true" />,
            label: "Retrieved past",
            value: context ? (
              <>
                <AnimatedNumber value={context.retrieved.length} /> passages
              </>
            ) : (
              "Safe evidence"
            ),
          },
          {
            icon: null,
            label: "Temporal shield",
            value: context ? (
              <>
                <AnimatedNumber value={context.blocked_chunks} /> chunks locked
              </>
            ) : (
              "Spoiler-safe"
            ),
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl p-2.5">
            <p className="eyebrow text-[#cba36e]/80">
              {stat.icon}
              {stat.label}
            </p>
            <p className="mt-1.5 font-mono text-sm tabular-nums text-white/75">{stat.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
