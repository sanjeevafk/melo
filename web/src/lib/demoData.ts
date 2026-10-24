import type { BookManifest, BookSummary, ContextPreview, WordTiming } from "../api/types";

/**
 * An original superhero comic tale (EchoRead Originals) used to demonstrate
 * the animated book. Timings are generated deterministically from the text so
 * the demo runs fully offline with the simulated playback clock.
 */
export const COMIC_TALE_ID = "sentinel-tale";

const COMIC_TALE_SENTENCES = [
  "THE CITY NEVER SLEEPS, AND NEITHER DO ITS SHADOWS.",
  "On a rooftop above Halcyon Avenue, a lone figure watched the skyline burn with signal fires.",
  "They called her the Sentinel, last guardian of a city that had forgotten how to hope.",
  "KRAKOOM!",
  "Lightning split the sky as the Iron Meridian Tower pulsed with stolen power.",
  "'There you are,' she whispered, and the night answered with thunder.",
  "She leapt.",
  "For one impossible moment she hung between the towers, cape snapping like a war drum.",
  "Then the wind caught her, and she was gone.",
  "MEANWHILE, FORTY FLOORS BELOW...",
  "Doctor Vane tightened the final clamp on his Resonance Engine and smiled.",
  "'One push,' he said, 'and the whole city bends its knee.'",
  "But heroes are never late; they arrive exactly when the panels demand it.",
  "Glass rained from the rafters as the Sentinel landed in a crouch of thunder.",
  "'The city kneels to no one,' she said.",
  "Vane's engines roared.",
  "THOOM!",
  "The floor buckled, and sparks wrote bright hooks across the dark.",
  "She moved like ink across paper, between muzzle flash and falling steel.",
  "The Resonance Engine screamed, and then, at last, it fell silent.",
  "Dawn came up gold over Halcyon City.",
  "On the rooftop once more, the Sentinel watched the sun climb, and the city, briefly, felt safe.",
];

function buildComicTaleWords(): WordTiming[] {
  const words: WordTiming[] = [];
  let t = 600;
  COMIC_TALE_SENTENCES.forEach((sentence, sentenceIdx) => {
    const chunkId = `comic-${sentenceIdx}`;
    sentence.split(" ").forEach((text) => {
      const duration = Math.min(720, 200 + text.length * 42);
      words.push({
        word: text,
        start_ms: Math.round(t),
        end_ms: Math.round(t + duration),
        chunk_id: chunkId,
      });
      t += duration + 90;
    });
    t += 700;
  });
  return words;
}

const comicTaleWords = buildComicTaleWords();
const comicTaleDurationMs = comicTaleWords[comicTaleWords.length - 1].end_ms + 1200;

export const DEMO_BOOKS: BookSummary[] = [
  {
    id: "styles-ch2",
    title: "The Mysterious Affair at Styles",
    author: "Agatha Christie",
    duration_ms: 282000,
    default_mode: "story",
  },
  {
    id: COMIC_TALE_ID,
    title: "The Sentinel of Halcyon City",
    author: "EchoRead Originals",
    duration_ms: comicTaleDurationMs,
    default_mode: "story",
  },
  {
    id: "attention",
    title: "Attention Is All You Need",
    author: "Vaswani et al.",
    duration_ms: 312000,
    default_mode: "study",
  },
];

