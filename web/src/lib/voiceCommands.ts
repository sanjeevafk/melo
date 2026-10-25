export type VoiceCommand = "pause";

const CONTROL_PATTERN = /^(pause|stop|quiet|hold on)\b/;
const MAX_CONTROL_WORDS = 3;

/**
 * Match a spoken control command. The utterance must open with the command
 * itself and stay short, so questions that merely contain a control word
 * ("why did he stop running", "the quiet ones") still route to the query
 * pipeline.
 */
export function matchControlCommand(
  transcript: string | null | undefined,
): VoiceCommand | null {
  if (!transcript) {
    return null;
  }
  const words = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > MAX_CONTROL_WORDS) {
    return null;
  }
  return CONTROL_PATTERN.test(words.join(" ")) ? "pause" : null;
}
