"use client";

import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  Vector3,
} from "three";
import { engine, lapPosition, MAX_RPM, REDLINE_RPM } from "@/lib/redline";
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
  tachFragment,
  tachVertex,
  trailFragment,
  trailVertex,
} from "./redline/shaders";
import { createBoardAtlas, createDialAtlas, createGearAtlas } from "./redline/textures";
import { createTrackTexture, START_S, trackLength, trackPoint } from "./redline/track";

/*
 * Redline: a night circuit. The page is one lap: the camera starts on the grid,
 * drives the track as the page scrolls and slows down at each section, and
 * finishes back at the line. Cars lap around it as light trails, and a
 * holographic tachometer hangs over the horizon. Scrolling is the throttle.
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
const STOP_HEIGHT = [3.3, 6.2, 8.5, 5.4, 4.2];
const STOP_SIDE = [-3.4, 2.6, -3, 2.4, -1.2];
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

function createMaterials(u: Uniforms, atlases: { boards: Texture; dial: Texture; gears: Texture }) {
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
    tach: new ShaderMaterial({
      uniforms: {
        uTime: u.uTime,
        uPixelRatio: u.uPixelRatio,
        uDial: { value: atlases.dial },
        uGears: { value: atlases.gears },
        uRpm: { value: engine.rpm / MAX_RPM },
        uGear: { value: 0 },
        uLimiter: { value: 0 },
        uOpacity: { value: 1 },
        uInk: { value: linear("#ffd9de", 0.9) },
        uRed: { value: linear(P.a, 1.6) },
        uAmber: { value: linear(P.b, 1.3) },
        uGreen: { value: linear(P.signal, 1.2) },
      },
      vertexShader: tachVertex,
      fragmentShader: tachFragment,
      ...additive,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* The engine: scrolling revs it, it shifts on its own                  */
/* ------------------------------------------------------------------ */

/** Camera speed (units per second) at the redline in each gear (index 0 is neutral). */
const TOP_SPEED = [0, 55, 95, 140, 190, 250, 320];
const IDLE = 900;
/** Camera units per second to km/h on the readout. */
const KMH = 0.85;

type Engine = {
  speed: number;
  rpm: number;
  gear: number;
  shiftTimer: number;
  idleTime: number;
  nextBlip: number;
  blip: number;
  lastPos: Vector3;
  tracking: boolean;
};

function stepEngine(sim: Engine, cameraPosition: Vector3, time: number, dt: number) {
  const moved = sim.tracking ? cameraPosition.distanceTo(sim.lastPos) : 0;
  sim.lastPos.copy(cameraPosition);
  sim.tracking = true;
  // A jump (arriving from another district) is not speed
  const raw = dt > 0 && moved < 60 ? moved / dt : 0;
  sim.speed += (Math.min(raw, 420) - sim.speed) * (1 - Math.exp(-dt * 4));
  const v = sim.speed;
  let target: number;
  let limiter = false;
  if (v < 3) {
    sim.gear = 0;
    sim.idleTime += dt;
    // Now and then, a blip of the throttle in neutral
    if (sim.idleTime > sim.nextBlip) {
      sim.blip = 1;
      sim.idleTime = 0;
      sim.nextBlip = 6 + Math.random() * 6;
    }
    sim.blip *= Math.exp(-dt * 2.4);
    target = IDLE + Math.sin(time * 7.3) * 14 + sim.blip * 3800;
  } else {
    sim.idleTime = 0;
    if (sim.gear === 0) sim.gear = 1;
    let rpm = (v / TOP_SPEED[sim.gear]) * REDLINE_RPM;
    while (rpm < 2600 && sim.gear > 1) {
      sim.gear--;
      rpm = (v / TOP_SPEED[sim.gear]) * REDLINE_RPM;
    }
    if (rpm >= REDLINE_RPM) {
      // Bounce off the limiter for a moment, then grab the next gear
      limiter = true;
      if (sim.gear < 6) {
        sim.shiftTimer += dt;
        if (sim.shiftTimer > 0.16) {
          sim.gear++;
          sim.shiftTimer = 0;
        }
      }
      target = REDLINE_RPM - Math.abs(Math.sin(time * 38)) * 380;
    } else {
      sim.shiftTimer = 0;
      target = Math.max(1300, rpm);
    }
  }
  sim.rpm += (target - sim.rpm) * (1 - Math.exp(-dt * (target > sim.rpm ? 14 : 7)));
  engine.rpm = sim.rpm;
  engine.gear = sim.gear;
  engine.speed = v * KMH;
  engine.limiter = limiter;
}

