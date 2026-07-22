"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type ContextObserverProps = {
  onLost: () => void;
};

function ContextObserver({ onLost }: ContextObserverProps) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
    };
  }, [gl, onLost]);

  return null;
}

function OrbitalField({ active }: { active: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!active || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.08;
    groupRef.current.rotation.x =
      Math.sin(state.clock.elapsedTime * 0.16) * 0.08;
  });

  return (
    <group ref={groupRef} rotation={[0.12, -0.28, 0]}>
      <mesh position={[-1.7, 0.4, 0.2]} rotation={[0.3, 0.6, 0.1]}>
        <icosahedronGeometry args={[1.18, 2]} />
        <meshStandardMaterial
          color="#4e9188"
          roughness={0.28}
          metalness={0.62}
        />
      </mesh>

      <mesh position={[1.35, 0.85, -0.6]} rotation={[1.1, 0.2, 0.4]}>
        <torusGeometry args={[1.05, 0.12, 20, 96]} />
        <meshStandardMaterial
          color="#d6ad54"
          roughness={0.34}
          metalness={0.7}
        />
      </mesh>

      <mesh position={[0.7, -1.35, 0.4]} rotation={[0.6, 0.3, -0.4]}>
        <octahedronGeometry args={[0.72, 1]} />
        <meshStandardMaterial
          color="#e86c51"
          roughness={0.42}
          metalness={0.48}
        />
      </mesh>

      <mesh position={[2.55, -0.55, -1.2]}>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshStandardMaterial
          color="#e9e6d8"
          roughness={0.18}
          metalness={0.76}
        />
      </mesh>

      <mesh position={[-2.5, -1.1, -1.05]} rotation={[0.8, 0.2, 0.2]}>
        <torusKnotGeometry args={[0.38, 0.08, 96, 14]} />
        <meshStandardMaterial
          color="#6680a8"
          roughness={0.32}
          metalness={0.66}
        />
      </mesh>
    </group>
  );
}

export default function OrbitalStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [stageVisible, setStageVisible] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (contextLost) return;
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setStageVisible(entry?.isIntersecting ?? false),
      { threshold: 0.01 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [contextLost]);

  if (contextLost) {
    return <div className="stage-canvas-fallback" data-testid="stage-fallback" />;
  }

  const renderActive = pageVisible && stageVisible;

  return (
    <div
      ref={stageRef}
      className="stage-canvas-shell"
      data-render-active={renderActive}
      data-testid="orbital-stage"
    >
      <Canvas
        camera={{ position: [0, 0, 7.2], fov: 42 }}
        dpr={[1, 1.45]}
        frameloop={renderActive ? "always" : "demand"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#111412"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[4, 5, 6]} intensity={3.2} color="#f5f4ec" />
        <pointLight position={[-4, -2, 3]} intensity={18} color="#e86c51" />
        <pointLight position={[4, 0, 2]} intensity={13} color="#4e9188" />
        <ContextObserver onLost={() => setContextLost(true)} />
        <OrbitalField active={renderActive} />
      </Canvas>
    </div>
  );
}
