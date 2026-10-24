import { useEffect, useState } from "react";
import { AudioLines, TriangleAlert } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import type { BookManifest, BookSummary, Mode } from "./api/types";
import { ContextPanel } from "./components/ContextPanel";
import { Header } from "./components/Header";
import { LoreLogDrawer } from "./components/LoreLogDrawer";
import { Player } from "./components/Player";
import { TextQuery } from "./components/TextQuery";
import { Transcript } from "./components/Transcript";
import { UploadDialog } from "./components/UploadDialog";
import { VoiceDock } from "./components/VoiceDock";
import { AmbientBackground } from "./components/ui/AmbientBackground";
import { revealText, riseIn, staggerContainer } from "./lib/motion";
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
  const { context, error: contextError } = useContextPreview(selectedBookId, player.currentMs, mode);
  const lore = useLoreLog(selectedBookId);

  const narrator = useDemoNarrator({
    enabled: voiceOn && player.simulated,
    playing: player.playing,
    rate: player.rate,
    words: manifest?.words ?? [],
    currentMs: player.currentMs,
    bookId: selectedBookId,
  });

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
    <MotionConfig reducedMotion="user">
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white/80">
      <AmbientBackground />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 lg:px-8"
      >
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

        <main className="grid flex-1 gap-6 py-8 lg:grid-cols-[1.35fr_0.9fr]">
          <motion.div variants={staggerContainer} className="grid content-start gap-6">
            <motion.div variants={riseIn}>
            <Player
              book={manifest}
              currentMs={player.currentMs}
              durationMs={player.durationMs}
              playing={player.playing}
              rate={player.rate}
              error={player.error}
              context={context}
              mode={mode}
              voiceAvailable={narrator.supported && player.simulated}
              voiceOn={voiceOn}
              onToggleVoice={() => setVoiceOn((current) => !current)}
              onToggle={player.toggle}
              onSeek={player.seek}
              onRateChange={player.setRate}
            />
            </motion.div>
            <motion.div variants={riseIn}>
            <Transcript
              words={manifest?.words ?? []}
              currentMs={player.currentMs}
              mode={mode}
              onSeek={player.seek}
            />
            </motion.div>
          </motion.div>

          <motion.div variants={staggerContainer} className="grid content-start gap-6">
            <AnimatePresence mode="popLayout">
            {serviceError ? (
              <motion.div
                key="service-error"
                variants={revealText}
                initial="hidden"
                animate="show"
                exit="exit"
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
              </motion.div>
            ) : missingModels.length > 0 ? (
              <motion.div
                key="models-missing"
                variants={revealText}
                initial="hidden"
                animate="show"
                exit="exit"
                className="card border-amber/20 bg-amber/[0.05] p-5 text-sm text-white/60"
              >
                <p className="flex items-center gap-2 font-medium text-amber">
                  <AudioLines size={15} aria-hidden="true" />
                  Local models are not ready
                </p>
                <p className="mt-2">Fetch them with `make setup && make models`, then reload.</p>
              </motion.div>
            ) : null}
            </AnimatePresence>

            <motion.div variants={riseIn}>
            <ContextPanel
              mode={mode}
              context={context}
              error={contextError}
              durationMs={player.durationMs}
            />
            </motion.div>

            <motion.div variants={riseIn}>
            <VoiceDock
              key={selectedBookId ?? "no-book"}
              book={manifest}
              currentMs={player.currentMs}
              mode={mode}
              ready={health?.ready ?? false}
              showTimings={showTimings}
              onPause={player.fadeOutAndPause}
              onResumeAt={(tMs) => {
                player.seek(tMs);
                void player.play();
              }}
              onAnswered={lore.refresh}
            />
            </motion.div>

            <motion.div variants={riseIn}>
            <TextQuery
              key={`${selectedBookId ?? "no-book"}-${mode}`}
              bookId={selectedBookId}
              tMs={player.currentMs}
              mode={mode}
              showTimings={showTimings}
              onAnswered={lore.refresh}
            />
            </motion.div>
          </motion.div>
        </main>

        <motion.footer
          variants={riseIn}
          className="flex flex-col gap-2 border-t border-white/[0.07] py-5 text-[11px] text-white/30 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-safe/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-safe" />
            </span>
            Audio, transcripts, and answers stay on this machine.
          </span>
          <span className="font-mono uppercase tracking-[0.14em]">Local temporal RAG · No telemetry</span>
        </motion.footer>
      </motion.div>

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
    </div>
    </MotionConfig>
  );
}
