import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { createCoverTexture, createPageEdgesTexture } from "./createCoverTexture";

interface BookModelProps {
  title: string;
  author: string;
  bookId?: string | null;
  playing: boolean;
  reducedMotion?: boolean;
}

const BOOK_WIDTH = 2.4;
const BOOK_HEIGHT = 3.35;
const BOOK_DEPTH = 0.44;
const COVER_THICKNESS = 0.045;
const PAPER_INSET = 0.055;

export function BookModel({ title, author, bookId, playing, reducedMotion = false }: BookModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Generate procedural canvas textures
  const coverTexture = useMemo(
    () => createCoverTexture({ title, author, bookId }),
    [title, author, bookId],
  );

  const pageEdgesTexture = useMemo(() => createPageEdgesTexture(), []);

  useEffect(() => {
    return () => {
      coverTexture.dispose();
      pageEdgesTexture.dispose();
    };
  }, [coverTexture, pageEdgesTexture]);

  const coverBaseColor = bookId?.includes("styles") ? "#1a1815" : "#14171a";

  const frontCoverMaterials = useMemo(() => {
    const spineMat = new THREE.MeshStandardMaterial({
      color: coverBaseColor,
      roughness: 0.65,
      metalness: 0.15,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: "#181714",
      roughness: 0.7,
    });
    const frontMat = new THREE.MeshStandardMaterial({
      map: coverTexture,
      roughness: 0.42,
      metalness: 0.28,
      bumpScale: 0.03,
    });
    const insideMat = new THREE.MeshStandardMaterial({
      color: "#dfd8c8",
      roughness: 0.9,
    });

    return [edgeMat, spineMat, edgeMat, edgeMat, frontMat, insideMat];
  }, [coverTexture, coverBaseColor]);

  const backCoverMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: coverBaseColor,
        roughness: 0.65,
        metalness: 0.15,
      }),
    [coverBaseColor],
  );

  const pageBlockMaterials = useMemo(() => {
    const edgeMat = new THREE.MeshStandardMaterial({
      map: pageEdgesTexture,
      roughness: 0.85,
      metalness: 0.05,
    });
    const spineFace = new THREE.MeshStandardMaterial({
      color: "#101010",
      roughness: 1,
    });
    const paperTop = new THREE.MeshStandardMaterial({
      color: "#e6decb",
      roughness: 0.95,
    });

    return [edgeMat, spineFace, edgeMat, edgeMat, paperTop, paperTop];
  }, [pageEdgesTexture]);

  // Dynamic frame loop with mouse tracking & floating physics
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (reducedMotion) {
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.rotation.set(0.1, 0.28, 0);
      return;
    }

    const t = state.clock.getElapsedTime();
    const pointer = state.pointer; // normalized [-1, 1]

    // Target rotation based on mouse pointer coordinates + idle sway
    const targetRotY = 0.26 + pointer.x * 0.35 + Math.sin(t * 0.8) * 0.08;
    const targetRotX = 0.12 - pointer.y * 0.25 + Math.cos(t * 0.9) * 0.04;
    const targetPosZ = pointer.x * 0.15;

    // Smoothly damp towards target
    groupRef.current.rotation.y = THREE.MathUtils.damp(
      groupRef.current.rotation.y,
      targetRotY,
      4,
      delta,
    );

    groupRef.current.rotation.x = THREE.MathUtils.damp(
      groupRef.current.rotation.x,
      targetRotX,
      4,
      delta,
    );

    groupRef.current.position.z = THREE.MathUtils.damp(
      groupRef.current.position.z,
      targetPosZ,
      3,
      delta,
    );

    // Dynamic subtle scale pulse when audio is playing
    const targetScale = playing ? 1.02 + Math.sin(t * 4) * 0.012 : 1;
    groupRef.current.scale.setScalar(
      THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 5, delta),
    );
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[0.12, 0.26, 0]}>
      {/* Front Cover */}
      <mesh
        position={[0, 0, BOOK_DEPTH / 2 - COVER_THICKNESS / 2]}
        material={frontCoverMaterials}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[BOOK_WIDTH, BOOK_HEIGHT, COVER_THICKNESS]} />
      </mesh>

      {/* Back Cover */}
      <mesh
        position={[0, 0, -BOOK_DEPTH / 2 + COVER_THICKNESS / 2]}
        material={backCoverMaterial}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[BOOK_WIDTH, BOOK_HEIGHT, COVER_THICKNESS]} />
      </mesh>

      {/* Spine (Curved cloth binder) */}
      <mesh
        position={[-BOOK_WIDTH / 2 + 0.02, 0, 0]}
        material={backCoverMaterial}
        castShadow
      >
        <cylinderGeometry
          args={[
            BOOK_DEPTH / 2,
            BOOK_DEPTH / 2,
            BOOK_HEIGHT,
            24,
            1,
            false,
            Math.PI * 0.5,
            Math.PI,
          ]}
        />
      </mesh>

      {/* Gold spine title ribbon */}
      <mesh position={[-BOOK_WIDTH / 2 - 0.005, 0, 0]}>
        <planeGeometry args={[0.025, BOOK_HEIGHT * 0.72]} />
        <meshStandardMaterial
          color="#cba36e"
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>

      {/* Paper Block (Recessed pages) */}
      <mesh
        position={[PAPER_INSET / 2, 0, 0]}
        material={pageBlockMaterials}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            BOOK_WIDTH - PAPER_INSET,
            BOOK_HEIGHT - PAPER_INSET * 2,
            BOOK_DEPTH - COVER_THICKNESS * 2,
          ]}
        />
      </mesh>
    </group>
  );
}
