import { useEffect, useState } from "react";

import { fetchBook } from "../api/client";
import type { BookManifest } from "../api/types";
import { getDemoManifest } from "../lib/demoData";

export function useBookManifest(bookId: string | null) {
  const [manifest, setManifest] = useState<BookManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setManifest(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchBook(bookId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setManifest(next);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load this book");
          setManifest(getDemoManifest(bookId));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [bookId]);

  return { manifest, error, loading };
}