export const DEMO_MANIFEST: BookManifest = {
  id: "styles-ch2",
  title: "The Mysterious Affair at Styles",
  author: "Agatha Christie",
  duration_ms: 282000,
  default_mode: "story",
  audio_url: "/media/styles-ch2.mp3",
  provenance: {
    source: "Project Gutenberg",
    license: "Public domain",
  },
  chapters: [
    {
      id: 1,
      title: "Chapter II: The 16th and 17th of July",
      start_ms: 0,
      end_ms: 140000,
    },
    {
      id: 2,
      title: "Chapter II: Poirot's Observation",
      start_ms: 140000,
      end_ms: 282000,
    },
  ],
  chunks: [
    {
      id: "chunk-1",
      chapter: 2,
      start_ms: 0,
      end_ms: 18000,
      text: "The following day was the 16th of July. As I stepped out into the garden, John Cavendish met me with a troubled face.",
    },
    {
      id: "chunk-2",
      chapter: 2,
      start_ms: 18000,
      end_ms: 38000,
      text: "He looked exceedingly grave, and held an open letter in his hand. 'Hastings,' he said, 'I don't like the look of things.'",
    },
    {
      id: "chunk-3",
      chapter: 2,
      start_ms: 38000,
      end_ms: 60000,
      text: "We walked down the long terrace together. The morning sun was warm, but a shadow seemed to hang over Styles Court.",
    },
    {
      id: "chunk-4",
      chapter: 2,
      start_ms: 60000,
      end_ms: 88000,
      text: "Mrs. Inglethorp was in her morning-room, writing letters with her customary nervous energy. Her husband Alfred hovered near the window.",
    },
    {
      id: "chunk-5",
      chapter: 2,
      start_ms: 88000,
      end_ms: 120000,
      text: "Later in the afternoon, Poirot arrived. His extraordinary little figure, stiff moustache, and egg-shaped head radiated keen precision.",
    },
  ],
  words: [
    // Chunk 1
    { word: "The", start_ms: 0, end_ms: 400, chunk_id: "chunk-1" },
    { word: "following", start_ms: 450, end_ms: 1100, chunk_id: "chunk-1" },
    { word: "day", start_ms: 1150, end_ms: 1600, chunk_id: "chunk-1" },
    { word: "was", start_ms: 1650, end_ms: 2000, chunk_id: "chunk-1" },
    { word: "the", start_ms: 2050, end_ms: 2350, chunk_id: "chunk-1" },
    { word: "16th", start_ms: 2400, end_ms: 3100, chunk_id: "chunk-1" },
    { word: "of", start_ms: 3150, end_ms: 3450, chunk_id: "chunk-1" },
    { word: "July.", start_ms: 3500, end_ms: 4300, chunk_id: "chunk-1" },
    { word: "As", start_ms: 4500, end_ms: 4800, chunk_id: "chunk-1" },
    { word: "I", start_ms: 4850, end_ms: 5100, chunk_id: "chunk-1" },
    { word: "stepped", start_ms: 5150, end_ms: 5800, chunk_id: "chunk-1" },
    { word: "out", start_ms: 5850, end_ms: 6200, chunk_id: "chunk-1" },
    { word: "into", start_ms: 6250, end_ms: 6700, chunk_id: "chunk-1" },
    { word: "the", start_ms: 6750, end_ms: 7000, chunk_id: "chunk-1" },
    { word: "garden,", start_ms: 7050, end_ms: 7800, chunk_id: "chunk-1" },
    { word: "John", start_ms: 8000, end_ms: 8500, chunk_id: "chunk-1" },
    { word: "Cavendish", start_ms: 8550, end_ms: 9400, chunk_id: "chunk-1" },
    { word: "met", start_ms: 9450, end_ms: 9800, chunk_id: "chunk-1" },
    { word: "me", start_ms: 9850, end_ms: 10100, chunk_id: "chunk-1" },
    { word: "with", start_ms: 10150, end_ms: 10500, chunk_id: "chunk-1" },
    { word: "a", start_ms: 10550, end_ms: 10750, chunk_id: "chunk-1" },
    { word: "troubled", start_ms: 10800, end_ms: 11600, chunk_id: "chunk-1" },
    { word: "face.", start_ms: 11650, end_ms: 12500, chunk_id: "chunk-1" },

    // Chunk 2
    { word: "He", start_ms: 18000, end_ms: 18400, chunk_id: "chunk-2" },
    { word: "looked", start_ms: 18450, end_ms: 19100, chunk_id: "chunk-2" },
    { word: "exceedingly", start_ms: 19150, end_ms: 20200, chunk_id: "chunk-2" },
    { word: "grave,", start_ms: 20250, end_ms: 21100, chunk_id: "chunk-2" },
    { word: "and", start_ms: 21200, end_ms: 21600, chunk_id: "chunk-2" },
    { word: "held", start_ms: 21650, end_ms: 22200, chunk_id: "chunk-2" },
    { word: "an", start_ms: 22250, end_ms: 22500, chunk_id: "chunk-2" },
    { word: "open", start_ms: 22550, end_ms: 23100, chunk_id: "chunk-2" },
    { word: "letter", start_ms: 23150, end_ms: 23750, chunk_id: "chunk-2" },
    { word: "in", start_ms: 23800, end_ms: 24100, chunk_id: "chunk-2" },
    { word: "his", start_ms: 24150, end_ms: 24500, chunk_id: "chunk-2" },
    { word: "hand.", start_ms: 24550, end_ms: 25300, chunk_id: "chunk-2" },
    { word: "'Hastings,'", start_ms: 25600, end_ms: 26500, chunk_id: "chunk-2" },
    { word: "he", start_ms: 26550, end_ms: 26850, chunk_id: "chunk-2" },
    { word: "said,", start_ms: 26900, end_ms: 27400, chunk_id: "chunk-2" },
    { word: "'I", start_ms: 27600, end_ms: 27900, chunk_id: "chunk-2" },
    { word: "don't", start_ms: 27950, end_ms: 28500, chunk_id: "chunk-2" },
    { word: "like", start_ms: 28550, end_ms: 29000, chunk_id: "chunk-2" },
    { word: "the", start_ms: 29050, end_ms: 29300, chunk_id: "chunk-2" },
    { word: "look", start_ms: 29350, end_ms: 29800, chunk_id: "chunk-2" },
    { word: "of", start_ms: 29850, end_ms: 30100, chunk_id: "chunk-2" },
    { word: "things.'", start_ms: 30150, end_ms: 31000, chunk_id: "chunk-2" },

    // Chunk 3
    { word: "We", start_ms: 38000, end_ms: 38400, chunk_id: "chunk-3" },
    { word: "walked", start_ms: 38450, end_ms: 39100, chunk_id: "chunk-3" },
    { word: "down", start_ms: 39150, end_ms: 39600, chunk_id: "chunk-3" },
    { word: "the", start_ms: 39650, end_ms: 39900, chunk_id: "chunk-3" },
    { word: "long", start_ms: 39950, end_ms: 40500, chunk_id: "chunk-3" },
    { word: "terrace", start_ms: 40550, end_ms: 41200, chunk_id: "chunk-3" },
    { word: "together.", start_ms: 41250, end_ms: 42100, chunk_id: "chunk-3" },
    { word: "The", start_ms: 42400, end_ms: 42700, chunk_id: "chunk-3" },
    { word: "morning", start_ms: 42750, end_ms: 43400, chunk_id: "chunk-3" },
    { word: "sun", start_ms: 43450, end_ms: 43900, chunk_id: "chunk-3" },
    { word: "was", start_ms: 43950, end_ms: 44300, chunk_id: "chunk-3" },
    { word: "warm,", start_ms: 44350, end_ms: 45000, chunk_id: "chunk-3" },
    { word: "but", start_ms: 45100, end_ms: 45450, chunk_id: "chunk-3" },
    { word: "a", start_ms: 45500, end_ms: 45700, chunk_id: "chunk-3" },
    { word: "shadow", start_ms: 45750, end_ms: 46400, chunk_id: "chunk-3" },
    { word: "seemed", start_ms: 46450, end_ms: 47000, chunk_id: "chunk-3" },
    { word: "to", start_ms: 47050, end_ms: 47300, chunk_id: "chunk-3" },
    { word: "hang", start_ms: 47350, end_ms: 47800, chunk_id: "chunk-3" },
    { word: "over", start_ms: 47850, end_ms: 48300, chunk_id: "chunk-3" },
    { word: "Styles", start_ms: 48350, end_ms: 49000, chunk_id: "chunk-3" },
    { word: "Court.", start_ms: 49050, end_ms: 49800, chunk_id: "chunk-3" },
  ],
};

