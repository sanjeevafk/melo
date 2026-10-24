import { GraduationCap, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

import type { Mode } from "../api/types";
import { spring } from "../lib/motion";

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

const OPTIONS: { value: Mode; label: string; Icon: typeof ShieldCheck; pill: string }[] = [
  {
    value: "story",
    label: "Story",
    Icon: ShieldCheck,
    pill: "bg-[#cba36e] shadow-[0_2px_12px_rgba(203,163,110,0.35)]",
  },
  {
    value: "study",
    label: "Study",
    Icon: GraduationCap,
    pill: "bg-[#7ea38f] shadow-[0_2px_12px_rgba(126,163,143,0.35)]",
  },
];

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      className="relative inline-flex items-center rounded-full border border-white/10 bg-[#121316] p-0.5"
      role="group"
      aria-label="Companion mode"
    >
      {OPTIONS.map(({ value, label, Icon, pill }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            className={`relative flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-colors duration-150 ${
              active ? "text-[#0c0d10]" : "text-white/50 hover:text-white/80"
            }`}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                transition={spring}
                className={`absolute inset-0 rounded-full ${pill}`}
                aria-hidden="true"
              />
            )}
            <Icon size={13} aria-hidden="true" className="relative" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
