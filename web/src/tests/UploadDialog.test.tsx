import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadDialog } from "../components/UploadDialog";

const uploaded = {
  id: "upload-1",
  title: "New chapter",
  author: null,
  default_mode: "story" as const,
  duration_ms: 120000,
  audio_url: "/media/upload-1.mp3",
  provenance: null,
  chunks: [],
  words: [],
};

describe("UploadDialog", () => {
  it("imports an audio file and reports the new book", async () => {
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(uploaded), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadDialog open onClose={onClose} onUploaded={onUploaded} />);

    const file = new File(["audio"], "chapter.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [file] } });
    expect(screen.getByText("chapter.mp3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import audio" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("rejects files larger than the 5 MB limit before uploading", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadDialog open onClose={() => undefined} onUploaded={() => undefined} />);

    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.mp3", {
      type: "audio/mpeg",
    });
    fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent("5 MB or smaller");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls job status when backend returns an async job", async () => {
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    const jobInit = {
      id: "job-async-1",
      status: "queued",
      stage: "Queued for processing",
      progress_pct: 5,
    };
    const jobDone = {
      id: "job-async-1",
      status: "completed",
      stage: "Ready",
      progress_pct: 100,
      manifest: uploaded,
    };

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/upload")) {
        return Promise.resolve(
          new Response(JSON.stringify(jobInit), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(jobDone), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadDialog open onClose={onClose} onUploaded={onUploaded} />);

    const file = new File(["sample"], "novel.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [file] } });
    expect(screen.getByText("novel.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import audio" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-async-1"),
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
