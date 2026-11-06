"use client";

import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Points,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  Vector3,
} from "three";
import { lapPosition } from "@/lib/redline";
import { THEMES } from "@/lib/themes";
import { world } from "@/lib/world";
import { type SceneProps, SkyDome, Starfield, useActiveRef, useFontsReady } from "../shared";
import {
  barrierGeometry,
  circuitCenter,
  generateLayout,
  ribbonGeometry,
  skylineGeometry,
  trailGeometry,
} from "./redline/layout";
import {
  barrierFragment,
  barrierVertex,
  beamFragment,
  beamVertex,
  boardFragment,
  boardVertex,
  crowdFragment,
  crowdVertex,
  glowFragment,
  glowVertex,
  groundFragment,
  groundVertex,
  ribbonFragment,
  ribbonVertex,
  skylineFragment,
  skylineVertex,
  structureFragment,
  structureVertex,
  trailFragment,
  trailVertex,
} from "./redline/shaders";
import { createBoardAtlas } from "./redline/textures";
import { createTrackTexture, START_S, trackLength, trackPoint } from "./redline/track";

/*
 * Redline: a night circuit. The page is one lap: the camera starts on the grid,
 * drives the track as the page scrolls and slows down at each section, and
 * finishes back at the line. Cars lap around it as light trails.
 *
 * Kept light: the track, its walls and every building are a few merged meshes,
 * the cars and lights move in the vertex shaders, and the lap is read from a
 * small lookup texture.
 */

const P = THEMES.redline.palette;
/** With reduced motion the scene is a still frame at this moment. */
const STILL_TIME = 4.5;

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/** The camera starts this far behind the start line and ends this far before it. */
const LAP_START = -34;
const LAP_END = -58;
/** Camera height and offset from the center line at each stop of the lap. */
const STOP_HEIGHT = [3.3, 6.8, 4.2];
const STOP_SIDE = [-3.4, 2.4, -1.2];
const LOOK_AHEAD = 36;

const _look = new Vector3();

/** Distance along the track for a lap progress (0..1). */
export function lapDistance(lap: number) {
  const span = trackLength() + LAP_END - LAP_START;
  return START_S + LAP_START + lap * span;
}

