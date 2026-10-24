interface AmbientBackgroundProps {
  /** Dominant color of the current book; tints the room light. */
  accent?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Cinematic ambient backdrop: a deep warm ground with a large, heavily
 * blurred glow tinted by the current book's dominant color — like a reading
 * lamp that changes warmth with whichever book is open — plus film grain.
 */
export function AmbientBackground({ accent = "#E8A33D" }: AmbientBackgroundProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      {/* The book's own light: huge blurred bloom from above */}
      <div
        className="absolute left-1/2 top-[-25%] h-[720px] w-[1100px] -translate-x-1/2 rounded-full blur-[110px] transition-[background] duration-700"
        style={{
          background: `radial-gradient(ellipse, ${hexToRgba(accent, 0.14)}, transparent 70%)`,
        }}
      />

      {/* Warm base wash near the dock */}
      <div
        className="absolute bottom-[-20%] left-[8%] h-[520px] w-[640px] rounded-full blur-[100px] transition-[background] duration-700"
        style={{
          background: `radial-gradient(circle, ${hexToRgba(accent, 0.07)}, transparent 70%)`,
        }}
      />

      {/* Faint sage counter-light for depth */}
      <div className="absolute bottom-[-15%] right-[10%] h-[500px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(126,163,143,0.05),transparent_70%)] blur-3xl" />

      {/* Film grain texture */}
      <div className="grain" />
    </div>
  );
}
