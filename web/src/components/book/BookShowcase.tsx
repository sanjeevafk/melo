import { BookOpen } from "lucide-react";

import type { BookManifest, Mode } from "../../api/types";
import { AnimatedBook } from "./AnimatedBook";

interface BookShowcaseProps {
  book: BookManifest | null;
  playing: boolean;
  currentMs: number;
  mode: Mode;
}

/**
 * Dedicated visual stage for the self-reading hardcover book.
 * Separated cleanly from the audio player controls to prevent visual overlap
 * and allow the 3D book spread to expand and breathe.
 */
export function BookShowcase({ book, playing, currentMs, mode }: BookShowcaseProps) {
  return (
    <section
      className="card relative overflow-hidden border border-white/[0.08] bg-[#0e1014]/85 p-6 lg:p-8"
      aria-label="Hardcover edition"
    >
      {/* Warm ambient studio backdrop glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-24 size-96 rounded-full bg-[#cba36e]/[0.07] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-20 size-80 rounded-full bg-[#7ea38f]/[0.05] blur-3xl"
      />

      <div className="relative flex items-center justify-between border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-[#cba36e]" aria-hidden="true" />
          <span className="eyebrow text-[#cba36e]/90">Hardcover Edition</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
          {playing ? "Reading aloud" : "Opens on playback"}
        </span>
      </div>

      {/* Expanded hardcover book showcase stage */}
      <div className="relative mx-auto mt-6 flex h-[380px] w-full max-w-xl items-center justify-center">
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
    </section>
  );
}
