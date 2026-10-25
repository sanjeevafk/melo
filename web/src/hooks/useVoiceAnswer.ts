import { useCallback, useEffect, useRef, useState } from "react";

import { streamVoiceQuery } from "../api/client";
import type { ContextPreview, HistoryTurn, Mode, VoiceEvent, VoiceTimings } from "../api/types";

export type VoiceStatus = "idle" | "transcribing" | "thinking" | "speaking" | "done" | "error";

/** Why send() resolved: "empty" is a mic_empty clip (server said no speech). */
export type SendOutcome = "answered" | "consumed" | "empty" | "failed";

interface VoiceState {
  status: VoiceStatus;
  transcript: string;
  answer: string;
  context: ContextPreview | null;
  timings: VoiceTimings | null;
  error: string | null;
  errorCode: string | null;
}

const initialState: VoiceState = {
  status: "idle",
  transcript: "",
  answer: "",
  context: null,
  timings: null,
  error: null,
  errorCode: null,
};

export interface SendOptions {
  bookId: string;
  tMs: number;
  mode: Mode;
  /** Runs when the transcript event arrives — before retrieval and the LLM
   * start on the server. "consume" aborts the stream and skips the answer. */
  onTranscript?: (text: string) => "consume" | "continue";
}

export function useVoiceAnswer() {
  const [state, setState] = useState<VoiceState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef(0);
  const completionResolverRef = useRef<(() => void) | null>(null);
  const pendingCompletionRef = useRef<Promise<void>>(Promise.resolve());
  const historyRef = useRef<HistoryTurn[]>([]);
  const transcriptRef = useRef("");
  const answerRef = useRef("");

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source already ended.
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    if (completionResolverRef.current) {
      completionResolverRef.current();
      completionResolverRef.current = null;
    }
    pendingCompletionRef.current = Promise.resolve();
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const primeAudio = useCallback(() => {
    void ensureAudioContext().catch(() => undefined);
  }, [ensureAudioContext]);

  const playChime = useCallback(async () => {
    const context = await ensureAudioContext();
    const now = context.currentTime;
    const tones = [659.25, 493.88];
    tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.075;
      const end = start + 0.075;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 170));
  }, [ensureAudioContext]);

  const playWav = useCallback(
    async (wavBase64: string, generation: number) => {
      const context = await ensureAudioContext();
      const binary = atob(wavBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
      if (generation !== generationRef.current) {
        return;
      }

      const now = context.currentTime;
      const startTime = Math.max(now, nextStartTimeRef.current);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
      activeSourcesRef.current.push(source);

      let resolver: () => void;
      const donePromise = new Promise<void>((resolve) => {
        resolver = resolve;
      });
      completionResolverRef.current = resolver!;
      pendingCompletionRef.current = donePromise;

      source.addEventListener("ended", () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          resolver();
        }
      });
    },
    [ensureAudioContext],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    generationRef.current += 1;
    stopPlayback();
    setState(initialState);
  }, [stopPlayback]);

  const send = useCallback(
    async (blob: Blob, options: SendOptions): Promise<SendOutcome> => {
      abortRef.current?.abort();
      stopPlayback();
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      const controller = new AbortController();
      abortRef.current = controller;
      transcriptRef.current = "";
      answerRef.current = "";
      let consumed = false;
      let empty = false;
      let errored = false;
      setState({ ...initialState, status: "transcribing" });

      const form = new FormData();
      form.append("audio", blob, "question.webm");
      form.append("book_id", options.bookId);
      form.append("t_ms", String(Math.max(0, Math.round(options.tMs))));
      form.append("mode", options.mode);
      if (historyRef.current.length > 0) {
        form.append("history", JSON.stringify(historyRef.current));
      }

      const handleEvent = (event: VoiceEvent) => {
        if (generation !== generationRef.current) {
          return;
        }
        switch (event.type) {
          case "status":
            setState((previous) => ({
              ...previous,
              status: event.stage === "thinking" ? "thinking" : "transcribing",
            }));
            break;
          case "transcript": {
            if (options.onTranscript?.(event.text) === "consume") {
              consumed = true;
              setState({ ...initialState });
              controller.abort();
              break;
            }
            transcriptRef.current = event.text;
            setState((previous) => ({ ...previous, transcript: event.text }));
            break;
          }
          case "context":
            setState((previous) => ({
              ...previous,
              context: {
                t_ms: event.t_ms,
                cutoff_ms: event.cutoff_ms,
                buffer_start_ms: event.buffer_start_ms,
                immediate_text: event.immediate_text,
                immediate_words: event.immediate_words,
                retrieved: event.retrieved,
                blocked_chunks: event.blocked_chunks,
                active_chunk_id: event.active_chunk_id,
                active_chunk_truncated: event.active_chunk_truncated,
                mode: event.mode,
              },
            }));
            break;
          case "answer_delta":
            setState((previous) => ({
              ...previous,
              answer: previous.answer + event.text,
            }));
            break;
          case "answer":
            answerRef.current = event.text;
            historyRef.current = [
              ...historyRef.current,
              { question: transcriptRef.current, answer: event.text },
            ].slice(-2);
            setState((previous) => ({ ...previous, answer: event.text }));
            break;
          case "audio":
            setState((previous) => ({ ...previous, status: "speaking" }));
            void playWav(event.wav_b64, generation).catch(() => undefined);
            break;
          case "timings":
            setState((previous) => ({
              ...previous,
              timings: {
                stt_ms: event.stt_ms,
                retrieval_ms: event.retrieval_ms,
                llm_first_token_ms: event.llm_first_token_ms,
                tts_first_sentence_ms: event.tts_first_sentence_ms,
                total_ms: event.total_ms,
              },
            }));
            break;
          case "error":
            errored = true;
            empty = event.code === "mic_empty";
            setState((previous) => ({
              ...previous,
              status: "error",
              error: event.message,
              errorCode: event.code,
            }));
            break;
          case "done":
            setState((previous) => ({
              ...previous,
              status: previous.status === "error" ? "error" : "done",
            }));
            break;
        }
      };

      try {
        await streamVoiceQuery(form, handleEvent, controller.signal);
        await pendingCompletionRef.current.catch(() => undefined);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return consumed ? "consumed" : "failed";
        }
        if (generation === generationRef.current) {
          errored = true;
          setState((previous) => ({
            ...previous,
            status: "error",
            error: cause instanceof Error ? cause.message : "Voice query failed",
            errorCode: null,
          }));
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
      return errored ? (empty ? "empty" : "failed") : "answered";
    },
    [playWav, stopPlayback],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopPlayback();
      void audioContextRef.current?.close();
    },
    [stopPlayback],
  );

  return {
    state,
    send,
    cancel,
    primeAudio,
    playChime,
    history: historyRef,
  };
}
