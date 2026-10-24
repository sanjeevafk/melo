import { GraduationCap, ShieldCheck } from "lucide-react";

import type { Mode } from "../api/types";

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1"
      role="group"
      aria-label="Companion mode"
    >
      <button
        type="button"
        onClick={() => onChange("story")}
        aria-pressed={mode === "story"}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
          mode === "story" ? "bg-amber text-ink-950" : "text-white/55 hover:text-white/85"
        }`}
      >
        <ShieldCheck size={14} aria-hidden="true" />
        Story
      </button>
      <button
        type="button"
        onClick={() => onChange("study")}
        aria-pressed={mode === "study"}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
          mode === "study" ? "bg-safe text-ink-950" : "text-white/55 hover:text-white/85"
        }`}
      >
        <GraduationCap size={14} aria-hidden="true" />
        Study
      </button>
    </div>
  );
}
