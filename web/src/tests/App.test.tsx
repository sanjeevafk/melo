import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";

const healthyResponse = {
  ready: true,
  profile: "cpu",
  models: {
    stt: "ready",
    embeddings: "ready",
    llm: "ready",
    tts: "ready",
  },
  db: "ready",
};

const booksResponse = [
  {
    id: "styles-ch2",
    title: "The Mysterious Affair at Styles",
    author: "Agatha Christie",
    duration_ms: 282000,
    default_mode: "story",
  },
];

const manifestResponse = {
  ...booksResponse[0],
  audio_url: "/media/styles-ch2.mp3",
  provenance: {
    source: "Project Gutenberg",
    license: "Public domain",
  },
  chunks: [
    {
      id: "chunk-1",
      chapter: 2,
      start_ms: 0,
      end_ms: 2000,
      text: "Once upon a time.",
    },
  ],
  words: [
    { word: "Once", start_ms: 0, end_ms: 400, chunk_id: "chunk-1" },
    { word: "upon", start_ms: 500, end_ms: 800, chunk_id: "chunk-1" },
    { word: "a", start_ms: 900, end_ms: 1000, chunk_id: "chunk-1" },
  ],
};

const contextResponse = {
  t_ms: 0,
  cutoff_ms: 0,
  buffer_start_ms: 0,
  immediate_text: "",
  immediate_words: [],
  retrieved: [],
  blocked_chunks: 1,
  active_chunk_id: "chunk-1",
  active_chunk_truncated: false,
  mode: "story",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/health")) {
        return Promise.resolve(json(healthyResponse));
      }
      if (url.endsWith("/api/books")) {
        return Promise.resolve(json(booksResponse));
      }
      if (url.endsWith("/api/books/styles-ch2")) {
        return Promise.resolve(json(manifestResponse));
      }
      if (url.includes("/api/books/styles-ch2/context")) {
        return Promise.resolve(json(contextResponse));
      }
      if (url.includes("/api/books/styles-ch2/lore")) {
        return Promise.resolve(json([]));
      }
      return Promise.resolve(json({ detail: "Not found" }, 404));
    }),
  );
});

describe("App", () => {
  it("renders the listening shell with the story transcript", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "MELO" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "The Mysterious Affair at Styles" }),
    ).toBeInTheDocument();
    const transcript = await screen.findByRole("region", { name: "Follow the spoken word" });
    expect(await within(transcript).findByText("Once")).toBeInTheDocument();
    // No unrevealed word may exist anywhere in the document — transcript or book.
    expect(screen.queryByText("upon")).not.toBeInTheDocument();
    expect(screen.getByText("Spoiler shield armed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold to ask a question" })).toBeEnabled();
  });

  it("reveals the full transcript in study mode", async () => {
    render(<App />);
    const transcript = await screen.findByRole("region", { name: "Follow the spoken word" });
    expect(await within(transcript).findByText("Once")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Study" }));
    expect(await within(transcript).findByText("upon")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Study" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(await screen.findByText("Study mode: full document")).toBeInTheDocument();
  });

  it("opens and closes the lore log drawer", async () => {
    render(<App />);
    const loreBtn = await screen.findByRole("button", { name: /lore log/i });
    expect(loreBtn).toBeInTheDocument();
    fireEvent.click(loreBtn);
    expect(await screen.findByRole("heading", { name: "Lore Log" })).toBeInTheDocument();
    expect(screen.getByText("No questions recorded yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close lore log/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Lore Log" })).not.toBeInTheDocument(),
    );
  });
});
