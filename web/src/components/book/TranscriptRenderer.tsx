import { Fragment } from "react";

import type { BookPageData } from "./bookPagination";

interface TranscriptRendererProps {
  page: BookPageData | null;
  /** Highest narrated word index; Story mode never renders beyond it. */
  revealedWordIdx: number;
  activeWordIdx: number;
  /** Study mode may show the full page immediately. */
  fullyRevealed: boolean;
}

/**
 * Renders one page of the live transcript. Words appear exactly when the
 * narration reaches them (start_ms <= currentMs), mirroring the spoiler rule
 * of the main Transcript panel — future words never enter the DOM here.
 */
export function TranscriptRenderer({
  page,
  revealedWordIdx,
  activeWordIdx,
  fullyRevealed,
}: TranscriptRendererProps) {
  if (!page || page.sentences.length === 0) {
    return null;
  }

  return (
    <>
      {page.sentences.map((sentence) => {
        const isCurrent =
          activeWordIdx >= sentence.startIdx && activeWordIdx <= sentence.endIdx;
        let visible = 0;
        const tokens = sentence.words.map((word, localIdx) => {
          const globalIdx = sentence.startIdx + localIdx;
          if (!fullyRevealed && globalIdx > revealedWordIdx) {
            return null;
          }
          visible += 1;
          // A real space after each word gives the browser a soft wrap
          // opportunity — without it the whole sentence is one unbreakable
          // run and gets clipped at the page edge instead of wrapping.
          return (
            <Fragment key={globalIdx}>
              <span className={`ab-word ${globalIdx === activeWordIdx ? "ab-word--active" : ""}`}>
                {word.word}
              </span>
              {localIdx < sentence.words.length - 1 ? " " : null}
            </Fragment>
          );
        });
        if (visible === 0) {
          return null;
        }
        return (
          <p
            key={sentence.startIdx}
            className={`ab-sentence ${isCurrent ? "ab-sentence--current" : ""}`}
          >
            {tokens}
          </p>
        );
      })}
    </>
  );
}
