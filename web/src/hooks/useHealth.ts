import { useCallback, useEffect, useRef, useState } from "react";

import { fetchHealth } from "../api/client";
import type { HealthResponse } from "../api/types";

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchHealth(signal);
      setHealth(next);
      setError(null);
      if (!next.ready && !signal?.aborted) {
        timer.current = window.setTimeout(() => void refresh(), 2000);
      }
    } catch (cause) {
      if (signal?.aborted) {
        return;
      }
      setError(cause instanceof Error ? cause.message : "Backend unavailable");
      timer.current = window.setTimeout(() => void refresh(), 2000);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, [refresh]);

  return { health, error, refresh };
}
