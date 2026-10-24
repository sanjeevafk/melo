import { useEffect, useRef, useState } from "react";
import { FileAudio, LoaderCircle, Upload, X } from "lucide-react";

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

  if (!open) {
    return null;
  }

  const chooseFile = (next: File | null) => {
    setError(null);
    if (!next) {
      return;
    }
    const isSpecial =
      next.name.endsWith(".m4b") || next.name.endsWith(".epub") || next.name.endsWith(".pdf") || next.name.endsWith(".txt");
    const limit = isSpecial ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (next.size > limit) {
      setError(
        isSpecial
          ? "Uploads must be 50 MB or smaller."
          : "Audio uploads must be 5 MB or smaller.",
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
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-heading"
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">
              <Upload size={13} aria-hidden="true" />
              Local import
            </p>
            <h2 id="upload-heading" className="mt-2 font-display text-2xl tracking-[-0.02em] text-paper">
              Add audio or document
            </h2>
            <p className="mt-1 text-xs text-white/40">
              MP3, M4B, M4A, EPUB, PDF, or TXT · local AI processing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close upload dialog"
            className="grid size-8 place-items-center rounded-full border border-white/10 text-white/45 transition hover:border-white/25 hover:text-white disabled:opacity-40"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <button
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
          className={`mt-6 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-7 text-center transition disabled:opacity-50 ${
            dragging
              ? "border-amber/60 bg-amber/[0.07]"
              : "border-white/15 bg-white/[0.02] hover:border-amber/35"
          }`}
        >
          <FileAudio size={24} className="text-amber" aria-hidden="true" />
          <span className="text-sm font-medium text-white/70">
            {file ? file.name : "Drop audio here or choose a file"}
          </span>
          <span className="text-[11px] text-white/30">
            {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB selected` : "The file never leaves this machine."}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          aria-label="Audio file"
          className="sr-only"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />

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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-amber transition-all duration-300"
                style={{ width: `${Math.max(5, progress.pct)}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
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
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!file || busy}
            className="inline-flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-xs font-semibold text-ink-950 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload size={14} aria-hidden="true" />
            )}
            {busy ? (progress?.stage || "Transcribing locally…") : "Import audio"}
          </button>
        </div>
      </div>
    </div>
  );
}
