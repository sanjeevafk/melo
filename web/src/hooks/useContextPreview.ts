import { useEffect, useState } from "react";

import { fetchContext } from "../api/client";
import type { ContextPreview, Mode } from "../api/types";

export function useContextPreview(
  bookId: string | null,
  tMs: number,
  mode: Mode,
) {
  const [context, setContext] = useState<ContextPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const second = Math.floor(tMs / 1000);

  useEffect(() => {
    if (!bookId) {
      setContext(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchContext(bookId, second * 1000, mode, undefined, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) {
            setContext(next);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (
            !controller.signal.aborted &&
            !(cause instanceof DOMException && cause.name === "AbortError") &&
            !(cause instanceof Error && cause.name === "AbortError")
          ) {
            setError(cause instanceof Error ? cause.message : "Context unavailable");
          }
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [bookId, mode, second]);

  return { context, error };
}
