"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import {
  BlendFunction,
  type BloomEffect,
  type ChromaticAberrationEffect,
  ToneMappingMode,
} from "postprocessing";
import { Euler, type PerspectiveCamera, Quaternion, Vector2, Vector3 } from "three";
import { CAR_POSITION, cabinCamera, carMotion } from "@/lib/car/cabin";
import { drive, viewAmount } from "@/lib/drive";
import { onScrollProgress } from "@/lib/scroll";
import { THEMES, type ThemeId } from "@/lib/themes";
import {
  detectQualityTier,
  markWorldReady,
  onBooted,
  type QualityTier,
  travelEnvelope,
  world,
} from "@/lib/world";
import CityScene, { cityCamera } from "./scenes/CityScene";
import DesertScene, { desertCamera } from "./scenes/DesertScene";
import OceanScene, { oceanCamera } from "./scenes/OceanScene";
import UnderworksScene, { underworksCamera } from "./scenes/UnderworksScene";

const CAMERA_PATHS = {
  city: cityCamera,
  desert: desertCamera,
  ocean: oceanCamera,
  underworks: underworksCamera,
} satisfies Record<ThemeId, unknown>;

const BASE_FOV = 55;
const NEAR = 0.5;
/** Inside the car the dashboard is a few centimeters away. */
const CABIN_NEAR = 0.05;

/** Moves the camera along the active district's path, with pointer parallax and the travel warp. */
function CameraRig({ theme }: { theme: ThemeId }) {
  const rig = useRef({
    pos: new Vector3(),
    look: new Vector3(),
    lookNow: new Vector3(),
    theme: null as ThemeId | null,
    parallaxX: 0,
    parallaxY: 0,
    // Riding in the car
    headX: 0,
    headY: 0,
    motion: { y: 0, pitch: 0, roll: 0 },
    carEuler: new Euler(),
    carQuat: new Quaternion(),
    localPos: new Vector3(),
    localQuat: new Quaternion(),
  });

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const r = rig.current;

    if (drive.inside && theme === "desert") {
      // First person, in the driver's seat: the car's body moves, the head follows the pointer
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 3);
      const free = world.reducedMotion ? 0 : 1;
      r.headX += (world.pointerX * free - r.headX) * k;
      r.headY += (world.pointerY * free - r.headY) * k;
      const now = performance.now();
      const m = carMotion(state.clock.elapsedTime, world.reducedMotion, r.motion);
      const fov = cabinCamera(
        viewAmount(now),
        camera.aspect,
        r.headX,
        r.headY,
        state.clock.elapsedTime,
        world.reducedMotion,
        r.localPos,
        r.localQuat,
      );
      r.carQuat.setFromEuler(r.carEuler.set(m.pitch, 0, m.roll));
      camera.position.copy(r.localPos).applyQuaternion(r.carQuat).add(CAR_POSITION);
      camera.position.y += m.y;
      camera.quaternion.copy(r.carQuat).multiply(r.localQuat);
      camera.fov = fov + travelEnvelope(now) * 24;
      camera.near = CABIN_NEAR;
      camera.updateProjectionMatrix();
      // Coming back out, jump straight onto the district's path
      r.theme = null;
      return;
    }
    if (camera.near !== NEAR) {
      camera.near = NEAR;
      camera.updateProjectionMatrix();
    }

    const time = world.reducedMotion ? 0 : state.clock.elapsedTime;
    CAMERA_PATHS[theme](world.scroll, time, r.pos, r.look);

    // Smoothed pointer parallax
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2.5);
    const strength = world.reducedMotion ? 0 : 1;
    r.parallaxX += (world.pointerX * 1.6 * strength - r.parallaxX) * k;
    r.parallaxY += (world.pointerY * 0.8 * strength - r.parallaxY) * k;
    r.pos.x += r.parallaxX;
    r.pos.y += r.parallaxY;
    r.look.x += r.parallaxX * 3;

    if (r.theme !== theme || world.reducedMotion) {
      // New district (or reduced motion): jump straight to the camera path
      camera.position.copy(r.pos);
      r.lookNow.copy(r.look);
      r.theme = theme;
    } else {
      const follow = 1 - Math.exp(-Math.min(delta, 0.1) * 3.5);
      camera.position.lerp(r.pos, follow);
      r.lookNow.lerp(r.look, follow);
    }
    camera.lookAt(r.lookNow);

    const fov = BASE_FOV + travelEnvelope(performance.now()) * 32;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** Post-processing: bloom makes the neon glow; the rest adds a camera-lens feel. */
