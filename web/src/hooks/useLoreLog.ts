import { useCallback, useEffect, useState } from "react";

import { clearLoreEntries, deleteLoreEntry, fetchLoreEntries } from "../api/client";
import type { LoreEntry } from "../api/types";

export function useLoreLog(bookId: string | null) {
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bookId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLoreEntries(bookId);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lore log");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeEntry = useCallback(
    async (entryId: number) => {
      if (!bookId) {
        return;
      }
      await deleteLoreEntry(bookId, entryId);
      setEntries((prev) => prev.filter((item) => item.id !== entryId));
    },
    [bookId],
  );

  const clearAll = useCallback(async () => {
    if (!bookId) {
      return;
    }
    await clearLoreEntries(bookId);
    setEntries([]);
  }, [bookId]);

  return {
    entries,
    loading,
    error,
    refresh,
    removeEntry,
    clearAll,
  };
}
