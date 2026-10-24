import { useEffect, useMemo, useRef } from "react";

import type { WordTiming } from "../api/types";
import { activeWordIndex, splitSentences } from "../components/book/bookPagination";

interface DemoNarratorOptions {
  enabled: boolean;
  playing: boolean;
  rate: number;
  words: WordTiming[];
  currentMs: number;
  /** 0–1; applied to the next spoken sentence (speech cannot change live). */
  volume?: number;
  bookId?: string | null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    return null;
  }
  const english = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  return english[0] ?? voices[0];
}

/**
 * Demo narration voice backed by the browser's built-in speech synthesis.
 *
 * It exists for the offline demo experience where no real audiobook file is
 * available (the player runs on its simulated clock). The narrator speaks the
 * sentence currently under the playhead using only transcript data the spoiler
 * rules have already revealed, so it can never read ahead of the story.
 * With real audio present the player is not in simulated mode and this hook
 * stays silent, so the two can never talk over each other.
 */
export function useDemoNarrator({
  enabled,
  playing,
  rate,
  words,
  currentMs,
  volume = 1,
  bookId = null,
}: DemoNarratorOptions) {
  const supported =
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
  const synth = supported ? window.speechSynthesis : null;
  // Kept in a ref so moving the volume slider never restarts the sentence.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const sentences = useMemo(() => splitSentences(words), [words]);
  const activeIdx = useMemo(() => activeWordIndex(words, currentMs), [words, currentMs]);

  const sentenceIdx = useMemo(() => {
    if (activeIdx < 0) {
      return -1;
    }
    for (let index = 0; index < sentences.length; index += 1) {
      const sentence = sentences[index];
      if (activeIdx >= sentence.startIdx && activeIdx <= sentence.endIdx) {
        return index;
      }
    }
    return -1;
  }, [activeIdx, sentences]);

  // Warm the voice list; Chrome populates it asynchronously.
  useEffect(() => {
    if (!synth) {
      return;
    }
    synth.getVoices();
    const handler = () => synth.getVoices();
    synth.addEventListener?.("voiceschanged", handler);
    return () => synth.removeEventListener?.("voiceschanged", handler);
  }, [synth]);

  useEffect(() => {
    if (!synth) {
      return;
    }
    if (!enabled || !playing || sentenceIdx < 0) {
      synth.cancel();
      return;
    }
    const sentence = sentences[sentenceIdx];
    const text = words
      .slice(sentence.startIdx, sentence.endIdx + 1)
      .map((word) => word.word)
      .join(" ");
    if (!text.trim()) {
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.min(2, Math.max(0.5, rate));
    utterance.pitch = 1;
    utterance.volume = Math.min(1, Math.max(0, volumeRef.current));
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    synth.speak(utterance);
  }, [synth, enabled, playing, sentenceIdx, rate, sentences, words]);

  useEffect(() => {
    return () => {
      synth?.cancel();
    };
  }, [synth, bookId]);

  return { supported };
}
