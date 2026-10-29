import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { AudioLines, TriangleAlert } from "./components/ui/icons";

import type { BookManifest, BookSummary, Mode } from "./api/types";
import { ContextPanel } from "./components/ContextPanel";
import { Dock } from "./components/Dock";
import { Header } from "./components/Header";
import { LoreLogDrawer } from "./components/LoreLogDrawer";
import { Player } from "./components/Player";
import { BookShowcase } from "./components/book/BookShowcase";
import { TextQuery } from "./components/TextQuery";
import { Transcript } from "./components/Transcript";
import { UploadDialog } from "./components/UploadDialog";
import { VoiceDock } from "./components/VoiceDock";
import { AmbientBackground } from "./components/ui/AmbientBackground";
import { getBookAccent } from "./lib/demoData";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useBookManifest } from "./hooks/useBookManifest";
import { useBooks } from "./hooks/useBooks";
import { useContextPreview } from "./hooks/useContextPreview";
import { useHealth } from "./hooks/useHealth";
import { useDemoNarrator } from "./hooks/useDemoNarrator";
import { useLoreLog } from "./hooks/useLoreLog";
import { useMediaSession } from "./hooks/useMediaSession";

function preferredBook(books: BookSummary[]): BookSummary | null {
  return (
    books.find((book) => book.id === "styles-ch2") ??
    books.find((book) => book.default_mode === "story") ??
    books[0] ??
    null
  );
}

