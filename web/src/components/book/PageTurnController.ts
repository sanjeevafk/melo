import { useEffect, useRef, useState } from "react";

export const PAGE_TURN_MS = 780;
export const COVER_OPEN_MS = 900;

interface PageTurnOptions {
  reducedMotion: boolean;
  resetKey?: string | null;
}

export interface PageTurnState {
  spread: number;
  turningFrom: number | null;
}

/**
 * Drives the automatic page-turn state machine for the animated book.
 *
 * A forward step of exactly one spread plays the physical turn animation;
 * seeks that jump across several spreads (forward or backward) land instantly
 * so the pages never desynchronize from the playhead.
 */
export function usePageTurn(
  targetSpread: number | null,
  { reducedMotion, resetKey = null }: PageTurnOptions,
): PageTurnState {
  const [spread, setSpread] = useState(0);
  const [turningFrom, setTurningFrom] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setTurningFrom(null);
    setSpread(0);
  }, [resetKey]);

  useEffect(() => {
    if (targetSpread === null) {
      return;
    }
    if (turningFrom !== null) {
      if (targetSpread !== turningFrom + 1) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setTurningFrom(null);
        setSpread(targetSpread);
      }
      return;
    }
    if (targetSpread === spread) {
      return;
    }
    if (targetSpread === spread + 1 && !reducedMotion) {
      const from = spread;
      setTurningFrom(from);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setTurningFrom(null);
        setSpread(from + 1);
      }, PAGE_TURN_MS);
      return () => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    }
    setSpread(targetSpread);
  }, [targetSpread, spread, turningFrom, reducedMotion]);

  return { spread, turningFrom };
}