function Effects({ theme, tier }: { theme: ThemeId; tier: QualityTier }) {
  const aberrationRef = useRef<ChromaticAberrationEffect>(null);
  const bloomRef = useRef<BloomEffect>(null);
  const offset = useMemo(() => new Vector2(0.0006, 0.0004), []);

  useFrame(() => {
    const effect = aberrationRef.current;
    if (effect) {
      const warp = travelEnvelope(performance.now());
      effect.offset.set(0.0006 + warp * 0.014, 0.0004 + warp * 0.007);
    }
    // The neon glow pulses with the bass of the background music
    const bloom = bloomRef.current;
    const pulse = world.reducedMotion ? 0 : world.audioLevel;
    if (bloom) bloom.intensity = THEMES[theme].bloom * (1 + pulse * 0.4);
  });

  return (
    <EffectComposer multisampling={tier === "high" ? 2 : 0} stencilBuffer={false}>
      <Bloom
        ref={bloomRef}
        mipmapBlur
        luminanceThreshold={0.82}
        luminanceSmoothing={0.22}
        intensity={THEMES[theme].bloom}
        radius={0.8}
        levels={tier === "high" ? 8 : 6}
      />
      <ChromaticAberration
        ref={aberrationRef}
        offset={offset}
        radialModulation
        modulationOffset={0.2}
      />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.2} darkness={0.78} />
      <Noise opacity={0.018} blendFunction={BlendFunction.SCREEN} />
    </EffectComposer>
  );
}

/** Compiles every shader up front (during the boot screen) so travelling never stutters. */
function Warmup() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) markWorldReady();
        }),
      );
    };
    gl.compileAsync(scene, camera).then(finish, finish);
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);

  return null;
}

/** With reduced motion the scene only redraws when the page scrolls. */
function RedrawOnScroll() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => onScrollProgress(() => invalidate()), [invalidate]);
  return null;
}

/** Writes the pointer position into the shared store. */
function usePointerTracking() {
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      world.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      world.pointerY = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
}

export default function World({ theme }: { theme: ThemeId }) {
  const [tier] = useState<QualityTier>(() => detectQualityTier());
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const maxDpr = tier === "high" ? 1.5 : 1.2;
  const minDpr = tier === "high" ? 1 : 0.75;
  const [dpr, setDpr] = useState(maxDpr);
  // Only judge performance once the intro is over (shader compiling and
  // background tabs report fake low frame rates that would blur the scene).
  const [monitoring, setMonitoring] = useState(false);
  useEffect(() => onBooted(() => setMonitoring(true)), []);
  const palette = THEMES[theme].palette;
  usePointerTracking();

  return (
    <Canvas
      dpr={dpr}
      frameloop={reducedMotion ? "demand" : "always"}
      flat
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" }}
      camera={{ fov: BASE_FOV, near: NEAR, far: 1400, position: [0, 4, 20] }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <color attach="background" args={[palette.sky]} />
      <fogExp2 key={theme} attach="fog" args={[palette.fog, THEMES[theme].fogDensity]} />
      {monitoring && (
        <PerformanceMonitor
          onDecline={() => {
            if (document.visibilityState !== "visible") return;
            setDpr((value) => Math.max(minDpr, +(value - 0.25).toFixed(2)));
          }}
          onIncline={() => setDpr((value) => Math.min(maxDpr, +(value + 0.15).toFixed(2)))}
          flipflops={4}
        />
      )}
      <CityScene active={theme === "city"} tier={tier} />
      <DesertScene active={theme === "desert"} tier={tier} />
      <OceanScene active={theme === "ocean"} tier={tier} />
      <UnderworksScene active={theme === "underworks"} tier={tier} />
      <CameraRig theme={theme} />
      <Effects theme={theme} tier={tier} />
      <Warmup />
      {reducedMotion && <RedrawOnScroll />}
    </Canvas>
  );
}