export default function App() {
  const { health, error: healthError } = useHealth();
  const { books, error: booksError, refresh: refreshBooks } = useBooks();
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("story");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showTimings, setShowTimings] = useState(false);
  const [loreOpen, setLoreOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (books.length === 0) {
      return;
    }
    if (!selectedBookId || !books.some((book) => book.id === selectedBookId)) {
      const next = preferredBook(books);
      if (next) {
        setSelectedBookId(next.id);
        setMode(next.default_mode);
      }
    }
  }, [books, selectedBookId]);

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null;
  const { manifest, error: manifestError } = useBookManifest(selectedBookId);
  const player = useAudioPlayer(manifest?.audio_url ?? null, selectedBook?.duration_ms ?? 0);
  const { context, error: contextError } = useContextPreview(
    selectedBookId,
    player.currentMs,
    mode,
  );
  const lore = useLoreLog(selectedBookId);

  const narrator = useDemoNarrator({
    enabled: voiceOn && player.simulated,
    playing: player.playing,
    rate: player.rate,
    words: manifest?.words ?? [],
    currentMs: player.currentMs,
    bookId: selectedBookId,
    volume,
  });
  const accent = getBookAccent(selectedBookId);

  useMediaSession({
    title: manifest?.title,
    artist: manifest?.author,
    playing: player.playing,
    currentMs: player.currentMs,
    durationMs: player.durationMs,
    onPlay: player.play,
    onPause: player.pause,
    onSeek: player.seek,
    onTriggerVoice: () => {
      const micBtn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Hold to ask a question"]',
      );
      micBtn?.focus();
    },
  });

  const handleSelectBook = (bookId: string) => {
    const next = books.find((book) => book.id === bookId);
    setSelectedBookId(bookId);
    if (next) {
      setMode(next.default_mode);
    }
  };

  const handleUploaded = async (book: BookManifest) => {
    await refreshBooks();
    setSelectedBookId(book.id);
    setMode(book.default_mode);
  };

  const modelEntries = Object.entries(health?.models ?? {});
  const missingModels = modelEntries.filter(([, status]) => status !== "ready");
  const serviceError = booksError ?? manifestError;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white/80"
      style={{ "--book-accent": accent } as CSSProperties}
    >
      <AmbientBackground accent={accent} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 lg:px-8">
        <Header
          health={health}
          healthError={healthError}
          books={books}
          selectedBookId={selectedBookId}
          mode={mode}
          onSelectBook={handleSelectBook}
          onModeChange={setMode}
          onAddBook={() => setUploadOpen(true)}
          showTimings={showTimings}
          onToggleTimings={() => setShowTimings((current) => !current)}
          loreCount={lore.entries.length}
          onOpenLore={() => setLoreOpen(true)}
        />

        <main className="grid flex-1 gap-6 pb-40 pt-8 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="grid content-start gap-6">
            <div>
              <BookShowcase
                book={manifest}
                playing={player.playing}
                currentMs={player.currentMs}
                mode={mode}
              />
            </div>
            <div>
              <Player
                book={manifest}
                currentMs={player.currentMs}
                durationMs={player.durationMs}
                playing={player.playing}
                context={context}
                mode={mode}
                onSeek={player.seek}
              />
            </div>
            <div>
              <Transcript
                words={manifest?.words ?? []}
                currentMs={player.currentMs}
                mode={mode}
                onSeek={player.seek}
              />
            </div>
          </div>

          <div className="grid content-start gap-6">
            {serviceError ? (
              <div
                key="service-error"
                className="card border-danger/25 bg-danger/[0.06] p-5 text-sm text-danger"
              >
                <p className="flex items-center gap-2 font-medium">
                  <TriangleAlert size={15} aria-hidden="true" />
                  Backend not reachable
                </p>
                <p className="mt-2 text-danger/75">
                  Start it with <code className="font-mono text-[11px]">make dev</code> and reload.
                  {serviceError ? ` ${serviceError}` : ""}
                </p>
              </div>
            ) : missingModels.length > 0 ? (
              <div
                key="models-missing"
                className="card border-amber/20 bg-amber/[0.05] p-5 text-sm text-white/60"
              >
                <p className="flex items-center gap-2 font-medium text-amber">
                  <AudioLines size={15} aria-hidden="true" />
                  Local models are not ready
                </p>
                <p className="mt-2">Fetch them with `make setup && make models`, then reload.</p>
              </div>
            ) : null}

            <div>
              <ContextPanel
                mode={mode}
                context={context}
                error={contextError}
                durationMs={player.durationMs}
              />
            </div>

            <div>
              <VoiceDock
                key={selectedBookId ?? "no-book"}
                book={manifest}
                currentMs={player.currentMs}
                mode={mode}
                ready={health?.ready ?? false}
                showTimings={showTimings}
                playing={player.playing}
                simulated={player.simulated}
                onPause={player.fadeOutAndPause}
                onResumeAt={(tMs) => {
                  player.seek(tMs);
                  void player.play();
                }}
                onAnswered={lore.refresh}
                onSwitchMode={setMode}
              />
            </div>

            <div>
              <TextQuery
                key={`${selectedBookId ?? "no-book"}-${mode}`}
                bookId={selectedBookId}
                tMs={player.currentMs}
                mode={mode}
                showTimings={showTimings}
                onAnswered={lore.refresh}
              />
            </div>
          </div>
        </main>

        <footer className="flex flex-col gap-2 border-t border-white/[0.07] py-5 text-[11px] text-white/30 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-safe/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-safe" />
            </span>
            Audio, transcripts, and answers stay on this machine.
          </span>
          <span className="font-mono uppercase tracking-[0.14em]">
            Local temporal RAG · No telemetry
          </span>
        </footer>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
      />

      <LoreLogDrawer
        open={loreOpen}
        entries={lore.entries}
        loading={lore.loading}
        bookTitle={manifest?.title}
        onClose={() => setLoreOpen(false)}
        onSeek={player.seek}
        onDeleteEntry={lore.removeEntry}
        onClearAll={lore.clearAll}
      />

      <Dock
        book={manifest}
        currentMs={player.currentMs}
        durationMs={player.durationMs}
        playing={player.playing}
        rate={player.rate}
        volume={volume}
        voiceAvailable={narrator.supported && player.simulated}
        voiceOn={voiceOn}
        onToggleVoice={() => setVoiceOn((current) => !current)}
        onToggle={player.toggle}
        onSeek={player.seek}
        onSkip={player.skip}
        onRateChange={player.setRate}
        onVolumeChange={setVolume}
      />
    </div>
  );
}
