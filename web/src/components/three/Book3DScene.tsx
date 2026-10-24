import { Suspense, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Float, Sparkles } from "@react-three/drei";

import { BookModel } from "./BookModel";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";

interface Book3DSceneProps {
  title: string;
  author: string;
  bookId?: string | null;
  playing: boolean;
  className?: string;
}

function StaticCoverFallback({ title, author }: { title: string; author: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex h-full max-h-[420px] w-full max-w-[280px] flex-col justify-between rounded-xl border border-[#cba36e]/30 bg-gradient-to-b from-[#1b1916] via-[#121316] to-[#0c0d10] p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]"
    >
      <div className="absolute inset-2.5 rounded-lg border border-[#cba36e]/20" />
      <div className="relative text-center">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#cba36e]/70">
          Audiobook Edition
        </span>
      </div>
      <div className="relative text-center">
        <p className="font-display text-2xl font-medium tracking-tight text-[#f5f0e6]">
          {title}
        </p>
        <p className="mt-3 font-display text-xs italic tracking-widest text-[#cba36e]">
          {author.toUpperCase()}
        </p>
      </div>
      <div className="relative text-center">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/30">
          Private Audio Horizon
        </span>
      </div>
    </div>
  );
}

function hasWebGLSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

export function Book3DScene({
  title,
  author,
  bookId,
  playing,
  className = "h-[380px] w-full",
}: Book3DSceneProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canRender3D, setCanRender3D] = useState(false);

  useEffect(() => {
    if (!hasWebGLSupport()) {
      setCanRender3D(false);
      return;
    }
    setCanRender3D(true);

    if (typeof window.matchMedia === "function") {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(media.matches);

      const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, []);

  if (!canRender3D) {
    return <StaticCoverFallback title={title} author={author} />;
  }

  return (
    <div className={`relative ${className}`}>
      <CanvasErrorBoundary fallback={<StaticCoverFallback title={title} author={author} />}>
        <Canvas
          camera={{ position: [0, 0.05, 5.4], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          className="touch-none"
        >
          {/* Studio 3-Point Lighting */}
          <ambientLight intensity={0.9} color="#fffcf5" />

          {/* Key light */}
          <directionalLight
            position={[-3, 4, 4.5]}
            intensity={2.4}
            color="#fff8ed"
            castShadow
          />

          {/* Antique gold rim light */}
          <directionalLight
            position={[4, -0.5, -2]}
            intensity={2}
            color="#e8ad62"
          />

          {/* Subtle violet fill */}
          <pointLight
            position={[0, -2, 2]}
            intensity={0.5}
            color="#9b8cff"
          />

          <Suspense fallback={null}>
            {/* Subtle floating gold embers */}
            {!reducedMotion && (
              <Sparkles
                count={35}
                scale={[4.5, 4.5, 3]}
                size={2}
                speed={0.4}
                opacity={0.5}
                color="#cba36e"
              />
            )}

            <Float
              speed={reducedMotion ? 0 : 2}
              rotationIntensity={reducedMotion ? 0 : 0.35}
              floatIntensity={reducedMotion ? 0 : 0.5}
              floatingRange={[-0.08, 0.08]}
            >
              <BookModel
                title={title}
                author={author}
                bookId={bookId}
                playing={playing}
                reducedMotion={reducedMotion}
              />
            </Float>

            {/* Soft ground contact shadow */}
            <ContactShadows
              position={[0, -1.95, 0]}
              opacity={0.68}
              scale={6}
              blur={2.2}
              far={3.5}
              resolution={512}
              color="#000000"
            />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>
    </div>
  );
}
