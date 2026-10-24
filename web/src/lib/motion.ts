import type { Variants } from "motion/react";

export const spring = { type: "spring", stiffness: 260, damping: 26 } as const;
export const softSpring = { type: "spring", stiffness: 140, damping: 22, mass: 0.9 } as const;

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
  },
};

export const revealText: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
  exit: { opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.25 } },
};
