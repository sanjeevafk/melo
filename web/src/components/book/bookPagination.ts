import type { WordTiming } from "../../api/types";

export interface BookSentence {
  words: WordTiming[];
  startIdx: number;
  endIdx: number;
}

export interface BookPageData {
  sentences: BookSentence[];
  startWordIdx: number;
  endWordIdx: number;
  pageNumber: number;
}

export const WORDS_PER_PAGE = 44;

const SENTENCE_END = /[.!?…]+[")'”’]*$/;
const MAX_SENTENCE_WORDS = 60;
const PARAGRAPH_GAP_MS = 1200;

export function splitSentences(words: WordTiming[]): BookSentence[] {
  const sentences: BookSentence[] = [];
  let current: WordTiming[] = [];
  let startIdx = 0;

  words.forEach((word, index) => {
    current.push(word);
    const next = words[index + 1];
    const gapBreak = next !== undefined && next.start_ms - word.end_ms > PARAGRAPH_GAP_MS;
    const lengthBreak = current.length >= MAX_SENTENCE_WORDS;
    if (SENTENCE_END.test(word.word) || gapBreak || lengthBreak || next === undefined) {
      sentences.push({ words: current, startIdx, endIdx: index });
      current = [];
      startIdx = index + 1;
    }
  });

  return sentences;
}

export function paginateSentences(
  sentences: BookSentence[],
  wordsPerPage = WORDS_PER_PAGE,
): BookPageData[] {
  const pages: BookPageData[] = [];
  let bucket: BookSentence[] = [];
  let count = 0;
  let startWordIdx = 0;

  sentences.forEach((sentence) => {
    if (bucket.length > 0 && count + sentence.words.length > wordsPerPage) {
      pages.push({
        sentences: bucket,
        startWordIdx,
        endWordIdx: sentence.startIdx - 1,
        pageNumber: pages.length + 1,
      });
      bucket = [];
      count = 0;
      startWordIdx = sentence.startIdx;
    }
    bucket.push(sentence);
    count += sentence.words.length;
  });

  if (bucket.length > 0) {
    pages.push({
      sentences: bucket,
      startWordIdx,
      endWordIdx: bucket[bucket.length - 1].endIdx,
      pageNumber: pages.length + 1,
    });
  }

  if (pages.length === 0) {
    pages.push({ sentences: [], startWordIdx: 0, endWordIdx: -1, pageNumber: 1 });
  }

  return pages;
}

/**
 * Packs sentences into pages using their real measured pixel heights so a
 * page only ever holds what physically fits (the word-count pagination is
 * only an estimate). A sentence taller than a whole page on its own is split
 * by words, proportionally to the sentence's per-word height.
 */
export function paginateByHeights(
  sentences: BookSentence[],
  heights: number[],
  availPx: number,
): BookPageData[] {
  const pages: BookPageData[] = [];
  let bucket: BookSentence[] = [];
  let used = 0;
  let startWordIdx = sentences[0]?.startIdx ?? 0;

  const flush = (endWordIdx: number) => {
    if (bucket.length === 0) {
      return;
    }
    pages.push({
      sentences: bucket,
      startWordIdx,
      endWordIdx,
      pageNumber: pages.length + 1,
    });
    bucket = [];
    used = 0;
  };

  sentences.forEach((sentence, index) => {
    const height = heights[index] ?? 0;

    if (bucket.length === 0 && height > availPx && sentence.words.length > 1) {
      // Oversized sentence: split across pages word by word.
      const perWord = height / sentence.words.length;
      const capacity = Math.max(4, Math.floor(availPx / perWord));
      let cursor = 0;
      while (cursor < sentence.words.length) {
        const slice = sentence.words.slice(cursor, cursor + capacity);
        pages.push({
          sentences: [
            {
              words: slice,
              startIdx: sentence.startIdx + cursor,
              endIdx: sentence.startIdx + cursor + slice.length - 1,
            },
          ],
          startWordIdx: sentence.startIdx + cursor,
          endWordIdx: sentence.startIdx + cursor + slice.length - 1,
          pageNumber: pages.length + 1,
        });
        cursor += slice.length;
      }
      startWordIdx = sentence.startIdx + sentence.words.length;
      return;
    }

    if (bucket.length > 0 && used + height > availPx) {
      flush(sentence.startIdx - 1);
      startWordIdx = sentence.startIdx;
    }
    bucket.push(sentence);
    used += height;
  });

  if (bucket.length > 0) {
    flush(bucket[bucket.length - 1].endIdx);
  }

  if (pages.length === 0) {
    pages.push({ sentences: [], startWordIdx: 0, endWordIdx: -1, pageNumber: 1 });
  }

  return pages;
}

export function activeWordIndex(words: WordTiming[], currentMs: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle].start_ms <= currentMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function pageOfWordIndex(pages: BookPageData[], wordIdx: number): number {
  if (pages.length === 0) return 0;
  if (wordIdx < 0) return 0;
  for (let index = 0; index < pages.length; index += 1) {
    if (wordIdx <= pages[index].endWordIdx) return index;
  }
  return pages.length - 1;
}

export function spreadOfPage(pageIdx: number): number {
  return Math.ceil(pageIdx / 2);
}
