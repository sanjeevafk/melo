import { useEffect, useRef, useState } from "react";
import { FileAudio, LoaderCircle, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { spring } from "../lib/motion";

import { uploadBook } from "../api/client";
import type { BookManifest, Mode } from "../api/types";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (book: BookManifest) => Promise<void> | void;
}

const ACCEPTED =
  ".mp3,.webm,.m4a,.m4b,.epub,.pdf,.txt,audio/mpeg,audio/webm,audio/mp4,audio/x-m4a,application/epub+zip,application/pdf,text/plain";

export function UploadDialog({ open, onClose, onUploaded }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("story");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; pct: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose, open]);

  const chooseFile = (next: File | null) => {
    setError(null);
    if (!next) {
      return;
    }
    const isSpecial =
      next.name.endsWith(".m4b") ||
      next.name.endsWith(".epub") ||
      next.name.endsWith(".pdf") ||
      next.name.endsWith(".txt");
    const limit = isSpecial ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (next.size > limit) {
      setError(
        isSpecial ? "Uploads must be 50 MB or smaller." : "Audio uploads must be 5 MB or smaller.",
      );
      return;
    }
    setFile(next);
    if (!title.trim()) {
      setTitle(next.name.replace(/\.[^.]+$/, ""));
    }
  };

  const submit = async () => {
    if (!file || busy) {
      return;
    }
    const form = new FormData();
    form.append("audio", file);
    form.append("title", title.trim() || file.name);
    form.append("mode", mode);
    setBusy(true);
    setProgress({ stage: "Uploading…", pct: 5 });
    setError(null);
    try {
      const book = await uploadBook(form, undefined, (job) => {
        setProgress({
          stage: job.stage || (job.status === "completed" ? "Ready" : job.status),
          pct: job.progress_pct,
        });
      });
      await onUploaded(book);
      setFile(null);
      setTitle("");
      setMode("story");
      setProgress(null);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
    {open ? (
    <motion.div
      key="upload-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-heading"
        initial={{ opacity: 0, scale: 0.92, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.95, y: 12, filter: "blur(6px)" }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="card relative w-full max-w-lg overflow-hidden !bg-ink-900/90 p-6"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-20 size-60 rounded-full bg-amber/15 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">
              <Upload size={13} aria-hidden="true" />
              Local import
            </p>
            <h2 id="upload-heading" className="mt-2 font-display text-2xl font-medium tracking-[-0.02em] text-paper">
              Add audio or document
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Audiobooks (.mp3, .m4b) or chapters/articles (.pdf, .epub, .txt) · 100% offline.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            disabled={busy}
            whileHover={{ rotate: 90 }}
            transition={spring}
            aria-label="Close upload dialog"
            className="grid size-8 place-items-center rounded-full border border-white/10 text-white/45 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
          >
            <X size={15} aria-hidden="true" />
          </motion.button>
        </div>

        <motion.button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
          disabled={busy}
          animate={{ scale: dragging ? 1.02 : 1 }}
          whileHover={{ y: -2 }}
          transition={spring}
          className={`relative mt-6 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center transition-colors disabled:opacity-50 ${
            dragging
              ? "border-amber/70 bg-amber/[0.08] shadow-[0_0_40px_-8px_rgba(232,173,98,0.5)]"
              : file
                ? "border-safe/40 bg-safe/[0.05]"
                : "border-white/15 bg-white/[0.02] hover:border-amber/40 hover:bg-amber/[0.03]"
          }`}
        >
          <motion.span
            animate={dragging ? { y: [0, -6, 0] } : { y: 0 }}
            transition={dragging ? { duration: 0.8, repeat: Infinity } : spring}
            className={`grid size-12 place-items-center rounded-2xl border ${
              file ? "border-safe/30 bg-safe/10 text-safe" : "border-amber/30 bg-amber/10 text-amber"
            }`}
          >
            <FileAudio size={22} aria-hidden="true" />
          </motion.span>
          <span className="mt-1 text-sm font-medium text-white/75">
            {file ? file.name : "Drop audio here or choose a file"}
          </span>
          <span className="text-[11px] text-white/30">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB selected`
              : "The file never leaves this machine."}
          </span>
        </motion.button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          aria-label="Audio file"
          className="sr-only"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
        <p className="mt-2 text-center text-[11px] text-white/35">
          Audiobooks (.mp3, .m4b) transcribe in seconds. Documents (.pdf, .epub) are synthesized to
          audio (up to 250 sentences / ~15 min).
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1.5 text-xs text-white/45">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              placeholder="Chapter title"
              className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white/80 outline-none transition placeholder:text-white/25 focus:border-amber/50 disabled:opacity-50"
            />
          </label>
          <label className="grid gap-1.5 text-xs text-white/45">
            Default mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
              disabled={busy}
              className="h-10 rounded-xl border border-white/10 bg-ink-800 px-3 text-sm text-white/75 outline-none focus:border-amber/50 disabled:opacity-50"
            >
              <option value="story">Story</option>
              <option value="study">Study</option>
            </select>
          </label>
        </div>

        {busy && progress ? (
          <div className="mt-4 space-y-1.5" role="status" aria-live="polite">
            <div className="flex justify-between font-mono text-[11px] text-white/50">
              <span>{progress.stage}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-ember via-amber to-[#f6c98a]"
                animate={{ width: `${Math.max(5, progress.pct)}%` }}
                transition={spring}
              >
                <span className="skeleton absolute inset-0 opacity-60" />
              </motion.div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-xs font-medium text-white/45 transition hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={() => void submit()}
            disabled={!file || busy}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
            className="btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload size={14} aria-hidden="true" />
            )}
            {busy ? (progress?.stage || "Transcribing locally…") : "Import audio"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
    ) : null}
    </AnimatePresence>
  );
}
