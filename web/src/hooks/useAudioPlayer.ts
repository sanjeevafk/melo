import { useCallback, useEffect, useRef, useState } from "react";

interface AudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function useAudioPlayer(src: string | null, fallbackDurationMs = 0) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const simulatedRef = useRef(false);
  const volumeRef = useRef(1);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(fallbackDurationMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [volume, setVolumeState] = useState(1);

  useEffect(() => {
    setCurrentMs(0);
    setDurationMs(fallbackDurationMs);
    setPlaying(false);
    setError(null);
    setSimulated(false);
    simulatedRef.current = false;
    if (graphRef.current) {
      void graphRef.current.context.close();
      graphRef.current = null;
    }
    if (!src) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(src);
    audio.preload = "metadata";
    audioRef.current = audio;

    const handleTime = () => setCurrentMs(Math.round(audio.currentTime * 1000));
    const handleMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationMs(Math.round(audio.duration * 1000));
      }
    };
    const handlePlay = () => setPlaying(true);
    const handlePause = () => {
      // In simulated mode the dead audio element may still emit pause/ended
      // events; they must not stop the simulated clock.
      if (!simulatedRef.current) {
        setPlaying(false);
      }
    };
    const handleEnded = handlePause;
    const handleError = () => {
      // In offline mode without backend audio asset, allow simulated interactive playback
      setError(null);
    };

    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("durationchange", handleMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.removeEventListener("durationchange", handleMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      if (graphRef.current) {
        void graphRef.current.context.close();
        graphRef.current = null;
      }
      audioRef.current = null;
    };
  }, [fallbackDurationMs, src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, [rate]);

  const ensureGraph = useCallback(async (): Promise<AudioGraph | null> => {
    const audio = audioRef.current;
    if (!audio || typeof AudioContext === "undefined") {
      return null;
    }
    if (!graphRef.current) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      graphRef.current = { context, source, gain };
    }
    if (graphRef.current.context.state === "suspended") {
      await graphRef.current.context.resume();
    }
    return graphRef.current;
  }, []);

  const simTimerRef = useRef<number | null>(null);

  const clearSimTimer = useCallback(() => {
    if (simTimerRef.current !== null) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    clearSimTimer();

    if (!audio) {
      // Offline / Simulated playback
      setPlaying(true);
      setError(null);
      setSimulated(true);
      simulatedRef.current = true;
      simTimerRef.current = window.setInterval(() => {
        setCurrentMs((prev) => {
          const next = prev + 100 * rate;
          if (durationMs > 0 && next >= durationMs) {
            clearSimTimer();
            setPlaying(false);
            return durationMs;
          }
          return next;
        });
      }, 100);
      return;
    }

    try {
      // AudioContext.resume() can stay pending indefinitely without user
      // activation; never let it block playback — fall through to the audio
      // element (and the simulated fallback on 404) instead.
      const graph = await Promise.race([
        ensureGraph(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 250)),
      ]);
      if (graph) {
        const now = graph.context.currentTime;
        graph.gain.gain.cancelScheduledValues(now);
        graph.gain.gain.setValueAtTime(0, now);
      }
      await audio.play();
      if (graph) {
        const now = graph.context.currentTime;
        graph.gain.gain.linearRampToValueAtTime(volumeRef.current, now + 0.3);
      }
    } catch {
      // If audio file 404s or browser blocks, gracefully simulate playback so UI is completely functional
      setPlaying(true);
      setError(null);
      setSimulated(true);
      simulatedRef.current = true;
      simTimerRef.current = window.setInterval(() => {
        setCurrentMs((prev) => {
          const next = prev + 100 * rate;
          if (durationMs > 0 && next >= durationMs) {
            clearSimTimer();
            setPlaying(false);
            return durationMs;
          }
          return next;
        });
      }, 100);
    }
  }, [clearSimTimer, durationMs, ensureGraph, rate]);

  const pause = useCallback(() => {
    clearSimTimer();
    audioRef.current?.pause();
    setPlaying(false);
  }, [clearSimTimer]);

  const toggle = useCallback(() => {
    if (playing) {
      pause();
    } else {
      void play();
    }
  }, [pause, play, playing]);

  const seek = useCallback((nextMs: number) => {
    const audio = audioRef.current;
    const clamped = Math.max(0, durationMs > 0 ? Math.min(durationMs, nextMs) : nextMs);
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = clamped / 1000;
    }
    setCurrentMs(clamped);
  }, [durationMs]);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = clamped;
    }
    const graph = graphRef.current;
    if (graph) {
      const now = graph.context.currentTime;
      graph.gain.gain.cancelScheduledValues(now);
      graph.gain.gain.setValueAtTime(clamped, now);
    }
  }, []);

  const skip = useCallback(
    (deltaMs: number) => {
      const audio = audioRef.current;
      const next = currentMs + deltaMs;
      const clamped = Math.max(0, durationMs > 0 ? Math.min(durationMs, next) : next);
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = clamped / 1000;
      }
      setCurrentMs(clamped);
    },
    [currentMs, durationMs],
  );

  const fadeOutAndPause = useCallback(async (fadeMs = 120) => {
    const audio = audioRef.current;
    if (!audio || audio.paused) {
      return false;
    }
    const graph = graphRef.current;
    if (!graph) {
      const original = audio.volume;
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          const progress = Math.min(1, (now - started) / fadeMs);
          audio.volume = original * (1 - progress);
          if (progress < 1) {
            requestAnimationFrame(tick);
          } else {
            audio.pause();
            audio.volume = original;
            resolve();
          }
        };
        requestAnimationFrame(tick);
      });
      return true;
    }

    const now = graph.context.currentTime;
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setValueAtTime(graph.gain.gain.value, now);
    graph.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    await wait(fadeMs + 20);
    audio.pause();
    return true;
  }, []);

  return {
    currentMs,
    durationMs,
    playing,
    rate,
    error,
    simulated,
    volume,
    play,
    pause,
    toggle,
    seek,
    skip,
    setRate,
    setVolume,
    fadeOutAndPause,
  };
}
