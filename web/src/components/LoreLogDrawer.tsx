import { useEffect } from "react";
import { Bookmark, Compass, Play, Trash2, X } from "./ui/icons";

import type { LoreEntry } from "../api/types";
import { formatDuration } from "../lib/time";

interface LoreLogDrawerProps {
  open: boolean;
  entries: LoreEntry[];
  loading: boolean;
  bookTitle?: string | null;
  onClose: () => void;
  onSeek: (tMs: number) => void;
  onDeleteEntry: (id: number) => void;
  onClearAll: () => void;
}

export function LoreLogDrawer({
  open,
  entries,
  loading,
  bookTitle,
  onClose,
  onSeek,
  onDeleteEntry,
  onClearAll,
}: LoreLogDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lore-drawer-title"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
        aria-hidden="true"
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-white/10 bg-ink-950/90 p-6 shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-amber/15 blur-3xl"
        />
        <header className="relative flex items-start justify-between border-b border-white/[0.08] pb-5">
          <div>
            <div className="eyebrow">
              <Bookmark size={13} aria-hidden="true" />
              Voice Bookmarks
            </div>
            <h2
              id="lore-drawer-title"
              className="mt-2 font-display text-2xl font-medium text-paper"
            >
              Lore Log
            </h2>
            <p className="mt-1 text-xs text-white/50">
              {bookTitle ? `Anchored to ${bookTitle}` : "Interactive listening history"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 font-mono text-xs text-danger transition-all hover:bg-danger/20 active:scale-95"
                title="Clear all lore entries"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full border border-white/10 text-white/50 transition-all hover:bg-white/10 hover:text-white hover:rotate-90 active:scale-95"
              aria-label="Close lore log"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto py-5">
          {loading && entries.length === 0 ? (
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="rounded-xl border border-white/[0.07] p-4">
                  <div className="skeleton h-3 w-16 rounded-full" />
                  <div className="skeleton mt-3 h-3 w-3/4 rounded-full" />
                  <div className="skeleton mt-2 h-3 w-full rounded-full" />
                </div>
              ))}
              <span className="sr-only">Loading lore entries…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full border border-white/10 bg-white/5 p-5 text-amber/70 shadow-[0_0_40px_-10px_rgba(232,173,98,0.5)]">
                <Compass size={30} aria-hidden="true" />
              </div>
              <h3 className="mt-5 font-display text-lg text-paper">No questions recorded yet</h3>
              <p className="mt-2 max-w-xs text-xs leading-5 text-white/40">
                Hold Spacebar or use the mic button to ask questions as you listen. Your voice
                bookmarks and companion answers will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const isStory = entry.mode === "story";
                return (
                  <article
                    key={entry.id}
                    className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.045]"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-4 left-0 w-[2px] rounded-full ${isStory ? "bg-safe/60" : "bg-amber/60"}`}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSeek(entry.t_ms);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 font-mono text-xs font-medium text-amber transition-colors hover:border-amber hover:bg-amber/20"
                        title={`Seek to ${formatDuration(entry.t_ms)}`}
                        aria-label={`Seek to ${formatDuration(entry.t_ms)}`}
                      >
                        <Play size={10} fill="currentColor" aria-hidden="true" />
                        <span>{formatDuration(entry.t_ms)}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                            isStory
                              ? "border border-safe/30 bg-safe/10 text-safe"
                              : "border border-amber/30 bg-amber/10 text-amber"
                          }`}
                        >
                          {entry.mode}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry.id)}
                          className="rounded-full p-1 text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={`Delete question from ${formatDuration(entry.t_ms)}`}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <h4 className="mt-3 text-sm font-medium leading-snug text-paper">
                      {entry.question}
                    </h4>

                    <p className="mt-2 font-display text-[13px] leading-relaxed text-white/70">
                      {entry.answer}
                    </p>

                    {entry.retrieved_chunk_ids && entry.retrieved_chunk_ids.length > 0 && (
                      <p className="mt-2 font-mono text-[10px] text-white/30">
                        {entry.retrieved_chunk_ids.length} retrieved excerpt
                        {entry.retrieved_chunk_ids.length > 1 ? "s" : ""} cited
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="relative border-t border-white/[0.08] pt-4 text-center text-[11px] text-white/40">
          Click any timestamp to seek playback to the exact moment.
        </footer>
      </aside>
    </div>
  );
}
