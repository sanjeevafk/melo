import { Bookmark, Compass, Play, Trash2, X } from "lucide-react";

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
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lore-drawer-title"
    >
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose} />

      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-ink-950 p-6 shadow-2xl">
        <header className="flex items-start justify-between border-b border-white/10 pb-5">
          <div>
            <div className="eyebrow">
              <Bookmark size={13} aria-hidden="true" />
              Voice Bookmarks
            </div>
            <h2 id="lore-drawer-title" className="mt-1 font-display text-xl text-paper">
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
                className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 font-mono text-xs text-danger hover:bg-danger/20"
                title="Clear all lore entries"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Close lore log"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto py-5">
          {loading && entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-white/40">Loading lore entries…</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full border border-white/10 bg-white/5 p-4 text-white/30">
                <Compass size={28} aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base text-paper">No questions recorded yet</h3>
              <p className="mt-2 max-w-xs text-xs text-white/40">
                Hold Spacebar or use the mic button to ask questions as you listen. Your voice
                bookmarks and companion answers will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const isStory = entry.mode === "story";
                return (
                  <article
                    key={entry.id}
                    className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSeek(entry.t_ms);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-copper/30 bg-copper/10 px-2.5 py-0.5 font-mono text-xs font-medium text-copper hover:border-copper hover:bg-copper/20"
                        title={`Seek to ${formatDuration(entry.t_ms)}`}
                        aria-label={`Seek to ${formatDuration(entry.t_ms)}`}
                      >
                        <Play size={10} aria-hidden="true" />
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
                          className="opacity-0 transition-opacity group-hover:opacity-100 rounded-full p-1 text-white/30 hover:bg-white/10 hover:text-danger"
                          aria-label={`Delete question from ${formatDuration(entry.t_ms)}`}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <h4 className="mt-2.5 font-medium text-paper text-sm leading-snug">
                      {entry.question}
                    </h4>

                    <p className="mt-2 text-xs text-white/70 leading-relaxed">{entry.answer}</p>

                    {entry.retrieved_chunk_ids && entry.retrieved_chunk_ids.length > 0 && (
                      <p className="mt-2 text-[10px] font-mono text-white/30">
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

        <footer className="border-t border-white/10 pt-4 text-center text-[11px] text-white/40">
          Click any timestamp to seek playback to the exact moment.
        </footer>
      </aside>
    </div>
  );
}