export function redlineCamera(scroll: number, time: number, pos: Vector3, look: Vector3) {
  const { lap, segment, t } = lapPosition(scroll);
  const s = lapDistance(lap);
  const height = STOP_HEIGHT[segment] + (STOP_HEIGHT[segment + 1] - STOP_HEIGHT[segment]) * t;
  const side = STOP_SIDE[segment] + (STOP_SIDE[segment + 1] - STOP_SIDE[segment]) * t;
  trackPoint(s, side, height + Math.sin(time * 1.3) * 0.05, pos);
  trackPoint(s + LOOK_AHEAD, side * 0.4, height * 0.42 + 0.6, _look);
  look.copy(_look);
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const linear = (hex: string, intensity = 1) => new Color(hex).multiplyScalar(intensity);

function createUniforms(track: Texture, towerSpacing: number, towerOffset: number) {
  return {
    uTime: { value: 0 },
    uFogColor: { value: new Color(P.fog) },
    uFogDensity: { value: THEMES.redline.fogDensity },
    uRed: { value: linear(P.a) },
    uWarm: { value: linear("#ffe7c2") },
    uTrack: { value: track },
    uTrackLength: { value: trackLength() },
    uTowerSpacing: { value: towerSpacing },
    uTowerOffset: { value: towerOffset },
    uPixelRatio: { value: 1 },
  };
}
type Uniforms = ReturnType<typeof createUniforms>;

function createMaterials(u: Uniforms, atlases: { boards: Texture }) {
  const fog = { uFogColor: u.uFogColor, uFogDensity: u.uFogDensity };
  const additive = {
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  } as const;
  return {
    ground: new ShaderMaterial({
      uniforms: { ...fog, uRed: u.uRed },
      vertexShader: groundVertex,
      fragmentShader: groundFragment,
    }),
    ribbon: new ShaderMaterial({
      uniforms: {
        ...fog,
        uRed: u.uRed,
        uWarm: u.uWarm,
        uTowerSpacing: u.uTowerSpacing,
        uTowerOffset: u.uTowerOffset,
      },
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      // Drawn on top of the ground it lies on
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    barrier: new ShaderMaterial({
      uniforms: { ...fog, uRed: u.uRed },
      vertexShader: barrierVertex,
      fragmentShader: barrierFragment,
      side: DoubleSide,
    }),
    structures: new ShaderMaterial({
      uniforms: { ...fog, uTime: u.uTime },
      vertexShader: structureVertex,
      fragmentShader: structureFragment,
      // The pieces are not all wound the same way: draw both sides, light the one facing us
      side: DoubleSide,
    }),
    boards: new ShaderMaterial({
      uniforms: { ...fog, uTime: u.uTime, uAtlas: { value: atlases.boards } },
      vertexShader: boardVertex,
      fragmentShader: boardFragment,
    }),
    glows: new ShaderMaterial({
      uniforms: { ...fog, uTime: u.uTime },
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      ...additive,
    }),
    beams: new ShaderMaterial({
      uniforms: { ...fog, uWarm: u.uWarm },
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      side: DoubleSide,
      ...additive,
    }),
    crowd: new ShaderMaterial({
      uniforms: { ...fog, uTime: u.uTime, uPixelRatio: u.uPixelRatio },
      vertexShader: crowdVertex,
      fragmentShader: crowdFragment,
      ...additive,
    }),
    skyline: new ShaderMaterial({
      uniforms: { uTime: u.uTime, uHaze: { value: linear(P.fog, 1.4) }, uRed: u.uRed },
      vertexShader: skylineVertex,
      fragmentShader: skylineFragment,
      side: DoubleSide,
    }),
    trails: new ShaderMaterial({
      uniforms: {
        ...fog,
        uTime: u.uTime,
        uTrack: u.uTrack,
        uTrackLength: u.uTrackLength,
        uTail: { value: linear("#ff1f35", 2.6) },
        uHead: { value: linear("#fff3e0", 2.8) },
      },
      vertexShader: trailVertex,
      fragmentShader: trailFragment,
      side: DoubleSide,
      ...additive,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Per-frame updates                                                   */
/* ------------------------------------------------------------------ */

/**
 * Moves time along for the lights and the cars. Every material shares the same
 * uniform objects, so writing them through one material reaches them all.
 */
function Controller({ active, crowdRef }: { active: boolean; crowdRef: RefObject<Points | null> }) {
  const activeRef = useActiveRef(active);
  useFrame((state) => {
    const points = crowdRef.current;
    if (!activeRef.current || !points) return;
    const uniforms = (points.material as ShaderMaterial).uniforms;
    uniforms.uTime.value = world.reducedMotion ? STILL_TIME : state.clock.elapsedTime;
    uniforms.uPixelRatio.value = state.gl.getPixelRatio();
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function useDispose(item: { dispose: () => void }) {
  useEffect(() => () => item.dispose(), [item]);
}

export default function RedlineScene({ active, tier }: SceneProps) {
  const layout = useMemo(() => generateLayout(tier), [tier]);
  useEffect(
    () => () => {
      layout.structures.dispose();
      layout.glows.dispose();
      layout.beams.dispose();
      layout.boards.dispose();
      layout.crowd.dispose();
    },
    [layout],
  );
  const ribbon = useMemo(() => ribbonGeometry(), []);
  useDispose(ribbon);
  const barriers = useMemo(() => barrierGeometry(), []);
  useDispose(barriers);
  const trails = useMemo(() => trailGeometry(tier), [tier]);
  useDispose(trails);
  const skyline = useMemo(() => skylineGeometry(), []);
  useDispose(skyline);
  const plane = useMemo(() => new PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), []);
  useDispose(plane);
  const center = useMemo(() => circuitCenter(), []);
  const track = useMemo(() => createTrackTexture(), []);
  useDispose(track);

  const boards = useMemo(() => createBoardAtlas(), []);
  useFontsReady(boards);

  const uniforms = useMemo(
    () => createUniforms(track, layout.towerSpacing, layout.towerOffset),
    [track, layout],
  );
  const materials = useMemo(
    () => createMaterials(uniforms, { boards: boards.texture }),
    [uniforms, boards],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  const crowdRef = useRef<Points>(null);

  return (
    <group visible={active}>
      <SkyDome zenith={P.sky} horizon={P.fog} glow={P.a} glowStrength={0.32} glowHeight={0.06} />
      <Starfield
        count={tier === "high" ? 420 : 220}
        color="#ffd6dc"
        active={active}
        seed={44}
        minHeight={0.2}
      />
      <Controller active={active} crowdRef={crowdRef} />
      <mesh
        geometry={skyline}
        material={materials.skyline}
        frustumCulled={false}
        renderOrder={-8}
      />
      <mesh
        geometry={plane}
        material={materials.ground}
        position={[center.x, -0.04, center.z]}
        frustumCulled={false}
      />
      <mesh geometry={ribbon} material={materials.ribbon} frustumCulled={false} />
      <mesh geometry={barriers} material={materials.barrier} frustumCulled={false} />
      <mesh geometry={layout.structures} material={materials.structures} frustumCulled={false} />
      <mesh geometry={layout.boards} material={materials.boards} frustumCulled={false} />
      <mesh
        geometry={layout.beams}
        material={materials.beams}
        frustumCulled={false}
        renderOrder={2}
      />
      <points
        ref={crowdRef}
        geometry={layout.crowd}
        material={materials.crowd}
        frustumCulled={false}
        renderOrder={3}
      />
      <mesh geometry={trails} material={materials.trails} frustumCulled={false} renderOrder={4} />
      <mesh
        geometry={layout.glows}
        material={materials.glows}
        frustumCulled={false}
        renderOrder={5}
      />
    </group>
  );
}
