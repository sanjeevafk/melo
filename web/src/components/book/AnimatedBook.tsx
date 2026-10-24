import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { Mode, WordTiming } from "../../api/types";
import { BookCover } from "./BookCover";
import { BookPage } from "./BookPage";
import {
  activeWordIndex,
  pageOfWordIndex,
  spreadOfPage,
} from "./bookPagination";
import { COVER_OPEN_MS, usePageTurn } from "./PageTurnController";
import { useMeasuredPages } from "./useMeasuredPages";

interface AnimatedBookProps {
  title: string;
  author: string;
  bookId?: string | null;
  playing: boolean;
  words: WordTiming[];
  currentMs: number;
  mode: Mode;
  className?: string;
}

type BookPhase = "closed" | "opening" | "open";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/**
 * The self-reading hardcover shown in the player's left panel.
 *
 * Starts closed; the cover swings open when narration begins and the live
 * transcript is typeset onto the pages, word by word, following the audio
 * playhead. Pages are packed to the real measured text height, so they only
 * turn when the page is genuinely full — nothing is clipped and every spoken
 * word is visible. Story mode renders a word only once narration has reached
 * it, so future text never enters the book's DOM.
 */
export function AnimatedBook({
  title,
  author,
  bookId = null,
  playing,
  words,
  currentMs,
  mode,
  className = "",
}: AnimatedBookProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { pages, measureBodyRef } = useMeasuredPages(words);
  const activeIdx = useMemo(() => activeWordIndex(words, currentMs), [words, currentMs]);
  const fullyRevealed = mode === "study";

  const targetSpread = spreadOfPage(pageOfWordIndex(pages, activeIdx));
  const { spread, turningFrom } = usePageTurn(targetSpread, {
    reducedMotion,
    resetKey: bookId,
  });

  const [phase, setPhase] = useState<BookPhase>("closed");
  useEffect(() => {
    if (playing && phase === "closed") {
      setPhase(reducedMotion ? "open" : "opening");
    }
  }, [playing, phase, reducedMotion]);
  useEffect(() => {
    if (phase !== "opening") {
      return;
    }
    const timer = window.setTimeout(() => setPhase("open"), COVER_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    setPhase("closed");
  }, [bookId]);

  // Leaf transitions need one rendered frame at rest before the turn class
  // is applied, otherwise the CSS transition never plays.
  const [coverFlipped, setCoverFlipped] = useState(false);
  useEffect(() => {
    if (phase !== "opening") {
      setCoverFlipped(false);
      return;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setCoverFlipped(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [phase]);

  const [leafFlipped, setLeafFlipped] = useState(false);
  useEffect(() => {
    if (turningFrom === null) {
      setLeafFlipped(false);
      return;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setLeafFlipped(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [turningFrom]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedMotion) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const bounds = stage.getBoundingClientRect();
    const nx = (event.clientX - bounds.left) / bounds.width - 0.5;
    const ny = (event.clientY - bounds.top) / bounds.height - 0.5;
    stage.style.setProperty("--book-tilt-y", `${(nx * 7).toFixed(2)}deg`);
    stage.style.setProperty("--book-tilt-x", `${(-ny * 5).toFixed(2)}deg`);
  };
  const resetTilt = () => {
    stageRef.current?.style.setProperty("--book-tilt-y", "0deg");
    stageRef.current?.style.setProperty("--book-tilt-x", "0deg");
  };

  const isOpenClass = phase !== "closed";
  const showPages = phase !== "closed";

  // Spread s shows [pages[2s - 1], pages[2s]]; the right page of spread 0
  // sits on the endpaper's verso. During a turn the leaf carries the current
  // right page on its front and the incoming left page on its back, while
  // the next right page is already rendered underneath.
  const leftPage = spread === 0 ? null : pages[2 * spread - 1] ?? null;
  const rightPage = turningFrom !== null ? pages[2 * (turningFrom + 1)] ?? null : pages[2 * spread] ?? null;
  const leafFrontPage = turningFrom !== null ? pages[2 * turningFrom] ?? null : null;
  const leafBackPage = turningFrom !== null ? pages[2 * turningFrom + 1] ?? null : null;

  const placeholder = words.length === 0 ? "The story will appear here as it is read aloud." : null;

  return (
    <div
      className={`ab-root ${className}`}
      aria-hidden="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      {/* Hidden page probe: identical page chrome with an EMPTY body — it
          measures the real available text area without ever placing
          transcript text (let alone future text) into hidden DOM. Line
          wrapping is computed off-DOM with Canvas measureText. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -300,
          top: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      >
        <div
          className="ab-page ab-page--right"
          style={{ position: "relative", width: 220, height: 340, inset: "auto" }}
        >
          <div className="ab-page-inner">
            <div className="ab-running-head">{title}</div>
            <div className="ab-page-body" ref={measureBodyRef} />
            <div className="ab-page-number">0</div>
          </div>
        </div>
      </div>

      <div className="ab-perspective">
        <div className="ab-stage" ref={stageRef}>
          <div className={`ab-book ${isOpenClass ? "is-open" : ""}`}>
            <div className="ab-ground-shadow" />
            <div className="ab-back-board" />

            <div className="ab-half ab-half--left">
              <div className="ab-stack ab-stack--left" />
              {phase === "open" && (
                <BookPage
                  side="left"
                  kind={spread === 0 ? "endpaper" : "paper"}
                  page={leftPage}
                  bookTitle={title}
                  revealedWordIdx={activeIdx}
                  activeWordIdx={activeIdx}
                  fullyRevealed={fullyRevealed}
                />
              )}
            </div>

            <div className="ab-half ab-half--right">
              <div className="ab-stack ab-stack--right" />
              {showPages && (
                <BookPage
                  side="right"
                  page={rightPage}
                  bookTitle={title}
                  revealedWordIdx={activeIdx}
                  activeWordIdx={activeIdx}
                  fullyRevealed={fullyRevealed}
                  placeholder={placeholder}
                />
              )}
            </div>

            <div className="ab-spine" />

            {turningFrom !== null && (
              <div className={`ab-leaf ${leafFlipped ? "is-turned" : ""}`}>
                <div className="ab-leaf-face ab-leaf-face--front">
                  <BookPage
                    side="right"
                    page={leafFrontPage}
                    bookTitle={title}
                    revealedWordIdx={activeIdx}
                    activeWordIdx={activeIdx}
                    fullyRevealed={fullyRevealed}
                  />
                </div>
                <div className="ab-leaf-face ab-leaf-face--back">
                  <BookPage
                    side="left"
                    page={leafBackPage}
                    bookTitle={title}
                    revealedWordIdx={activeIdx}
                    activeWordIdx={activeIdx}
                    fullyRevealed={fullyRevealed}
                  />
                </div>
              </div>
            )}

            {phase !== "open" && (
              <div className={`ab-leaf ab-leaf--cover ${coverFlipped ? "is-turned" : ""}`}>
                <div className="ab-leaf-face ab-leaf-face--front">
                  <BookCover title={title} author={author} />
                </div>
                <div className="ab-leaf-face ab-leaf-face--back">
                  <BookPage
                    side="left"
                    kind="endpaper"
                    page={null}
                    bookTitle={title}
                    revealedWordIdx={activeIdx}
                    activeWordIdx={activeIdx}
                    fullyRevealed={fullyRevealed}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
