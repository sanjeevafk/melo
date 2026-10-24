/**
 * Cinematic museum-grade ambient backdrop:
 * Deep charcoal ground, gentle warm studio top glow, and film grain.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      {/* Soft warm antique gold ambient overhead lighting */}
      <div className="absolute left-1/2 top-[-20%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(203,163,110,0.065),transparent_70%)] blur-3xl" />

      {/* Very subtle sage atmosphere at the base */}
      <div className="absolute bottom-[-15%] right-[10%] h-[500px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(126,163,143,0.035),transparent_70%)] blur-3xl" />

      {/* Film grain texture */}
      <div className="grain" />
    </div>
  );
}
