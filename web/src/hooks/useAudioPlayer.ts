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
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(fallbackDurationMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentMs(0);
    setDurationMs(fallbackDurationMs);
    setPlaying(false);
    setError(null);
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
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);
    const handleError = () => setError("The audio file could not be loaded");

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

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    try {
      const graph = await ensureGraph();
      if (graph) {
        const now = graph.context.currentTime;
        graph.gain.gain.cancelScheduledValues(now);
        graph.gain.gain.setValueAtTime(0, now);
      }
      await audio.play();
      if (graph) {
        const now = graph.context.currentTime;
        graph.gain.gain.linearRampToValueAtTime(1, now + 0.3);
      }
    } catch {
      setError("Press play again to start audio");
    }
  }, [ensureGraph]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (playing) {
      pause();
    } else {
      void play();
    }
  }, [pause, play, playing]);

  const seek = useCallback((nextMs: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) {
      return;
    }
    const clamped = Math.max(0, Math.min(audio.duration * 1000, nextMs));
    audio.currentTime = clamped / 1000;
    setCurrentMs(clamped);
  }, []);

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
    play,
    pause,
    toggle,
    seek,
    setRate,
    fadeOutAndPause,
  };
}
