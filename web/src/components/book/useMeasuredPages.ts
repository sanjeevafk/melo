import { useEffect, useMemo, useRef, useState } from "react";

import type { WordTiming } from "../../api/types";
import {
  paginateByHeights,
  paginateSentences,
  splitSentences,
  type BookPageData,
} from "./bookPagination";

// Must mirror .ab-page-body typography in styles.css.
const BODY_FONT_PX = 11.5;
const BODY_LINE_HEIGHT = 1.62;
const BODY_FONT_FAMILY = '"Fraunces", "Iowan Old Style", serif';
const SENTENCE_MARGIN_EM = 0.42; // .ab-sentence margin-bottom
const SENTENCE_PADDING_PX = 1; // .ab-sentence vertical padding (0.5px x2)
const MEASURE_MARGIN_PX = 3;

/**
 * Paginates the transcript by the real rendered height of each sentence so
 * text always fits inside the physical page. The available page area comes
 * from a title-only page probe (no transcript text in hidden DOM, keeping the
 * spoiler guarantee intact), and line wrapping is computed with the Canvas
 * measureText API instead of hidden DOM nodes.
 *
 * Until measurement succeeds (e.g. no layout available in jsdom), the
 * word-count estimate is used.
 */
export function useMeasuredPages(words: WordTiming[]): {
  pages: BookPageData[];
  measureBodyRef: (el: HTMLDivElement | null) => void;
} {
  const sentences = useMemo(() => splitSentences(words), [words]);
  const fallbackPages = useMemo(() => paginateSentences(sentences), [sentences]);
  const [pages, setPages] = useState<BookPageData[]>(fallbackPages);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPages(fallbackPages);
  }, [fallbackPages]);

  useEffect(() => {
    let cancelled = false;

    const measure = () => {
      const probe = bodyRef.current;
      if (cancelled || !probe) {
        return;
      }
      const bodyWidth = probe.clientWidth;
      const bodyHeight = probe.clientHeight - MEASURE_MARGIN_PX;
      if (bodyWidth <= 0 || bodyHeight <= 0) {
        return;
      }
      const context = document.createElement("canvas").getContext("2d");
      if (!context) {
        return;
      }
      context.font = `${BODY_FONT_PX}px ${BODY_FONT_FAMILY}`;
      const spaceWidth = context.measureText(" ").width;
      const lineHeight = BODY_FONT_PX * BODY_LINE_HEIGHT;
      const sentenceMargin = BODY_FONT_PX * SENTENCE_MARGIN_EM;

      const heights = sentences.map((sentence) => {
        let lineCount = 1;
        let used = 0;
        sentence.words.forEach((word, index) => {
          // Words are separated by real spaces in the DOM; the trailing
          // space of the last word hangs at line end and never wraps.
          const isLast = index === sentence.words.length - 1;
          const width =
            context.measureText(word.word).width + (isLast ? 0 : spaceWidth);
          if (index === 0) {
            used = width;
            return;
          }
          if (used + width > bodyWidth) {
            lineCount += 1;
            used = width;
          } else {
            used += width;
          }
        });
        return lineCount * lineHeight + sentenceMargin + SENTENCE_PADDING_PX;
      });

      const packed = paginateByHeights(sentences, heights, bodyHeight);
      if (!cancelled && packed.length > 0) {
        setPages(packed);
      }
    };

    // Fonts change text metrics, so measure once now (covers tests/cached
    // fonts) and again once the web fonts have finished loading.
    measure();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) {
          measure();
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [sentences]);

  const measureBodyRef = (el: HTMLDivElement | null) => {
    bodyRef.current = el;
  };

  return { pages, measureBodyRef };
}