export function getDemoContext(bookId: string | null, tMs: number, mode: string): ContextPreview {
  const manifest = getDemoManifest(bookId);
  const isStory = mode === "story";
  const cutoffMs = isStory ? tMs : manifest.duration_ms;
  const wordsPast = manifest.words.filter((w) => w.start_ms <= tMs);
  const wordsFuture = manifest.words.filter((w) => w.start_ms > tMs);

  const immediateWords = manifest.words.filter(
    (w) => w.start_ms >= Math.max(0, tMs - 90000) && w.start_ms <= tMs,
  );

  const firstChunk = manifest.chunks?.[0] ?? manifest.chunks[0];
  const retrieved =
    wordsPast.length > 5 && firstChunk
      ? [
          {
            chunk_id: firstChunk.id,
            text: firstChunk.text,
            rrf_score: 0.92,
            vector_score: 0.94,
            vector_rank: 1,
            fts_score: 0.89,
            fts_rank: 1,
            start_ms: firstChunk.start_ms,
            end_ms: firstChunk.end_ms,
          },
        ]
      : [];

  return {
    t_ms: tMs,
    cutoff_ms: cutoffMs,
    buffer_start_ms: Math.max(0, tMs - 90000),
    immediate_text: immediateWords.map((w) => w.word).join(" "),
    immediate_words: immediateWords,
    retrieved,
    blocked_chunks: isStory ? Math.max(0, Math.ceil(wordsFuture.length / 15)) : 0,
    active_chunk_id: manifest.chunks[0]?.id ?? null,
    active_chunk_truncated: false,
    mode: isStory ? "story" : "study",
  };
}

