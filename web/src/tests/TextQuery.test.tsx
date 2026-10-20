import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextQuery } from "../components/TextQuery";

const answer = {
  answer: "That hasn't been revealed in the book yet up to where you are listening.",
  context: {
    t_ms: 10000,
    cutoff_ms: 10000,
    buffer_start_ms: 0,
    immediate_text: "",
    immediate_words: [],
    retrieved: [],
    blocked_chunks: 2,
    active_chunk_id: "c1",
    active_chunk_truncated: false,
    mode: "story",
  },
  timings: { retrieval_ms: 4, llm_first_token_ms: 900, total_ms: 904 },
};

describe("TextQuery", () => {
  it("asks the typed question at the current playback moment", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(answer), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TextQuery bookId="styles-ch2" tMs={10000} mode="story" showTimings />);

    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "Who is at the door?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));

    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      book_id: "styles-ch2",
      t_ms: 10000,
      mode: "story",
      question: "Who is at the door?",
    });
    expect(screen.getByText("904 ms")).toBeInTheDocument();
  });
});
