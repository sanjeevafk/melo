import { describe, expect, it } from "vitest";

import { matchControlCommand } from "../lib/voiceCommands";

describe("matchControlCommand", () => {
  it.each([
    ["stop", "pause"],
    ["Stop.", "pause"],
    ["pause", "pause"],
    ["quiet", "pause"],
    ["hold on", "pause"],
    ["stop please", "pause"],
  ])("matches %s", (transcript, expected) => {
    expect(matchControlCommand(transcript)).toBe(expected);
  });

  it.each([
    ["why did he stop running"],
    ["can you pause the war?"],
    ["um, stop"],
    [""],
    [null],
    [undefined],
    ["the quiet ones"],
    ["stop stop stop stop"],
  ])("treats %s as a question, not a command", (transcript) => {
    expect(matchControlCommand(transcript)).toBeNull();
  });
});
