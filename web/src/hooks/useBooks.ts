import { useCallback, useEffect, useState } from "react";

import { fetchBooks } from "../api/client";
import type { BookSummary } from "../api/types";
import { DEMO_BOOKS } from "../lib/demoData";

export function useBooks() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchBooks(signal);
      if (!signal?.aborted) {
        setError(null);
        // Offline demo: when no books are indexed yet, fall back to the built-in
        // demo library so the player and animated book stay interactive.
        setBooks(next.length > 0 ? next : DEMO_BOOKS);
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not load books");
        // Fallback to built-in demo books so interactive player & 3D scene work seamlessly
        setBooks((current) => (current.length > 0 ? current : DEMO_BOOKS));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { books, error, refresh };
}
