import { describe, expect, it } from "vitest";

import type { WordTiming } from "../api/types";
import {
  activeWordIndex,
  pageOfWordIndex,
  paginateByHeights,
  paginateSentences,
  spreadOfPage,
  splitSentences,
} from "../components/book/bookPagination";

function word(text: string, index: number, gapMs = 60): WordTiming {
  const start = index * 400 + Math.max(0, index - 1) * gapMs;
  return { word: text, start_ms: start, end_ms: start + 340, chunk_id: "c1" };
}

const words: WordTiming[] = [
  word("The", 0),
  word("wind", 1),
  word("fell.", 2),
  word("Rain", 3),
  word("tapped", 4),
  word("glass.", 5),
];

describe("splitSentences", () => {
  it("breaks sentences on terminal punctuation", () => {
    const sentences = splitSentences(words);
    expect(sentences).toHaveLength(2);
    expect(sentences[0].words.map((w) => w.word)).toEqual(["The", "wind", "fell."]);
    expect(sentences[1].words.map((w) => w.word)).toEqual(["Rain", "tapped", "glass."]);
    expect(sentences[0].startIdx).toBe(0);
    expect(sentences[0].endIdx).toBe(2);
    expect(sentences[1].startIdx).toBe(3);
  });

  it("breaks on long silent gaps between words", () => {
    const gapped: WordTiming[] = [
      { word: "chapter", start_ms: 0, end_ms: 300, chunk_id: "c" },
      { word: "two", start_ms: 0, end_ms: 300, chunk_id: "c" },
      { word: "dawn", start_ms: 4000, end_ms: 4300, chunk_id: "c" },
    ];
    const sentences = splitSentences(gapped);
    expect(sentences).toHaveLength(2);
  });

  it("returns no sentences for an empty transcript", () => {
    expect(splitSentences([])).toEqual([]);
  });
});

describe("paginateSentences", () => {
  it("covers every word index exactly once across pages", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      word(index % 3 === 2 ? `word${index}.` : `word${index}`, index),
    );
    const pages = paginateSentences(splitSentences(many), 8);
    const seen = pages.flatMap((page) => {
      const indices: number[] = [];
      page.sentences.forEach((sentence) => {
        for (let i = sentence.startIdx; i <= sentence.endIdx; i += 1) indices.push(i);
      });
      return indices;
    });
    expect(seen).toEqual([...many.keys()]);
    pages.forEach((page, index) => {
      expect(page.pageNumber).toBe(index + 1);
    });
  });

  it("produces one blank page for an empty transcript", () => {
    const pages = paginateSentences([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].sentences).toEqual([]);
    expect(pages[0].pageNumber).toBe(1);
  });
});

describe("paginateByHeights", () => {
  const many = Array.from({ length: 24 }, (_, index) =>
    word(index % 3 === 2 ? `word${index}.` : `word${index}`, index),
  );
  const sentences = splitSentences(many);

  it("never packs more height than the page allows", () => {
    const heights = sentences.map((_, i) => 30 + (i % 4) * 10);
    const avail = 100;
    const pages = paginateByHeights(sentences, heights, avail);
    expect(pages.length).toBeGreaterThan(1);
    // every page's sentences fit except at most the first on a fresh page
    pages.forEach((page) => {
      const total = page.sentences.reduce((sum, s) => {
        const idx = sentences.indexOf(s);
        return sum + heights[idx];
      }, 0);
      expect(total).toBeLessThanOrEqual(avail + Math.max(...heights));
    });
  });

  it("keeps every word index exactly once and in order", () => {
    const heights = sentences.map(() => 40);
    const pages = paginateByHeights(sentences, heights, 100);
    const seen: number[] = [];
    pages.forEach((page) => {
      page.sentences.forEach((sentence) => {
        for (let i = sentence.startIdx; i <= sentence.endIdx; i += 1) seen.push(i);
      });
    });
    expect(seen).toEqual([...many.keys()]);
    pages.forEach((page, index) => expect(page.pageNumber).toBe(index + 1));
  });

  it("splits an oversized sentence across pages by words", () => {
    const tallWords: WordTiming[] = Array.from({ length: 40 }, (_, i) => word(`w${i}`, i, 0));
    const tall = splitSentences(tallWords)[0];
    const pages = paginateByHeights([tall], [500], 100);
    expect(pages.length).toBeGreaterThan(1);
    const seen: number[] = [];
    pages.forEach((page) => {
      page.sentences.forEach((sentence) => {
        for (let i = sentence.startIdx; i <= sentence.endIdx; i += 1) seen.push(i);
      });
    });
    expect(seen).toEqual([...Array(40).keys()]);
  });

  it("handles empty input", () => {
    const pages = paginateByHeights([], [], 100);
    expect(pages).toHaveLength(1);
    expect(pages[0].sentences).toEqual([]);
  });
});

describe("index lookups", () => {
  it("finds the active word by binary search", () => {
    expect(activeWordIndex(words, -1)).toBe(-1);
    expect(activeWordIndex(words, 0)).toBe(0);
    expect(activeWordIndex(words, words[2].start_ms)).toBe(2);
    expect(activeWordIndex(words, 999_999)).toBe(words.length - 1);
  });

  it("maps word indices to pages and pages to spreads", () => {
    const pages = paginateSentences(splitSentences(words), 3);
    expect(pageOfWordIndex(pages, -1)).toBe(0);
    expect(pageOfWordIndex(pages, 0)).toBe(0);
    expect(pageOfWordIndex(pages, 999)).toBe(pages.length - 1);

    expect(spreadOfPage(0)).toBe(0);
    expect(spreadOfPage(1)).toBe(1);
    expect(spreadOfPage(2)).toBe(1);
    expect(spreadOfPage(3)).toBe(2);
  });
});
