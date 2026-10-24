import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WordTiming } from "../api/types";
import { AnimatedBook } from "../components/book/AnimatedBook";

const words: WordTiming[] = [
  { word: "Once", start_ms: 0, end_ms: 400, chunk_id: "c1" },
  { word: "upon", start_ms: 500, end_ms: 800, chunk_id: "c1" },
  { word: "a", start_ms: 900, end_ms: 1000, chunk_id: "c1" },
  { word: "time.", start_ms: 1100, end_ms: 1500, chunk_id: "c1" },
];

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnimatedBook", () => {
  it("shows the closed hardcover before playback", () => {
    render(
      <AnimatedBook
        title="Demo Book"
        author="Ada Lovelace"
        playing={false}
        words={words}
        currentMs={0}
        mode="story"
      />,
    );
    // The cover front carries the title; its endpaper back-face may too.
    expect(screen.getAllByText("Demo Book").length).toBeGreaterThan(0);
    expect(screen.getByText("ADA LOVELACE")).toBeInTheDocument();
    // The transcript stays off the closed cover.
    expect(screen.queryByText("Once")).not.toBeInTheDocument();
  });

  it("opens with playback and renders only narrated words in story mode", () => {
    render(
      <AnimatedBook
        title="Demo Book"
        author="Ada Lovelace"
        playing
        words={words}
        currentMs={600}
        mode="story"
      />,
    );
    expect(screen.getByText("Once")).toBeInTheDocument();
    expect(screen.getByText("upon")).toBeInTheDocument();
    expect(screen.queryByText("a")).not.toBeInTheDocument();
    expect(screen.queryByText("time.")).not.toBeInTheDocument();
  });

  it("reveals the full page in study mode", () => {
    render(
      <AnimatedBook
        title="Demo Book"
        author="Ada Lovelace"
        playing
        words={words}
        currentMs={0}
        mode="study"
      />,
    );
    expect(screen.getByText("Once")).toBeInTheDocument();
    expect(screen.getByText("time.")).toBeInTheDocument();
  });

  it("shows a graceful empty page when no transcript exists", () => {
    render(
      <AnimatedBook
        title="Demo Book"
        author="Ada Lovelace"
        playing
        words={[]}
        currentMs={0}
        mode="story"
      />,
    );
    expect(screen.getByText(/The story will appear here/i)).toBeInTheDocument();
  });
});
