import { useEffect } from "react";

export interface MediaSessionOptions {
  title?: string | null;
  artist?: string | null;
  playing: boolean;
  currentMs: number;
  durationMs: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (ms: number) => void;
  onTriggerVoice?: () => void;
}

export function useMediaSession({
  title,
  artist,
  playing,
  currentMs,
  durationMs,
  onPlay,
  onPause,
  onSeek,
  onTriggerVoice,
}: MediaSessionOptions): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (title && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: artist ?? "Melo",
        album: "Melo Audiobook Companion",
      });
    }

    navigator.mediaSession.playbackState = playing ? "playing" : "paused";

    try {
      if (
        "setPositionState" in navigator.mediaSession &&
        Number.isFinite(durationMs) &&
        durationMs > 0
      ) {
        navigator.mediaSession.setPositionState({
          duration: durationMs / 1000,
          playbackRate: 1.0,
          position: Math.min(durationMs / 1000, Math.max(0, currentMs / 1000)),
        });
      }
    } catch {
      // Ignore position state errors if unsupported
    }

    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", onPlay],
      ["pause", onPause],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") {
            onSeek(details.seekTime * 1000);
          }
        },
      ],
      ["seekforward", () => onSeek(currentMs + 10_000)],
      ["seekbackward", () => onSeek(Math.max(0, currentMs - 10_000))],
    ];

    if (onTriggerVoice) {
      // Earbud / headset double-tap or nexttrack activates push-to-talk voice query
      handlers.push(["nexttrack", onTriggerVoice]);
    }

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers don't support all actions
      }
    }

    return () => {
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        for (const [action] of handlers) {
          try {
            navigator.mediaSession.setActionHandler(action, null);
          } catch {
            // Ignore teardown errors
          }
        }
      }
    };
  }, [title, artist, playing, currentMs, durationMs, onPlay, onPause, onSeek, onTriggerVoice]);
}
