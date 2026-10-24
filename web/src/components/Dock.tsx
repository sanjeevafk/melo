import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { BookManifest } from "../api/types";
import { formatDuration } from "../lib/time";

interface DockProps {
  book: BookManifest | null;
  currentMs: number;
  durationMs: number;
  playing: boolean;
  rate: number;
  volume: number;
  voiceAvailable: boolean;
  voiceOn: boolean;
  onToggleVoice: () => void;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onSkip: (deltaMs: number) => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
}

const RATES = [1, 1.2, 1.5, 2];
const BAR_COUNT = 24;

function barHeight(index: number): number {
  const t = index / BAR_COUNT;
  const envelope = Math.sin(t * Math.PI);
  const wave = Math.sin(index * 0.7) * 0.4 + Math.cos(index * 1.1) * 0.2 + 0.6;
  return Math.max(15, Math.min(100, Math.round(envelope * wave * 100)));
}

/**
 * The floating glass dock pill: transport, now-playing capsule, speed and
 * volume, and the echo-ring mic that forwards hold-to-talk to the
 * companion's voice engine (which lives in the answer panel above).
 */
export function Dock({
  book,
  currentMs,
  durationMs,
  playing,
  rate,
  volume,
  voiceAvailable,
  voiceOn,
  onToggleVoice,
  onToggle,
  onSeek,
  onSkip,
  onRateChange,
  onVolumeChange,
}: DockProps) {
  const [muted, setMuted] = useState(false);
  const lastVolumeRef = useRef(volume > 0 ? volume : 1);
  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const bars = useMemo(() => Array.from({ length: BAR_COUNT }, (_, index) => barHeight(index)), []);
  const canSkip = Boolean(book) && durationMs > 0;

  const nextRate = () => {
    const index = RATES.indexOf(rate);
    onRateChange(RATES[(index + 1) % RATES.length] ?? RATES[0]);
  };

  const dispatchVoice = (type: string) => {
    window.dispatchEvent(new CustomEvent(type));
  };
  const handleMicDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatchVoice("echoread:voice-start");
  };
  const handleMicUp = () => dispatchVoice("echoread:voice-stop");

  useEffect(() => {
    return () => dispatchVoice("echoread:voice-stop");
  }, []);

  const toggleMute = () => {
    if (muted) {
      setMuted(false);
      onVolumeChange(lastVolumeRef.current);
    } else {
      lastVolumeRef.current = volume > 0 ? volume : 0.8;
      setMuted(true);
      onVolumeChange(0);
    }
  };

  const micDisabled = !book || !voiceOn || !voiceAvailable;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="dock"
      role="toolbar"
      aria-label="Playback and voice controls"
    >
      {/* Transport */}
      <button
        type="button"
        className="dock-btn"
        onClick={() => onSkip(-15000)}
        disabled={!canSkip}
        aria-label="Back 15 seconds"
        title="Back 15s"
      >
        <RotateCcw size={16} aria-hidden="true" />
      </button>

      <motion.button
        type="button"
        onClick={onToggle}
        disabled={!book}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.94 }}
        className="dock-play"
        aria-label={playing ? "Pause narration" : "Play narration"}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={playing ? "pause" : "play"}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid place-items-center"
          >
            {playing ? (
              <Pause size={20} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play className="translate-x-0.5" size={20} fill="currentColor" aria-hidden="true" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <button
        type="button"
        className="dock-btn"
        onClick={() => onSkip(15000)}
        disabled={!canSkip}
        aria-label="Forward 15 seconds"
        title="Forward 15s"
      >
        <RotateCw size={16} aria-hidden="true" />
      </button>

      {/* Now-playing capsule */}
      <div className="dock-capsule">
        <div className="dock-thumb" aria-hidden="true">
          <span className="dock-thumb-spine" />
          <span className="dock-thumb-initial">{(book?.title ?? "?").charAt(0)}</span>
        </div>
        <div className="dock-meta">
          <p className="dock-title">{book?.title ?? "No book selected"}</p>
          <div
            className="dock-progress"
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={currentMs}
            onClick={(event) => {
              if (!canSkip) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
              onSeek(fraction * durationMs);
            }}
          >
            <motion.div
              className="dock-progress-fill"
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: "tween", ease: "linear", duration: 0.2 }}
            />
          </div>
          <div className="dock-times">
            <span>{formatDuration(currentMs)}</span>
            <div className="dock-wave" data-playing={playing ? "true" : "false"}>
              {bars.map((height, index) => (
                <span
                  key={index}
                  style={{
                    height: `${height}%`,
                    animationDelay: `${(index % 8) * -0.14}s`,
                    animationPlayState: playing ? "running" : "paused",
                  }}
                />
              ))}
            </div>
            <span>-{formatDuration(Math.max(0, durationMs - currentMs))}</span>
          </div>
        </div>
      </div>

      {/* Speed chip */}
      <button type="button" className="dock-btn dock-rate" onClick={nextRate} aria-label={`Playback speed ${rate}x`}>
        {rate}x
      </button>

      {/* Volume with hover slider */}
      <div className="dock-volume group">
        <button
          type="button"
          className="dock-btn"
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        >
          {muted || volume === 0 ? (
            <VolumeX size={15} aria-hidden="true" />
          ) : (
            <Volume2 size={15} aria-hidden="true" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(event) => {
            setMuted(false);
            onVolumeChange(Number(event.target.value));
          }}
          aria-label="Volume"
          className="dock-volume-slider"
        />
      </div>

      {/* Demo narration voice toggle */}
      {voiceAvailable && (
        <button
          type="button"
          onClick={onToggleVoice}
          aria-pressed={voiceOn}
          className="dock-btn"
          title={voiceOn ? "Mute demo narration voice" : "Unmute demo narration voice"}
        >
          {voiceOn ? <Volume2 size={15} aria-hidden="true" /> : <MicOff size={15} aria-hidden="true" />}
        </button>
      )}

      {/* Echo-ring mic */}
      <button
        type="button"
        className="dock-mic"
        disabled={micDisabled}
        onPointerDown={handleMicDown}
        onPointerUp={handleMicUp}
        onPointerCancel={handleMicUp}
        onPointerLeave={handleMicUp}
        aria-label="Hold to ask the companion"
        title="Hold Space to ask"
      >
        <span className="dock-mic-ring" aria-hidden="true" />
        <Mic size={18} aria-hidden="true" />
      </button>
    </motion.div>
  );
}