/* ------------------------------------------------------------------ */
/* Per-frame updates                                                   */
/* ------------------------------------------------------------------ */

const _dir = new Vector3();
const _right = new Vector3();
const _tachAt = new Vector3();

/**
 * Moves the engine and the tachometer. Every material shares the same uniform
 * objects, so writing them through the tachometer's material reaches them all.
 */
function Controller({ active, tachRef }: { active: boolean; tachRef: RefObject<Mesh | null> }) {
  const activeRef = useActiveRef(active);
  const sim = useRef<Engine>({
    speed: 0,
    rpm: IDLE,
    gear: 0,
    shiftTimer: 0,
    idleTime: 0,
    nextBlip: 3,
    blip: 0,
    lastPos: new Vector3(),
    tracking: false,
  });
  const heading = useRef(new Vector3(1, 0, 0));
  const pitch = useRef(0);

  useFrame((state, delta) => {
    const mesh = tachRef.current;
    if (!activeRef.current || !mesh) {
      sim.current.tracking = false;
      return;
    }
    const tach = (mesh.material as ShaderMaterial).uniforms;
    const dt = Math.min(delta, 0.1);
    const time = world.reducedMotion ? STILL_TIME : state.clock.elapsedTime;
    tach.uTime.value = time;
    tach.uPixelRatio.value = state.gl.getPixelRatio();
    const camera = state.camera;
    if (world.reducedMotion) {
      engine.rpm = IDLE;
      engine.gear = 0;
      engine.speed = 0;
      engine.limiter = false;
    } else {
      stepEngine(sim.current, camera.position, time, dt);
    }
    tach.uRpm.value = engine.rpm / MAX_RPM;
    tach.uGear.value = engine.gear;
    tach.uLimiter.value = engine.limiter ? 1 : 0;

    // The tachometer hangs over the horizon ahead, a little to the right, like a moon
    {
      camera.getWorldDirection(_dir);
      // Keep it at the same height on screen however much the camera looks down
      pitch.current +=
        (Math.asin(Math.max(-1, Math.min(1, _dir.y))) - pitch.current) * (1 - Math.exp(-dt * 2.2));
      _dir.y = 0;
      if (_dir.lengthSq() > 1e-6) {
        _dir.normalize();
        heading.current.lerp(_dir, 1 - Math.exp(-dt * 2.2));
        if (heading.current.lengthSq() < 1e-6) heading.current.copy(_dir);
        heading.current.normalize();
      }
      const h = heading.current;
      const fov = "fov" in camera ? (camera.fov as number) : 55;
      const aspect = state.size.width / Math.max(1, state.size.height);
      const halfWide = Math.atan(Math.tan(((fov / 2) * Math.PI) / 180) * aspect);
      const yaw = Math.min((20 * Math.PI) / 180, halfWide * 0.55);
      _right.set(-h.z, 0, h.x);
      _tachAt
        .copy(camera.position)
        .addScaledVector(h, Math.cos(yaw) * 620)
        .addScaledVector(_right, Math.sin(yaw) * 620);
      _tachAt.y = camera.position.y + 620 * Math.tan(pitch.current + (15.5 * Math.PI) / 180);
      mesh.position.copy(_tachAt);
      mesh.lookAt(camera.position);
      mesh.scale.setScalar(Math.min(175, 125 + aspect * 30));
    }
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
  const tachPlane = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(tachPlane);
  const center = useMemo(() => circuitCenter(), []);
  const track = useMemo(() => createTrackTexture(), []);
  useDispose(track);

  const boards = useMemo(() => createBoardAtlas(), []);
  useFontsReady(boards);
  const dial = useMemo(() => createDialAtlas(), []);
  useFontsReady(dial);
  const gears = useMemo(() => createGearAtlas(), []);
  useFontsReady(gears);

  const uniforms = useMemo(
    () => createUniforms(track, layout.towerSpacing, layout.towerOffset),
    [track, layout],
  );
  const materials = useMemo(
    () =>
      createMaterials(uniforms, {
        boards: boards.texture,
        dial: dial.texture,
        gears: gears.texture,
      }),
    [uniforms, boards, dial, gears],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  const tachRef = useRef<Mesh>(null);

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
      <Controller active={active} tachRef={tachRef} />
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
        ref={tachRef}
        geometry={tachPlane}
        material={materials.tach}
        frustumCulled={false}
        renderOrder={1}
      />
      <mesh
        geometry={layout.beams}
        material={materials.beams}
        frustumCulled={false}
        renderOrder={2}
      />
      <points
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
