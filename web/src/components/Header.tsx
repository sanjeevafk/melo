import { Bookmark, CircleAlert, CloudOff, Gauge, Plus, Radio, BookOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { BookSummary, HealthResponse, Mode } from "../api/types";
import { riseIn, spring } from "../lib/motion";
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
  return "Loading models";
}

function Logo() {
  return (
    <div className="relative grid size-10 place-items-center rounded-xl border border-[#cba36e]/30 bg-gradient-to-b from-[#221f1a] to-[#121316] shadow-sm">
      <BookOpen className="text-[#cba36e]" size={20} strokeWidth={1.75} aria-hidden="true" />
      <span className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-[#cba36e]" />
    </div>
  );
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
  const tone = ready ? "safe" : healthError ? "danger" : "amber";
  const toneClass = {
    safe: "border-[#7ea38f]/30 bg-[#7ea38f]/[0.08] text-[#7ea38f]",
    danger: "border-[#c96a63]/30 bg-[#c96a63]/[0.08] text-[#c96a63]",
    amber: "border-[#cba36e]/30 bg-[#cba36e]/[0.08] text-[#cba36e]",
  }[tone];
  const dotClass = { safe: "bg-[#7ea38f]", danger: "bg-[#c96a63]", amber: "bg-[#cba36e]" }[tone];

  return (
    <motion.header
      variants={riseIn}
      className="sticky top-3 z-30 flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#0c0d10]/90 px-4 py-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between lg:px-6"
    >
      <div className="flex items-center gap-3.5">
        <Logo />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-medium tracking-tight text-[#f5f0e6]">
              EchoRead
            </h1>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
              v0.1
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/45">
            A literary listening companion with zero future spoilers.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Status Pill */}
        <motion.div
          layout
          transition={spring}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
          title={healthError ?? undefined}
        >
          <span className="relative flex size-1.5">
            <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${dotClass}`} />
            <span className={`relative inline-flex size-1.5 rounded-full ${dotClass}`} />
          </span>
          {healthError ? (
            <CloudOff size={13} aria-hidden="true" />
          ) : ready ? (
            <Radio size={13} aria-hidden="true" />
          ) : (
            <CircleAlert size={13} aria-hidden="true" />
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        {/* Book Selector Dropdown */}
        <label className="sr-only" htmlFor="book-select">
          Book
        </label>
        <select
          id="book-select"
          value={selectedBookId ?? ""}
          onChange={(event) => onSelectBook(event.target.value)}
          disabled={books.length === 0}
          className="h-8 max-w-[17rem] cursor-pointer truncate rounded-full border border-white/10 bg-[#14161b] px-3.5 text-xs font-medium text-[#f5f0e6]/90 outline-none transition hover:border-[#cba36e]/40 focus:border-[#cba36e] disabled:cursor-not-allowed disabled:opacity-40"
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

        {/* Story / Study Mode Toggle */}
        <ModeToggle mode={mode} onChange={onModeChange} />

        {/* Lore Log Drawer Trigger */}
        {onOpenLore && (
          <motion.button
            type="button"
            onClick={onOpenLore}
            whileTap={{ scale: 0.95 }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-white/70 transition-colors hover:border-[#cba36e]/40 hover:text-[#cba36e]"
            title="Open Lore Log (Voice Bookmarks)"
          >
            <Bookmark size={13} aria-hidden="true" />
            <span>Lore Log</span>
            <AnimatePresence>
              {typeof loreCount === "number" && loreCount > 0 && (
                <motion.span
                  key={loreCount}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={spring}
                  className="rounded-full bg-[#cba36e]/20 px-1.5 py-0.2 font-mono text-[10px] text-[#cba36e]"
                >
                  {loreCount}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}

        {/* Latency Toggle */}
        <motion.button
          type="button"
          onClick={onToggleTimings}
          whileTap={{ scale: 0.95 }}
          aria-pressed={showTimings}
          title="Show local latency measurements"
          className={`hidden h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:inline-flex ${
            showTimings
              ? "border-[#cba36e]/40 bg-[#cba36e]/10 text-[#cba36e]"
              : "border-white/10 bg-white/[0.02] text-white/50 hover:text-white/80"
          }`}
        >
          <Gauge size={13} aria-hidden="true" />
          Latency
        </motion.button>

        {/* Add Content Modal Trigger */}
        <motion.button
          type="button"
          onClick={onAddBook}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#cba36e]/30 bg-gradient-to-r from-[#cba36e]/20 to-[#cba36e]/10 px-3.5 text-xs font-medium text-[#f5f0e6] shadow-sm transition-colors hover:border-[#cba36e]/60"
        >
          <Plus size={13} aria-hidden="true" />
          Add content
        </motion.button>
      </div>
    </motion.header>
  );
}
