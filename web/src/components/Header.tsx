import { Bookmark, BookOpen, CircleAlert, CloudOff, Gauge, Plus, Radio } from "lucide-react";

import type { BookSummary, HealthResponse, Mode } from "../api/types";
import { ModeToggle } from "./ModeToggle";

interface HeaderProps {
  health: HealthResponse | null;
  healthError: string | null;
  books: BookSummary[];
  selectedBookId: string | null;
  mode: Mode;
  onSelectBook: (bookId: string) => void;
  onModeChange: (mode: Mode) => void;
  onAddBook: () => void;
  showTimings: boolean;
  onToggleTimings: () => void;
  loreCount?: number;
  onOpenLore?: () => void;
}

function statusLabel(health: HealthResponse | null, error: string | null): string {
  if (error) {
    return "Backend offline";
  }
  if (!health) {
    return "Connecting";
  }
  if (health.ready) {
    return `${health.profile.toUpperCase()} ready`;
  }
  return "Loading local models";
}

export function Header({
  health,
  healthError,
  books,
  selectedBookId,
  mode,
  onSelectBook,
  onModeChange,
  onAddBook,
  showTimings,
  onToggleTimings,
  loreCount,
  onOpenLore,
}: HeaderProps) {
  const ready = health?.ready ?? false;
  const label = statusLabel(health, healthError);

  return (
    <header className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <div className="grid size-11 place-items-center rounded-2xl border border-amber/30 bg-amber/10">
          <BookOpen className="text-amber" size={22} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-paper">
              EchoRead
            </h1>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
              v0.1
            </span>
          </div>
          <p className="mt-0.5 text-sm text-white/45">
            A listening companion that stays exactly where you are.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            ready
              ? "border-safe/30 bg-safe/10 text-safe"
              : healthError
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-amber/30 bg-amber/10 text-amber"
          }`}
          title={healthError ?? undefined}
        >
          {healthError ? (
            <CloudOff size={14} aria-hidden="true" />
          ) : ready ? (
            <Radio size={14} aria-hidden="true" />
          ) : (
            <CircleAlert size={14} aria-hidden="true" />
          )}
          {label}
        </div>

        <label className="sr-only" htmlFor="book-select">
          Book
        </label>
        <select
          id="book-select"
          value={selectedBookId ?? ""}
          onChange={(event) => onSelectBook(event.target.value)}
          disabled={books.length === 0}
          className="h-9 rounded-full border border-white/10 bg-ink-900 px-3 text-xs font-medium text-white/75 outline-none transition focus:border-amber/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {books.length === 0 ? (
            <option value="">No books indexed</option>
          ) : (
            books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))
          )}
        </select>

        <ModeToggle mode={mode} onChange={onModeChange} />

        {onOpenLore && (
          <button
            type="button"
            onClick={onOpenLore}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[11px] font-medium text-white/60 transition hover:border-amber/40 hover:text-amber"
            title="Open Lore Log (Voice Bookmarks)"
          >
            <Bookmark size={13} aria-hidden="true" />
            <span>Lore Log</span>
            {typeof loreCount === "number" && loreCount > 0 && (
              <span className="rounded-full bg-amber/20 px-1.5 py-0.5 font-mono text-[10px] text-amber">
                {loreCount}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTimings}
          aria-pressed={showTimings}
          title="Show local latency measurements"
          className={`hidden h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition sm:inline-flex ${
            showTimings
              ? "border-amber/40 bg-amber/10 text-amber"
              : "border-white/10 text-white/45 hover:border-white/20 hover:text-white/70"
          }`}
        >
          <Gauge size={13} aria-hidden="true" />
          Latency
        </button>

        <button
          type="button"
          onClick={onAddBook}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[11px] font-medium text-white/60 transition hover:border-amber/40 hover:text-amber"
        >
          <Plus size={14} aria-hidden="true" />
          Add content
        </button>
      </div>
    </header>
  );
}
