export function generateWaveformBars(count: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / count;
    const envelope = Math.sin(t * Math.PI);
    const wave = Math.sin(index * 0.42) * 0.35 + Math.cos(index * 0.78) * 0.25 + 0.55;
    const raw = envelope * wave;
    return Math.max(15, Math.min(95, Math.round(raw * 85 + 20)));
  });
}
