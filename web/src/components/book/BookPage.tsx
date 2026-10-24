import type { BookPageData } from "./bookPagination";
import { TranscriptRenderer } from "./TranscriptRenderer";

interface BookPageProps {
  side: "left" | "right";
  kind?: "paper" | "endpaper";
  page: BookPageData | null;
  bookTitle: string;
  revealedWordIdx: number;
  activeWordIdx: number;
  fullyRevealed: boolean;
  placeholder?: string | null;
}

/**
 * A single physical page of the open book — warm ivory paper, running head,
 * justified serif body, and a folio number. The endpaper variant is the
 * decorated inside of the front cover.
 */
export function BookPage({
  side,
  kind = "paper",
  page,
  bookTitle,
  revealedWordIdx,
  activeWordIdx,
  fullyRevealed,
  placeholder = null,
}: BookPageProps) {
  if (kind === "endpaper") {
    return (
      <div className={`ab-page ab-page--${side} ab-page--endpaper`}>
        <div className="ab-endplate">
          <span className="ab-endplate-label">Ex Libris</span>
          <p className="ab-endplate-title">{bookTitle}</p>
          <span className="ab-endplate-sub">EchoRead · Private Listening Library</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`ab-page ab-page--${side}`}>
      <div className="ab-page-inner">
        <div className="ab-running-head">{bookTitle}</div>
        <div className="ab-page-body" lang="en">
          {placeholder ? (
            <p className="ab-page-placeholder">{placeholder}</p>
          ) : (
            <TranscriptRenderer
              page={page}
              revealedWordIdx={revealedWordIdx}
              activeWordIdx={activeWordIdx}
              fullyRevealed={fullyRevealed}
            />
          )}
        </div>
        <div className="ab-page-number">{page ? page.pageNumber : ""}</div>
      </div>
    </div>
  );
}