export const COMIC_TALE_MANIFEST: BookManifest = {
  id: COMIC_TALE_ID,
  title: "The Sentinel of Halcyon City",
  author: "EchoRead Originals",
  duration_ms: comicTaleDurationMs,
  default_mode: "story",
  audio_url: "/media/sentinel-tale.mp3",
  provenance: {
    source: "EchoRead Originals",
    license: "Demo content",
  },
  chapters: [
    {
      id: 1,
      title: "Issue #1: The Signal Fires",
      start_ms: 0,
      end_ms: comicTaleDurationMs,
    },
  ],
  chunks: COMIC_TALE_SENTENCES.map((sentence, sentenceIdx) => {
    const sentenceWords = comicTaleWords.filter((w) => w.chunk_id === `comic-${sentenceIdx}`);
    return {
      id: `comic-${sentenceIdx}`,
      chapter: 1,
      start_ms: sentenceWords[0].start_ms,
      end_ms: sentenceWords[sentenceWords.length - 1].end_ms,
      text: sentence,
    };
  }),
  words: comicTaleWords,
};

export function getDemoManifest(bookId: string | null): BookManifest {
  return bookId === COMIC_TALE_ID ? COMIC_TALE_MANIFEST : DEMO_MANIFEST;
}

/**
 * Per-book accent colors. Each book tints the ambient room light, the dock
 * glow, and the library chips — "every book has its own colour".
 */
export const BOOK_ACCENTS: Record<string, string> = {
  "styles-ch2": "#E8A33D", // warm lamplight amber — the cream Christie
  "sentinel-tale": "#D4694F", // ember crimson — the comic issue
  attention: "#6FB7C9", // cool slate teal — the paper
};

export const DEFAULT_ACCENT = "#E8A33D";

export function getBookAccent(bookId: string | null): string {
  return (bookId && BOOK_ACCENTS[bookId]) || DEFAULT_ACCENT;
}
