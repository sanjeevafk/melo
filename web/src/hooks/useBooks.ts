import { useCallback, useEffect, useState } from "react";

import { fetchBooks } from "../api/client";
import type { BookSummary } from "../api/types";

export function useBooks() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchBooks(signal);
      if (!signal?.aborted) {
        setBooks(next);
        setError(null);
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not load books");
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
