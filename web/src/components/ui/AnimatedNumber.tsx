import { useEffect } from "react";
import { motion, useSpring, useTransform } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/** Spring-animated integer counter. */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const spring = useSpring(value, { stiffness: 120, damping: 20, mass: 0.6 });
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
