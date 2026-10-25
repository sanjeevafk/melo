import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { streamVoiceQuery } from "../api/client";
import type { VoiceEvent } from "../api/types";
import { useVoiceAnswer, type SendOptions } from "../hooks/useVoiceAnswer";

vi.mock("../api/client", () => ({ streamVoiceQuery: vi.fn() }));

function mockStream(events: VoiceEvent[]) {
  (streamVoiceQuery as Mock).mockImplementation(
    async (_form: FormData, onEvent: (event: VoiceEvent) => void, signal?: AbortSignal) => {
      for (const event of events) {
        if (signal?.aborted) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        onEvent(event);
      }
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
    },
  );
}

async function send(
  hook: { current: ReturnType<typeof useVoiceAnswer> },
  options?: Partial<SendOptions>,
) {
  let outcome: Awaited<ReturnType<ReturnType<typeof useVoiceAnswer>["send"]>>;
  await act(async () => {
    outcome = await hook.current.send(new Blob(["audio"], { type: "audio/webm" }), {
      bookId: "book-1",
      tMs: 12_000,
      mode: "story",
      ...options,
    });
  });
  return outcome!;
}

describe("useVoiceAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns answered and records history on the normal path", async () => {
    mockStream([
      { type: "status", stage: "transcribing" },
      { type: "transcript", text: "why did the scar glow?" },
      { type: "answer", text: "Because it remembered." },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useVoiceAnswer());

    const outcome = await send(result);

    expect(outcome).toBe("answered");
    expect(result.current.state.transcript).toBe("why did the scar glow?");
    expect(result.current.state.answer).toBe("Because it remembered.");
    expect(result.current.history.current).toEqual([
      { question: "why did the scar glow?", answer: "Because it remembered." },
    ]);
  });

  it("consumes the query when onTranscript says so, without touching history", async () => {
    const onTranscript = vi.fn(() => "consume" as const);
    mockStream([
      { type: "status", stage: "transcribing" },
      { type: "transcript", text: "stop." },
      { type: "answer", text: "should never arrive" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useVoiceAnswer());

    const outcome = await send(result, { onTranscript });

    expect(onTranscript).toHaveBeenCalledWith("stop.");
    expect(outcome).toBe("consumed");
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.transcript).toBe("");
    expect(result.current.state.answer).toBe("");
    expect(result.current.history.current).toEqual([]);
    const [call] = (streamVoiceQuery as Mock).mock.calls;
    const [, , signal] = call as [FormData, unknown, AbortSignal];
    expect(signal.aborted).toBe(true);
  });

  it("continues normally when onTranscript returns continue", async () => {
    mockStream([
      { type: "transcript", text: "why did the scar glow?" },
      { type: "answer", text: "Because it remembered." },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useVoiceAnswer());

    const outcome = await send(result, { onTranscript: () => "continue" });

    expect(outcome).toBe("answered");
    expect(result.current.history.current).toHaveLength(1);
  });

  it("maps a mic_empty error event to the empty outcome and keeps the code", async () => {
    mockStream([
      { type: "transcript", text: " " },
      { type: "error", code: "mic_empty", message: "I did not catch any speech" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useVoiceAnswer());

    const outcome = await send(result);

    expect(outcome).toBe("empty");
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.error).toBe("I did not catch any speech");
    expect(result.current.state.errorCode).toBe("mic_empty");
  });

  it("maps transport failures to the failed outcome", async () => {
    (streamVoiceQuery as Mock).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useVoiceAnswer());

    const outcome = await send(result);

    expect(outcome).toBe("failed");
    expect(result.current.state.error).toBe("boom");
    expect(result.current.state.errorCode).toBeNull();
  });
});
