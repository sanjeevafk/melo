import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LoreEntry } from "../api/types";
import { LoreLogDrawer } from "../components/LoreLogDrawer";

const sampleEntries: LoreEntry[] = [
  {
    id: 1,
    book_id: "styles-ch2",
    t_ms: 60000,
    mode: "story",
    question: "Who is John Cavendish?",
    answer: "John is the master of Styles Court.",
    retrieved_chunk_ids: ["c1"],
    created_at: "2026-10-20T12:00:00Z",
  },
  {
    id: 2,
    book_id: "styles-ch2",
    t_ms: 120000,
    mode: "study",
    question: "What did Poirot do next?",
    answer: "Poirot inspected the mantelpiece.",
    retrieved_chunk_ids: [],
    created_at: "2026-10-20T12:05:00Z",
  },
];

describe("LoreLogDrawer", () => {
  it("does not render when open is false", () => {
    const { container } = render(
      <LoreLogDrawer
        open={false}
        entries={[]}
        loading={false}
        onClose={vi.fn()}
        onSeek={vi.fn()}
        onDeleteEntry={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders lore cards and handles seek and delete", () => {
    const onSeek = vi.fn();
    const onDelete = vi.fn();
    const onClearAll = vi.fn();
    const onClose = vi.fn();

    render(
      <LoreLogDrawer
        open={true}
        entries={sampleEntries}
        loading={false}
        bookTitle="Styles"
        onClose={onClose}
        onSeek={onSeek}
        onDeleteEntry={onDelete}
        onClearAll={onClearAll}
      />,
    );

    expect(screen.getByRole("heading", { name: "Lore Log" })).toBeInTheDocument();
    expect(screen.getByText("Who is John Cavendish?")).toBeInTheDocument();
    expect(screen.getByText("John is the master of Styles Court.")).toBeInTheDocument();
    expect(screen.getByText("What did Poirot do next?")).toBeInTheDocument();

    // Click seek button on first entry (01:00)
    const seekBtn = screen.getByRole("button", { name: /seek to 01:00/i });
    fireEvent.click(seekBtn);
    expect(onSeek).toHaveBeenCalledWith(60000);
    expect(onClose).toHaveBeenCalled();

    // Click delete on first entry
    const deleteBtn = screen.getByRole("button", { name: /delete question from 01:00/i });
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith(1);

    // Click clear all
    const clearBtn = screen.getByRole("button", { name: /clear all/i });
    fireEvent.click(clearBtn);
    expect(onClearAll).toHaveBeenCalled();
  });
});
