import { useMemo } from "react";
import { Clock3, Headphones, Pause, Play, ShieldCheck, Sparkles } from "lucide-react";

import type { BookManifest, ContextPreview } from "../api/types";
import { formatDuration } from "../lib/time";

interface PlayerProps {
  book: BookManifest | null;
  currentMs: number;
  durationMs: number;
  playing: boolean;
  rate: number;
  error: string | null;
  context: ContextPreview | null;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onRateChange: (rate: number) => void;
}

const BAR_COUNT = 64;
const RATES = [1, 1.2, 1.5];

function barHeight(index: number): number {
  const t = index / BAR_COUNT;
  const envelope = Math.sin(t * Math.PI);
  const wave = Math.sin(index * 0.42) * 0.35 + Math.cos(index * 0.78) * 0.25 + 0.55;
  const raw = envelope * wave;
  return Math.max(25, Math.min(95, Math.round(raw * 85 + 20)));
}

export function Player({
  book,
  currentMs,
  durationMs,
  playing,
  rate,
  error,
  context,
  onToggle,
  onSeek,
  onRateChange,
}: PlayerProps) {
  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const bars = useMemo(() => Array.from({ length: BAR_COUNT }, (_, index) => barHeight(index)), []);
  const currentChapter = useMemo(() => {
    if (!book?.chapters || book.chapters.length === 0) {
      return null;
    }
    return (
      book.chapters.find((ch) => currentMs >= ch.start_ms && currentMs < ch.end_ms) ??
      book.chapters[0]
    );
  }, [book, currentMs]);

  return (
    <section className="card relative overflow-hidden p-6 lg:p-8" aria-labelledby="player-heading">
      <div className="absolute -right-24 -top-28 size-72 rounded-full bg-amber/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="eyebrow">
              <Headphones size={13} aria-hidden="true" />
              Now listening
            </p>
            {currentChapter ? (
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-amber">
                {currentChapter.title}
              </span>
            ) : null}
          </div>
          <h2
            id="player-heading"
            className="mt-3 max-w-xl font-display text-3xl leading-[1.05] tracking-[-0.04em] text-paper lg:text-4xl"
          >
            {book?.title ?? "Your next listening session"}
          </h2>
          <p className="mt-2 text-sm text-white/45">
            {book?.author
              ? `${book.author} · ${formatDuration(book.duration_ms)}`
              : "Demo audio, indexed locally."}
          </p>
        </div>
        <div className="hidden rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right sm:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Position
          </p>
          <p className="mt-1 font-mono text-sm text-paper">{formatDuration(currentMs)}</p>
        </div>
      </div>

      <div className="relative mt-8 rounded-2xl border border-white/10 bg-black/25 p-5">
        <div
          className="group relative flex h-16 cursor-pointer items-end justify-between gap-[3px] select-none"
          role="slider"
          aria-label="Audio position"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={currentMs}
          onClick={(event) => {
            if (!book || durationMs <= 0) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            onSeek(fraction * durationMs);
          }}
        >
          {bars.map((height, index) => {
            const barFraction = index / bars.length;
            const played = barFraction <= progress;
            const isNearPlayhead = Math.abs(barFraction - progress) < 1.2 / bars.length;

            return (
              <span
                key={`${height}-${index}`}
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  isNearPlayhead
                    ? "bg-paper shadow-[0_0_8px_rgba(241,237,227,0.9)]"
                    : played
                      ? "bg-amber shadow-[0_0_6px_rgba(224,164,88,0.3)]"
                      : "bg-white/15 group-hover:bg-white/25"
                }`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        {/* Progress track */}
        <div
          className="relative mt-3 h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
          onClick={(event) => {
            if (!book || durationMs <= 0) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            onSeek(fraction * durationMs);
          }}
        >
          <div
            className="h-full rounded-full bg-amber transition-[width] duration-150"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between font-mono text-xs text-white/40">
          <span className="font-medium text-paper/85">{formatDuration(currentMs)}</span>
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={!book}
          className="grid size-12 place-items-center rounded-full bg-paper text-ink-950 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={playing ? "Pause narration" : "Play narration"}
        >
          {playing ? (
            <Pause size={20} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play className="translate-x-0.5" size={20} fill="currentColor" aria-hidden="true" />
          )}
        </button>

        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {RATES.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => onRateChange(speed)}
              aria-pressed={rate === speed}
              className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition ${
                rate === speed ? "bg-white/10 text-white/80" : "text-white/35 hover:text-white/65"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-white/35">
          <Clock3 size={14} aria-hidden="true" />
          {error ?? "Space holds the microphone; the player pauses for you."}
        </div>
      </div>

      <div className="relative mt-8 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={12} aria-hidden="true" />
            Context window
          </p>
          <p className="mt-2 text-sm text-white/70">
            {context
              ? `From ${formatDuration(context.buffer_start_ms)} to ${formatDuration(context.t_ms)}`
              : "Last 90 seconds, verbatim"}
          </p>
        </div>
        <div>
          <p className="eyebrow">
            <Sparkles size={12} aria-hidden="true" />
            Retrieved
          </p>
          <p className="mt-2 text-sm text-white/70">
            {context ? `${context.retrieved.length} past passages` : "Past text only"}
          </p>
        </div>
        <div>
          <p className="eyebrow">Shield</p>
          <p className="mt-2 text-sm text-white/70">
            {context ? `${context.blocked_chunks} chunks locked ahead` : "Spoiler-safe by default"}
          </p>
        </div>
      </div>
    </section>
  );
}
