"use client";

import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  EdgesGeometry,
  type Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  type LineSegments,
  type Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  type ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  Vector4,
} from "three";
import { createRandom } from "@/lib/random";
import { THEMES } from "@/lib/themes";
import { world } from "@/lib/world";
import { fogGLSL, hashGLSL, outputGLSL, simplexGLSL } from "../glsl";
import {
  type CanvasAtlas,
  cssFontFamily,
  makeTexture,
  type SceneProps,
  useActiveRef,
  useFontsReady,
} from "../shared";

/*
 * The Underworks: a half-built, half-abandoned hall under the Megacity.
 * Concrete pillars, scaffolding, failing neon, welding sparks and holographic
 * blueprints of projects that are still being built. At the far end, a
 * tunnel boring machine glows red behind a "NO ENTRY" sign.
 *
 * Lighting is done by hand: every lamp, sign and spark is an "emitter", and
 * each frame the closest ones are sent to the shaders, so a sign that flickers
 * also flickers the pillar next to it and its reflection in the puddles.
 */

const THEME = THEMES.underworks;
const P = THEME.palette;
type Tier = SceneProps["tier"];

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const HALL_X = 34; // side walls
const CEILING = 20;
const ROW_STEP = 16;
const FIRST_ROW = -6;
const ROWS = 22;
const COLUMNS_X = [-25, -9, 9, 25];
const PILLAR = 2.8;
const PORTAL_Z = -352;
const TUNNEL_R = 10;
const TUNNEL_Y = 10;
const TBM_Z = -428;
const MAX_LIGHTS = 24;

const lightCount = (tier: Tier) => (tier === "high" ? 24 : 12);

const SODIUM = new Color("#ffb06a");
const AMBER = new Color(P.a);
const RED = new Color(P.b);
const CYAN = new Color(P.signal);
const EXIT_GREEN = new Color("#3dff86");
const COLD = new Color("#7d9cff");
const ARC = new Color("#c4dbff");
const PAINT = new Color("#c98a12");
const WALL_TUBE_LOW = new Color("#ff9d1f");
const WALL_TUBE_HIGH = new Color("#d6e6ff");

/** Where the camera sits for a given page scroll (0..1): down the central aisle, deeper as you scroll. */
export function underworksCamera(scroll: number, time: number, pos: Vector3, look: Vector3) {
  const z = 26 - scroll * 344;
  const weave = Math.sin(scroll * Math.PI * 1.4) * 2.2;
  pos.set(
    weave + Math.sin(time * 0.31) * 0.1,
    3.3 - scroll * 0.6 + Math.sin(time * 0.53) * 0.05,
    z,
  );
  look.set(
    weave * 0.35 - Math.sin(scroll * Math.PI) * 2,
    4.8 + Math.sin(time * 0.21) * 0.1,
    z - 70,
  );
}

/* ------------------------------------------------------------------ */
/* Flicker                                                             */
/* ------------------------------------------------------------------ */

type Profile = "steady" | "buzz" | "stutter" | "failing" | "dying";

function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

function noise1(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/**
 * How bright a failing light is at time t (0..1). Flicker rates stay at or
 * under about three changes per second, to keep the effect safe to look at.
 */
function flicker(profile: Profile, seed: number, t: number): number {
  switch (profile) {
    case "steady":
      return hash(Math.floor(t * 4) + seed * 977) < 0.012 ? 0.35 : 1;
    case "buzz": {
      const hum = 0.9 + 0.1 * noise1(t * 7 + seed * 50);
      return hash(Math.floor(t * 5) + seed * 131) < 0.04 ? hum * 0.4 : hum;
    }
    case "stutter": {
      const cycle = 5 + hash(seed * 7) * 6;
      const local = (t + seed * 37) % cycle;
      if (local < cycle - 1.4) return 1;
      return hash(Math.floor(t * 6) + seed * 71) < 0.5 ? 0.06 : 1;
    }
    case "failing":
      if (hash(Math.floor(t * 1.5) + seed * 53) > 0.42) return 0.04;
      return hash(Math.floor(t * 6) + seed * 17) < 0.3 ? 0.3 : 1;
    case "dying":
      return hash(Math.floor(t * 2) + seed * 29) < 0.09 ? 0.75 : 0.03;
  }
}

/** Mains power: every so often the whole level browns out for a second. */
const SURGE_PERIOD = 19;
function mainsPower(t: number): number {
  const k = Math.floor(t / SURGE_PERIOD);
  const start = k * SURGE_PERIOD + 7 + hash(k * 3.17) * 8;
  const length = 1.2 + hash(k * 5.71) * 0.9;
  const x = t - start;
  if (x < 0 || x > length) return 1;
  const fall = Math.min(1, x / 0.15);
  const rise = Math.min(1, (length - x) / 0.4);
  const level = 1 - 0.75 * Math.min(fall, rise);
  return hash(Math.floor(x * 5) + k * 13.3) < 0.3 ? Math.min(1, level + 0.45) : level;
}

/** Holographic builds: assemble, hold, collapse, wait. Never quite finished. */
const BUILD_CYCLE = 18;
function buildState(t: number, phase: number): [number, number] {
  const x = ((((t / BUILD_CYCLE + phase) % 1) + 1) % 1) * BUILD_CYCLE;
  if (x < 11) {
    const k = x / 11;
    return [k * k * (3 - 2 * k), 1];
  }
  if (x < 14.5) return [1, 1];
  if (x < 15.4) return [1 - (x - 14.5) / 0.9, 0.7 + 0.3 * hash(Math.floor(x * 9))];
  return [0, 1];
}

/* ------------------------------------------------------------------ */
/* Procedural layout                                                   */
/* ------------------------------------------------------------------ */

type Pillar = { x: number; z: number; h: number; seed: number; hazard: boolean };
type SignDef = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  rotY: number;
  rect: [number, number, number, number];
  color: Color;
  seed: number;
  broken: number;
  profile: Profile;
  hanging: boolean;
};
type TubeDef = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: Color;
  seed: number;
  profile: Profile;
  base: number;
};
type LampDef = { x: number; z: number; profile: Profile; seed: number; swing: number };
type WelderDef = {
  x: number;
  y: number;
  z: number;
  period: number;
  phase: number;
  duty: number;
  seed: number;
};
type BeaconDef = { x: number; y: number; z: number; speed: number; phase: number };
type StationDef = { kind: "tower" | "dome" | "gear"; x: number; z: number; phase: number };
type BoxDef = { x: number; y: number; z: number; sx: number; sy: number; sz: number; seed: number };
type Member = { a: Vector3; b: Vector3; thick: number; plank: boolean };
type TapeDef = { a: Vector3; b: Vector3; seed: number };
type DripDef = { x: number; z: number; period: number; phase: number };
type EmitterKind = "lamp" | "sign" | "tube" | "beacon" | "arc" | "hub" | "holo" | "shaft" | "flood";
type Emitter = {
  kind: EmitterKind;
  ref: number;
  light: Vector3;
  glow: Vector3;
  color: Color;
  strength: number;
  radius: number;
  size: number;
};

type Layout = ReturnType<typeof generateLayout>;

const vRect = (i: number): [number, number, number, number] => [i / 8, 0.5, 1 / 8, 0.5];
const hRect = (i: number): [number, number, number, number] => [
  (i % 2) * 0.5,
  (3 - Math.floor(i / 2)) * 0.125,
  0.5,
  0.125,
];

const rowZ = (r: number) => FIRST_ROW - r * ROW_STEP;
const UNFINISHED: Record<string, number> = {
  "9:-54": 10,
  "-9:-230": 12,
  "-25:-150": 8,
  "25:-262": 13,
};

function addScaffold(
  list: Member[],
  x0: number,
  z0: number,
  nx: number,
  nz: number,
  levels: number,
  lift: number,
  bay = 2,
) {
  const tube = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    thick = 0.07,
  ) => list.push({ a: new Vector3(ax, ay, az), b: new Vector3(bx, by, bz), thick, plank: false });
  const height = levels * lift;
  // Standards: only around the outside, the middle is left open for the pillar or wall
  for (let i = 0; i <= nx; i++) {
    for (let k = 0; k <= nz; k++) {
      if (i > 0 && i < nx && k > 0 && k < nz) continue;
      const x = x0 + i * bay;
      const z = z0 + k * bay;
      tube(x, 0, z, x, height + 0.9, z);
    }
  }
  for (let l = 1; l <= levels; l++) {
    const y = l * lift;
    // Ledgers and guard rails along the outside
    for (const yy of [y, y + 0.9]) {
      for (let i = 0; i < nx; i++) {
        tube(x0 + i * bay, yy, z0, x0 + (i + 1) * bay, yy, z0);
        tube(x0 + i * bay, yy, z0 + nz * bay, x0 + (i + 1) * bay, yy, z0 + nz * bay);
      }
      for (let k = 0; k < nz; k++) {
        tube(x0, yy, z0 + k * bay, x0, yy, z0 + (k + 1) * bay);
        tube(x0 + nx * bay, yy, z0 + k * bay, x0 + nx * bay, yy, z0 + (k + 1) * bay);
      }
    }
    // Diagonal braces, zigzagging up the long faces
    const flip = l % 2 === 0;
    for (let k = 0; k < nz; k += 2) {
      const za = z0 + k * bay;
      const zb = z0 + (k + 1) * bay;
      tube(x0, y - lift, flip ? za : zb, x0, y, flip ? zb : za, 0.05);
      tube(x0 + nx * bay, y - lift, flip ? zb : za, x0 + nx * bay, y, flip ? za : zb, 0.05);
    }
    for (let i = 0; i < nx; i += 2) {
      const xa = x0 + i * bay;
      const xb = x0 + (i + 1) * bay;
      tube(flip ? xa : xb, y - lift, z0, flip ? xb : xa, y, z0, 0.05);
    }
    // Plank decks on every other level, as a ring around the middle
    if (l % 2 === 0 || l === levels) {
      const plank = (ax: number, az: number, bx: number, bz: number) =>
        list.push({
          a: new Vector3(ax, y + 0.03, az),
          b: new Vector3(bx, y + 0.03, bz),
          thick: 0,
          plank: true,
        });
      for (let i = 0; i < nx; i++) {
        plank(x0 + i * bay + 0.1, z0 + 0.45, x0 + (i + 1) * bay - 0.1, z0 + 0.45);
        plank(
          x0 + i * bay + 0.1,
          z0 + nz * bay - 0.45,
          x0 + (i + 1) * bay - 0.1,
          z0 + nz * bay - 0.45,
        );
      }
      for (let k = 1; k < nz - 1; k++) {
        plank(x0 + 0.45, z0 + k * bay + 0.1, x0 + 0.45, z0 + (k + 1) * bay - 0.1);
        plank(
          x0 + nx * bay - 0.45,
          z0 + k * bay + 0.1,
          x0 + nx * bay - 0.45,
          z0 + (k + 1) * bay - 0.1,
        );
      }
    }
  }
}

function generateLayout(tier: Tier) {
  const rnd = createRandom(4040);
  const high = tier === "high";

  // Pillars, some of them never finished
  const pillars: Pillar[] = [];
  for (let r = 0; r < ROWS; r++) {
    const z = rowZ(r);
    for (const x of COLUMNS_X) {
      const h = UNFINISHED[`${x}:${z}`] ?? CEILING;
      pillars.push({ x, z, h, seed: rnd.next(), hazard: h < CEILING || rnd.chance(0.45) });
    }
  }

  const beams: BoxDef[] = [];
  for (let r = 0; r < ROWS; r++) {
    beams.push({
      x: 0,
      y: CEILING - 0.65,
      z: rowZ(r),
      sx: HALL_X * 2,
      sy: 1.3,
      sz: 1.2,
      seed: rnd.next(),
    });
  }

  // Holographic builds standing in the side bays
  const stations: StationDef[] = [
    { kind: "tower", x: 17, z: -16, phase: 0.05 },
    { kind: "dome", x: -17, z: -110, phase: 0.42 },
    { kind: "gear", x: 17, z: -190, phase: 0.74 },
  ];

  // Concrete road barriers: around each build, and a wall of them before the tunnel
  const barriers: BoxDef[] = [];
  const barrier = (x: number, z: number, along: "x" | "z") =>
    barriers.push({
      x,
      y: 0.45,
      z,
      sx: along === "x" ? 2.9 : 0.6,
      sy: 0.9,
      sz: along === "x" ? 0.6 : 2.9,
      seed: rnd.next(),
    });
  for (const s of stations) {
    const toAisle = Math.sign(-s.x);
    for (const dz of [-3, 0, 3]) barrier(s.x + toAisle * 4.6, s.z + dz, "z");
    for (const dx of [-3, 0, 3]) {
      barrier(s.x + dx, s.z - 4.6, "x");
      if (dx !== 0) barrier(s.x + dx, s.z + 4.6, "x");
    }
  }
  for (let x = -31.5; x <= 31.5; x += 3) {
    if (Math.abs(x) < 1) continue;
    barrier(x, -337.6, "x");
  }

  // Signs: hanging over the aisle, blades on the pillars, a few on the walls
  const signs: SignDef[] = [];
  const hanging = (
    i: number,
    x: number,
    y: number,
    z: number,
    w: number,
    color: Color,
    profile: Profile,
    broken: number,
  ) =>
    signs.push({
      x,
      y,
      z,
      w,
      h: w / 4,
      rotY: 0,
      rect: hRect(i),
      color,
      seed: rnd.next(),
      broken,
      profile,
      hanging: true,
    });
  const wall = (
    i: number,
    x: number,
    y: number,
    z: number,
    w: number,
    rotY: number,
    color: Color,
    profile: Profile,
    broken: number,
  ) =>
    signs.push({
      x,
      y,
      z,
      w,
      h: w / 4,
      rotY,
      rect: hRect(i),
      color,
      seed: rnd.next(),
      broken,
      profile,
      hanging: false,
    });
  const blade = (
    i: number,
    side: number,
    y: number,
    z: number,
    h: number,
    color: Color,
    profile: Profile,
    broken: number,
  ) =>
    signs.push({
      x: side * (9 - PILLAR / 2 - h / 8 - 0.04),
      y,
      z,
      w: h / 4,
      h,
      rotY: 0,
      rect: vRect(i),
      color,
      seed: rnd.next(),
      broken,
      profile,
      hanging: false,
    });
  // Horizontal atlas: 0 UNDER CONSTRUCTION, 1 AUTHORIZED ONLY, 2 WORK IN PROGRESS, 3 DANGER,
  // 4 SECTOR B-04, 5 NO ENTRY, 6 BUILD 0.4.2, 7 COMPILING...
  hanging(0, 0, 12.6, -14, 11, AMBER, "stutter", 0.16);
  hanging(7, 17, 12.2, -16, 8, CYAN, "buzz", 0.08);
  hanging(6, -17, 12.4, -110, 8, CYAN, "steady", 0.1);
  hanging(4, -2.5, 13, -126, 8.5, AMBER, "failing", 0.3);
  hanging(2, 17, 12.2, -190, 9, AMBER, "stutter", 0.2);
  hanging(1, 3, 12.8, -208, 9, RED, "steady", 0.12);
  hanging(5, 0, 12.2, -300, 7.5, RED, "buzz", 0);
  wall(3, -HALL_X + 0.2, 7.5, -44, 7, Math.PI / 2, RED, "dying", 0.25);
  wall(2, HALL_X - 0.2, 9, -150, 9, -Math.PI / 2, AMBER, "failing", 0.2);
  wall(3, 17, 8, PORTAL_Z + 0.25, 8, 0, RED, "failing", 0.2);
  // Vertical atlas: 0 B4, 1 WIP, 2 404, 3 DEV, 4 BETA, 5 EXIT, 6 ALPHA, 7 ERR
  blade(2, 1, 7, -22, 6.4, RED, "failing", 0.2);
  blade(0, -1, 8, -38, 5.6, AMBER, "steady", 0);
  blade(5, 1, 6, -86, 6, EXIT_GREEN, "dying", 0);
  blade(1, -1, 7, -150, 6, AMBER, "stutter", 0.3);
  blade(3, 1, 8, -182, 6, CYAN, "buzz", 0);
  blade(7, -1, 6.5, -246, 6, RED, "failing", 0);
  blade(4, 1, 7.5, -278, 6.4, AMBER, "stutter", 0.1);
  blade(6, -1, 8, -310, 7, CYAN, "steady", 0.15);

  // Neon tubes: vertical ones on the aisle pillars (these light their surroundings),
  // long runs along both walls and short lamps inside the tunnel
  const tubes: TubeDef[] = [];
  const tubeColors = [AMBER, RED, AMBER, CYAN];
  const tubeProfiles: Profile[] = [
    "buzz",
    "stutter",
    "steady",
    "failing",
    "buzz",
    "dying",
    "steady",
  ];
  const pillarTubeZ = [-6, -70, -102, -134, -166, -214, -246, -294, -326];
  pillarTubeZ.forEach((z, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    tubes.push({
      x: side * (9 - PILLAR / 2 - 0.06),
      y: 5.2,
      z: z + PILLAR / 2 + 0.06,
      sx: 0.09,
      sy: 8,
      sz: 0.09,
      color: tubeColors[i % tubeColors.length],
      seed: rnd.next(),
      profile: tubeProfiles[i % tubeProfiles.length],
      base: 1,
    });
  });
  const wallProfile = (): Profile => {
    const r = rnd.next();
    return r < 0.26
      ? "dying"
      : r < 0.36
        ? "failing"
        : r < 0.44
          ? "stutter"
          : r < 0.7
            ? "buzz"
            : "steady";
  };
  for (const side of [-1, 1]) {
    for (let z = 30; z > PORTAL_Z + 6; z -= 8) {
      tubes.push({
        x: side * (HALL_X - 0.12),
        y: 4.4,
        z: z - 4,
        sx: 0.09,
        sy: 0.09,
        sz: 7.2,
        color: WALL_TUBE_LOW,
        seed: rnd.next(),
        profile: wallProfile(),
        base: 0.75,
      });
      if (high || rnd.chance(0.5)) {
        tubes.push({
          x: side * (HALL_X - 0.12),
          y: 14.5,
          z: z - 4,
          sx: 0.09,
          sy: 0.09,
          sz: 7.2,
          color: WALL_TUBE_HIGH,
          seed: rnd.next(),
          profile: wallProfile(),
          base: 0.4,
        });
      }
    }
  }
  const tunnelTubesStart = tubes.length;
  for (let z = PORTAL_Z - 6; z > TBM_Z + 3; z -= 6) {
    for (const side of [-1, 1]) {
      const angle = side * 1.2;
      tubes.push({
        x: Math.sin(angle) * (TUNNEL_R - 0.25),
        y: TUNNEL_Y + Math.cos(angle) * (TUNNEL_R - 0.25),
        z,
        sx: 0.14,
        sy: 0.14,
        sz: 1.6,
        color: AMBER,
        seed: rnd.next(),
        profile: rnd.chance(0.3) ? "failing" : "buzz",
        base: 0.9,
      });
    }
  }

  // Hanging work lamps; one of them swings on its cable
  const lamps: LampDef[] = [
    [-3, -2, "buzz", 0],
    [3.5, -30, "steady", 0],
    [-2, -64, "stutter", 0],
    [2.5, -96, "buzz", 1],
    [-3, -128, "dying", 0],
    [2, -160, "steady", 0],
    [-2.5, -192, "failing", 0],
    [3, -224, "buzz", 0],
    [-2, -258, "stutter", 0],
    [2.5, -290, "steady", 0],
    [0, -322, "buzz", 0],
    [17, -60, "steady", 0],
    [-17, -84, "buzz", 0],
    [17, -170, "stutter", 0],
    [-17, -250, "steady", 0],
  ].map(([x, z, profile, swing]) => ({
    x: x as number,
    z: z as number,
    profile: profile as Profile,
    seed: rnd.next(),
    swing: swing as number,
  }));

  const welders: WelderDef[] = [
    { x: 8.3, y: 10.9, z: -52.4, period: 7, phase: 0, duty: 0.62, seed: rnd.next() },
    { x: 29.8, y: 10.7, z: -146, period: 9, phase: 0.35, duty: 0.5, seed: rnd.next() },
    { x: -8.3, y: 12.9, z: -228.4, period: 8, phase: 0.6, duty: 0.55, seed: rnd.next() },
    { x: 24.2, y: 13.8, z: -260.5, period: 6.5, phase: 0.15, duty: 0.6, seed: rnd.next() },
  ];

  const beacons: BeaconDef[] = [
    { x: 12.4, y: 0.9, z: -20.6, speed: 2.4, phase: 0 },
    { x: -12.4, y: 0.9, z: -105.4, speed: -2.1, phase: 1.3 },
    { x: -11.8, y: 0.9, z: -337.6, speed: 2.6, phase: 2.1 },
    { x: 11.8, y: 0.9, z: -337.6, speed: -2.3, phase: 0.6 },
  ];

  const shafts = [
    { x: -6, z: -98 },
    { x: 8, z: -236 },
  ];

  // Work floodlights on stands, pointed at the tunnel mouth
  const floods = [
    { x: -13.5, y: 5.6, z: -344, seed: rnd.next(), profile: "buzz" as Profile },
    { x: 13.5, y: 5.6, z: -344, seed: rnd.next(), profile: "stutter" as Profile },
  ];

  const drips: DripDef[] = [
    [2, -40],
    [-4, -76],
    [5, -132],
    [-1, -170],
    [3, -212],
    [-5, -280],
  ].map(([x, z]) => ({ x, z, period: 2.6 + rnd.range(0, 1.6), phase: rnd.range(0, 4) }));

  // Scaffolding around the unfinished pillars and along the walls
  const members: Member[] = [];
  addScaffold(members, 6, -57, 3, 3, 5, 2);
  addScaffold(members, -12, -233, 3, 3, 6, 2);
  addScaffold(members, 29.4, -162, 2, 10, 5, 2);
  addScaffold(members, -28, -153, 3, 3, 4, 2);
  addScaffold(members, 22, -265, 3, 3, 7, 2);
  if (high) {
    addScaffold(members, -33.4, -26, 2, 12, 4, 2.5);
    addScaffold(members, -33.4, -344, 2, 8, 6, 2);
  }

  // Rebar sticking out of the unfinished pillars
  const rebar: number[] = [];
  for (const p of pillars) {
    if (p.h >= CEILING) continue;
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 4; k++) {
        const x = p.x - 1.1 + i * 0.73;
        const z = p.z - 1.1 + k * 0.73;
        const len = rnd.range(0.8, 2.4);
        const bend = rnd.chance(0.3) ? rnd.range(-0.5, 0.5) : 0;
        rebar.push(x, p.h, z, x + bend, p.h + len, z + bend * 0.6);
      }
    }
  }

  // Caution tape between pillars
  const tapes: TapeDef[] = [];
  const tape = (ax: number, az: number, bx: number, bz: number, y = 1.05) =>
    tapes.push({ a: new Vector3(ax, y, az), b: new Vector3(bx, y, bz), seed: rnd.next() });
  tape(9 + PILLAR / 2, -6, 25 - PILLAR / 2, -6);
  tape(-9 - PILLAR / 2, -102, -25 + PILLAR / 2, -102);
  tape(9 + PILLAR / 2, -182, 25 - PILLAR / 2, -182);
  tape(-9 + PILLAR / 2, -214 - PILLAR / 2, -9 + PILLAR / 2, -246 + PILLAR / 2);
  tape(-9 - PILLAR / 2, -246, -25 + PILLAR / 2, -246, 1.25);
  for (let x = -30; x < 30; x += 6) tape(x, -337.2, x + 6, -337.2, 1.3);

  // Little amber blinkers on top of barriers
  const blinkers: number[] = [];
  barriers.forEach((b, i) => {
    if (i % 2 === 0) blinkers.push(b.x, b.y + 0.55, b.z, rnd.next());
  });

  // Everything that gives off light
  const emitters: Emitter[] = [];
  lamps.forEach((l, i) =>
    emitters.push({
      kind: "lamp",
      ref: i,
      light: new Vector3(l.x, 5.2, l.z),
      glow: new Vector3(l.x, 15.25, l.z),
      color: SODIUM,
      strength: 2.4,
      radius: 4.8,
      size: 0.5,
    }),
  );
  signs.forEach((s, i) => {
    const nx = Math.sin(s.rotY);
    const nz = Math.cos(s.rotY);
    emitters.push({
      kind: "sign",
      ref: i,
      light: new Vector3(s.x + nx * 0.8, s.y, s.z + nz * 0.8),
      glow: new Vector3(s.x, s.y, s.z),
      color: s.color,
      strength: s.hanging ? 1.7 : 1.3,
      radius: 2.6 + Math.max(s.w, s.h) * 0.3,
      size: Math.max(s.w, s.h) * 0.3,
    });
  });
  for (let i = 0; i < pillarTubeZ.length; i++) {
    const t = tubes[i];
    emitters.push({
      kind: "tube",
      ref: i,
      light: new Vector3(t.x * 0.9, t.y, t.z + 0.4),
      glow: new Vector3(t.x, t.y, t.z),
      color: t.color,
      strength: 0.9,
      radius: 2.8,
      size: 1.1,
    });
  }
  beacons.forEach((b, i) =>
    emitters.push({
      kind: "beacon",
      ref: i,
      light: new Vector3(b.x, b.y + 0.6, b.z),
      glow: new Vector3(b.x, b.y + 0.35, b.z),
      color: RED,
      strength: 2.6,
      radius: 6.5,
      size: 0.25,
    }),
  );
  welders.forEach((w, i) =>
    emitters.push({
      kind: "arc",
      ref: i,
      light: new Vector3(w.x, w.y, w.z),
      glow: new Vector3(w.x, w.y, w.z),
      color: ARC,
      strength: 3.2,
      radius: 5.5,
      size: 0.2,
    }),
  );
  emitters.push({
    kind: "hub",
    ref: 0,
    light: new Vector3(0, TUNNEL_Y, TBM_Z + 4),
    glow: new Vector3(0, TUNNEL_Y, TBM_Z + 0.5),
    color: RED,
    strength: 6.5,
    radius: 16,
    size: 3,
  });
  stations.forEach((s, i) =>
    emitters.push({
      kind: "holo",
      ref: i,
      light: new Vector3(s.x, 2.6, s.z),
      glow: new Vector3(s.x, 5, s.z),
      color: CYAN,
      strength: 0.9,
      radius: 6,
      size: 2,
    }),
  );
  shafts.forEach((s, i) =>
    emitters.push({
      kind: "shaft",
      ref: i,
      light: new Vector3(s.x, 3, s.z),
      glow: new Vector3(s.x, CEILING - 0.4, s.z),
      color: COLD,
      strength: 0.75,
      radius: 5,
      size: 1.5,
    }),
  );
  floods.forEach((f, i) =>
    emitters.push({
      kind: "flood",
      ref: i,
      light: new Vector3(f.x * 0.75, 5.5, f.z - 3),
      glow: new Vector3(f.x, f.y, f.z),
      color: SODIUM,
      strength: 3.2,
      radius: 7.5,
      size: 0.6,
    }),
  );
  for (let i = tunnelTubesStart; i < tubes.length; i += 4) {
    const t = tubes[i];
    emitters.push({
      kind: "tube",
      ref: i,
      light: new Vector3(t.x * 0.8, t.y - 1.5, t.z),
      glow: new Vector3(t.x, t.y, t.z),
      color: t.color,
      strength: 1.1,
      radius: 4.5,
      size: 0.5,
    });
  }

  return {
    pillars,
    beams,
    stations,
    barriers,
    signs,
    tubes,
    lamps,
    welders,
    beacons,
    shafts,
    floods,
    drips,
    members,
    rebar: new Float32Array(rebar),
    tapes,
    blinkers: new Float32Array(blinkers),
    emitters,
  };
}

/* ------------------------------------------------------------------ */
/* Shared uniforms and per-frame state                                 */
/* ------------------------------------------------------------------ */

// One set of light uniforms, referenced by every material in the scene.
const shared = {
  uTime: { value: 0 },
  uGlitch: { value: 0 },
  // xyz: where the light shines from, w: its reach
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4(0, -500, 0, 1)) },
  uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector3()) },
  // xyz: the visible glowing part (mirrored in the puddles), w: its size
  uGlowPos: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4(0, -500, 0, 1)) },
  uFogColor: { value: new Color(P.fog) },
  uFogDensity: { value: THEME.fogDensity },
};

type Runtime = {
  signPower: Float32Array;
  tubePower: Float32Array;
  lampPower: Float32Array;
  lampAngle: Float32Array;
  arcPower: Float32Array;
  beaconAngle: Float32Array;
  build: Float32Array;
  fade: Float32Array;
  order: number[];
  score: Float32Array;
  power: Float32Array;
};

function createRuntime(layout: Layout): Runtime {
  return {
    signPower: new Float32Array(layout.signs.length).fill(1),
    tubePower: new Float32Array(layout.tubes.length).fill(1),
    lampPower: new Float32Array(layout.lamps.length).fill(1),
    lampAngle: new Float32Array(layout.lamps.length),
    arcPower: new Float32Array(layout.welders.length),
    beaconAngle: new Float32Array(layout.beacons.length),
    build: new Float32Array(layout.stations.length).fill(1),
    fade: new Float32Array(layout.stations.length).fill(1),
    order: layout.emitters.map((_, i) => i),
    score: new Float32Array(layout.emitters.length),
    power: new Float32Array(layout.emitters.length),
  };
}

const LAMP_PIVOT = CEILING - 0.1;
const LAMP_DROP = 4.6;

/** Lamp position on its cable for a swing angle (radians, swinging in x). */
function lampPoint(l: LampDef, angle: number, along: number, out: Vector3) {
  return out.set(l.x + Math.sin(angle) * along, LAMP_PIVOT - Math.cos(angle) * along, l.z);
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const focus = new Vector3();

/** Updates every flicker, swing and build, then hands the closest lights to the shaders. */
function Controller({
  layout,
  tier,
  active,
  runtimeRef,
}: {
  layout: Layout;
  tier: Tier;
  active: boolean;
  runtimeRef: RefObject<Runtime | null>;
}) {
  const activeRef = useActiveRef(active);

  useFrame((state) => {
    if (!activeRef.current) return;
    if (!runtimeRef.current) runtimeRef.current = createRuntime(layout);
    const rt = runtimeRef.current;
    const reduced = world.reducedMotion;
    const t = reduced ? 0 : state.clock.elapsedTime;
    shared.uTime.value = t;
    const mains = reduced ? 1 : mainsPower(t);
    shared.uGlitch.value = 1 - mains;

    layout.signs.forEach((s, i) => {
      rt.signPower[i] = (reduced ? 1 : flicker(s.profile, s.seed, t)) * mains;
    });
    layout.tubes.forEach((tube, i) => {
      rt.tubePower[i] = (reduced ? 1 : flicker(tube.profile, tube.seed, t)) * mains * tube.base;
    });
    layout.lamps.forEach((l, i) => {
      rt.lampPower[i] = (reduced ? 1 : flicker(l.profile, l.seed, t)) * mains;
      rt.lampAngle[i] = l.swing * 0.17 * Math.sin(t * 1.05 + l.seed * 6);
    });
    layout.welders.forEach((w, i) => {
      const firing = !reduced && (((t / w.period + w.phase) % 1) + 1) % 1 < w.duty;
      rt.arcPower[i] = firing ? 0.55 + 0.45 * noise1(t * 8 + w.seed * 40) : 0;
    });
    layout.beacons.forEach((b, i) => {
      rt.beaconAngle[i] = b.phase + t * b.speed;
    });
    layout.stations.forEach((s, i) => {
      const [build, fade] = reduced ? [1, 1] : buildState(t, s.phase);
      rt.build[i] = build;
      rt.fade[i] = fade;
    });

    // Rank the lights by how close they are to what the camera is looking at
    const camera = state.camera;
    camera.getWorldDirection(tmpA);
    focus.copy(camera.position).addScaledVector(tmpA, 14);
    layout.emitters.forEach((e, i) => {
      let power = 1;
      let light = e.light;
      switch (e.kind) {
        case "lamp":
          power = rt.lampPower[e.ref];
          light = lampPoint(layout.lamps[e.ref], rt.lampAngle[e.ref], LAMP_PIVOT - 5.2, tmpB);
          break;
        case "sign":
          power = rt.signPower[e.ref];
          break;
        case "tube":
          power = rt.tubePower[e.ref];
          break;
        case "arc":
          power = rt.arcPower[e.ref];
          break;
        case "beacon": {
          // Brightest when the spinning beam faces the camera
          const b = layout.beacons[e.ref];
          const toCam = Math.atan2(camera.position.z - b.z, camera.position.x - b.x);
          const facing = 0.5 + 0.5 * Math.cos(2 * (rt.beaconAngle[e.ref] - toCam));
          power = 0.45 + 0.55 * facing ** 6;
          break;
        }
        case "hub":
          power = 0.85 + 0.15 * Math.sin(t * 1.3);
          break;
        case "holo":
          power = rt.fade[e.ref] * (0.45 + 0.55 * Math.min(1, rt.build[e.ref] * 3));
          break;
        case "shaft":
          power = 1;
          break;
        case "flood": {
          const f = layout.floods[e.ref];
          power = (reduced ? 1 : flicker(f.profile, f.seed, t)) * mains;
          break;
        }
      }
      rt.power[i] = power;
      rt.score[i] = power * e.strength < 0.03 ? 1e9 : light.distanceTo(focus);
    });
    rt.order.sort((a, b) => rt.score[a] - rt.score[b]);

    const count = lightCount(tier);
    const cut = rt.score[rt.order[count]] ?? 1e9;
    for (let k = 0; k < MAX_LIGHTS; k++) {
      const pos = shared.uLightPos.value[k];
      const col = shared.uLightCol.value[k];
      const glow = shared.uGlowPos.value[k];
      const index = k < count ? rt.order[k] : -1;
      const score = index >= 0 ? rt.score[index] : 1e9;
      if (index < 0 || score >= 1e9) {
        pos.set(0, -500, 0, 1);
        col.set(0, 0, 0);
        glow.set(0, -500, 0, 1);
        continue;
      }
      const e = layout.emitters[index];
      const fade =
        cut >= 1e9 ? 1 : 1 - Math.min(1, Math.max(0, (score - cut * 0.72) / (cut * 0.28)));
      const intensity = rt.power[index] * e.strength * fade;
      if (e.kind === "lamp") {
        const l = layout.lamps[e.ref];
        lampPoint(l, rt.lampAngle[e.ref], LAMP_PIVOT - 5.2, tmpB);
        pos.set(tmpB.x, tmpB.y, tmpB.z, e.radius);
        lampPoint(l, rt.lampAngle[e.ref], LAMP_DROP + 0.25, tmpB);
        glow.set(tmpB.x, tmpB.y, tmpB.z, e.size);
      } else {
        pos.set(e.light.x, e.light.y, e.light.z, e.radius);
        glow.set(e.glow.x, e.glow.y, e.glow.z, e.size);
      }
      col.set(e.color.r * intensity, e.color.g * intensity, e.color.b * intensity);
    }
  }, -1);

  return null;
}

/* ------------------------------------------------------------------ */
/* Shader building blocks                                              */
/* ------------------------------------------------------------------ */

const lightsGLSL = /* glsl */ `
uniform vec4 uLightPos[NUM_LIGHTS];
uniform vec3 uLightCol[NUM_LIGHTS];
// Soft point lights with a little wrap, so faces turned away are not pitch black
vec3 sceneLight(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < NUM_LIGHTS; i++) {
    vec3 d = uLightPos[i].xyz - p;
    float dist2 = max(dot(d, d), 0.01);
    float r2 = uLightPos[i].w * uLightPos[i].w;
    float att = 1.0 / (1.0 + dist2 / r2);
    att *= 1.0 - smoothstep(4.0 * r2, 12.0 * r2, dist2);
    float ndl = dot(n, d) * inversesqrt(dist2);
    sum += uLightCol[i] * att * (0.2 + 0.8 * max(ndl, 0.0));
  }
  return sum;
}
// Same lights without a surface direction (dust, drops, thin wires)
vec3 airLight(vec3 p) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < NUM_LIGHTS; i++) {
    vec3 d = uLightPos[i].xyz - p;
    float dist2 = max(dot(d, d), 0.01);
    float r2 = uLightPos[i].w * uLightPos[i].w;
    float att = 1.0 / (1.0 + dist2 / r2);
    att *= 1.0 - smoothstep(4.0 * r2, 12.0 * r2, dist2);
    sum += uLightCol[i] * att;
  }
  return sum;
}
`;

const surfaceGLSL = /* glsl */ `
const vec3 AMBIENT = vec3(0.011, 0.0095, 0.0105);
vec3 concreteAlbedo(vec2 q, float seed) {
  float a = snoise(q * 0.32 + seed * 7.1);
  float b = snoise(q * 1.6 - seed * 3.3);
  float c = snoise(q * 5.5 + seed * 1.7);
  return vec3(0.25, 0.242, 0.23) * (0.8 + 0.13 * a + 0.07 * b + 0.04 * c);
}
float stripes(vec2 q, float freq) {
  return step(0.5, fract((q.x + q.y) * freq));
}
float wear(vec2 q, float seed) {
  return smoothstep(-0.45, 0.25, snoise(q * 2.1 + seed * 5.0));
}
`;

const instancedVertex = /* glsl */ `
attribute vec4 aData;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying vec3 vScale;
varying vec4 vData;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vLocal = position;
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vData = aData;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const meshVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying vec3 vLocal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vLocal = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const lightDefines = (tier: Tier) => ({ NUM_LIGHTS: lightCount(tier) });

/** Fills an instanced mesh's matrices once. */
function useInstanceMatrices(
  meshRef: RefObject<InstancedMesh | null>,
  count: number,
  write: (i: number, dummy: Object3D) => void,
) {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      write(i, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [meshRef, count, write]);
}

function useDisposable<T extends { dispose: () => void }>(item: T) {
  useEffect(() => () => item.dispose(), [item]);
  return item;
}

/* ------------------------------------------------------------------ */
/* Floor: wet concrete, painted lanes, puddles that mirror the neon     */
/* ------------------------------------------------------------------ */

function Floor({ layout, tier }: { layout: Layout; tier: Tier }) {
  const drips = tier === "high" ? layout.drips.length : 0;
  const uniforms = useMemo(
    () => ({
      ...shared,
      uZones: { value: layout.stations.map((s) => new Vector4(s.x, s.z, 5.4, 5.4)) },
      uDrips: { value: layout.drips.map((d) => new Vector4(d.x, d.z, d.period, d.phase)) },
      uPaint: { value: PAINT },
    }),
    [layout],
  );

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -200]} frustumCulled={false}>
      <planeGeometry args={[HALL_X * 2, 520]} />
      <shaderMaterial
        uniforms={uniforms}
        defines={{ ...lightDefines(tier), ZONES: layout.stations.length, DRIPS: drips }}
        vertexShader={
          /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform float uTime;
          uniform vec4 uGlowPos[NUM_LIGHTS];
          uniform vec4 uZones[ZONES];
          uniform vec3 uPaint;
          #if DRIPS > 0
          uniform vec4 uDrips[DRIPS];
          #endif
          varying vec3 vWorld;
          ${lightsGLSL}
          ${fogGLSL}
          ${hashGLSL}
          ${simplexGLSL}
          ${surfaceGLSL}
          void main() {
            vec2 p = vWorld.xz;
            float n1 = snoise(p * 0.07);
            float n2 = snoise(p * 0.55 + 13.1);
            float n3 = snoise(p * 2.7 - 7.3);
            vec3 albedo = vec3(0.2, 0.193, 0.183) * (0.8 + 0.14 * n1 + 0.08 * n2 + 0.05 * n3);

            // Expansion joints every 8 m
            vec2 cellF = fract(p / 8.0);
            vec2 jd = min(cellF, 1.0 - cellF) * 8.0;
            albedo *= 1.0 - (1.0 - smoothstep(0.02, 0.07, min(jd.x, jd.y))) * 0.6;

            // Standing water
            float wetN = snoise(p * 0.045 + vec2(3.0, 9.0)) * 0.65 + snoise(p * 0.16 + 4.0) * 0.35;
            float wet = smoothstep(0.16, 0.32, wetN);
            albedo *= mix(1.0, 0.42, wet);

            // Faded lane paint along the aisle, hazard stripes around the work zones
            float worn = wear(p * 0.45, 2.0);
            float lane = (1.0 - smoothstep(0.07, 0.11, abs(abs(p.x) - 6.4))) * step(0.42, fract(p.y / 6.0));
            albedo = mix(albedo, uPaint * 0.5, lane * worn * (1.0 - wet * 0.5) * step(p.y, 40.0));
            for (int i = 0; i < ZONES; i++) {
              vec2 d = abs(p - uZones[i].xy) - uZones[i].zw;
              float edge = max(d.x, d.y);
              float band = step(edge, 0.0) * step(-1.1, edge);
              vec3 hazard = mix(vec3(0.012), uPaint * 0.62, stripes(p, 0.55));
              albedo = mix(albedo, hazard, band * worn * 0.9);
            }

            vec3 col = albedo * (sceneLight(vWorld, vec3(0.0, 1.0, 0.0)) + AMBIENT);

            // Reflections of nearby lights: sharp in puddles, smeared on dry concrete
            vec3 vP = (viewMatrix * vec4(vWorld, 1.0)).xyz;
            vec2 sP = vP.xy / max(-vP.z, 0.1);
            float ripple = 0.0;
            #if DRIPS > 0
            for (int i = 0; i < DRIPS; i++) {
              float since = mod(uTime + uDrips[i].w, uDrips[i].z) - 2.02;
              if (since > 0.0) {
                float ring = exp(-abs(length(p - uDrips[i].xy) - since * 1.1) * 10.0);
                ripple += ring * exp(-since * 1.8);
              }
            }
            #endif
            vec2 wobble = vec2(snoise(p * 1.7 + uTime * 0.35), snoise(p * 1.7 - uTime * 0.31 + 5.0));
            sP += wobble * mix(0.006, 0.0016, wet) + ripple * 0.006 * wet;
            vec3 refl = vec3(0.0);
            for (int i = 0; i < NUM_LIGHTS; i++) {
              vec3 m = uGlowPos[i].xyz;
              m.y = -m.y;
              vec3 vM = (viewMatrix * vec4(m, 1.0)).xyz;
              if (vM.z > -0.5) continue;
              vec2 dd = sP - vM.xy / -vM.z;
              float s = uGlowPos[i].w / -vM.z;
              float sx = mix(0.024, 0.006, wet) + s * 0.6;
              float sy = mix(0.13, 0.05, wet) + s * 1.3;
              float g = exp(-(dd.x * dd.x) / (sx * sx) - (dd.y * dd.y) / (sy * sy));
              refl += uLightCol[i] * g * (1.0 - fogAmount(length(m - cameraPosition)));
            }
            col += refl * mix(0.07, 0.85, wet) * (1.0 + ripple * 0.5);
            col = applyFog(col, length(vWorld - cameraPosition));
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Walls, ceiling and pipes                                            */
/* ------------------------------------------------------------------ */

const wallFragment = /* glsl */ `
uniform vec3 uPaint;
varying vec3 vWorld;
varying vec3 vNormalW;
${lightsGLSL}
${fogGLSL}
${hashGLSL}
${simplexGLSL}
${surfaceGLSL}
void main() {
  vec3 n = normalize(vNormalW);
  // Wall plane coordinates: along the wall and up
  vec2 q = abs(n.x) > 0.5 ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
  vec3 albedo = concreteAlbedo(q, 3.7);
  float sz = abs(fract(q.x / 6.0 + 0.5) - 0.5) * 6.0;
  float sy = abs(fract(q.y / 5.0 + 0.5) - 0.5) * 5.0;
  albedo *= 1.0 - (1.0 - smoothstep(0.02, 0.06, min(sz, sy))) * 0.55;
  // Rust and water running down from the seams
  float leak = smoothstep(0.15, 0.9, snoise(vec2(q.x * 1.2, q.y * 0.05 + 3.0)));
  albedo *= 1.0 - leak * smoothstep(1.0, 16.0, q.y) * 0.5;
  albedo = mix(albedo, albedo * vec3(1.25, 0.85, 0.6), smoothstep(0.55, 0.95, leak) * 0.5);
  // Hazard band along the bottom
  float band = step(0.15, q.y) * step(q.y, 1.05);
  albedo = mix(albedo, mix(vec3(0.014), uPaint * 0.65, stripes(q, 1.2)), band * wear(q, 4.0));
  albedo *= mix(0.6, 1.0, smoothstep(0.0, 1.5, q.y));
  vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT);
  col = applyFog(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

function Walls({ tier }: { tier: Tier }) {
  const uniforms = useMemo(() => ({ ...shared, uPaint: { value: PAINT } }), []);
  const length = 420;
  const center = 30 - length / 2;
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * HALL_X, CEILING / 2, center]}
          rotation-y={-side * (Math.PI / 2)}
          frustumCulled={false}
        >
          <planeGeometry args={[length, CEILING]} />
          <shaderMaterial
            uniforms={uniforms}
            defines={lightDefines(tier)}
            vertexShader={meshVertex}
            fragmentShader={wallFragment}
          />
        </mesh>
      ))}
      <EndWall tier={tier} />
    </group>
  );
}

/** The wall at the end of the hall, with the round mouth of the tunnel. */
function EndWall({ tier }: { tier: Tier }) {
  const uniforms = useMemo(() => ({ ...shared, uPaint: { value: PAINT } }), []);
  return (
    <mesh position={[0, CEILING / 2, PORTAL_Z]} frustumCulled={false}>
      <planeGeometry args={[HALL_X * 2, CEILING]} />
      <shaderMaterial
        uniforms={uniforms}
        defines={lightDefines(tier)}
        vertexShader={meshVertex}
        fragmentShader={
          /* glsl */ `
          uniform vec3 uPaint;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          ${lightsGLSL}
          ${fogGLSL}
          ${hashGLSL}
          ${simplexGLSL}
          ${surfaceGLSL}
          void main() {
            vec2 q = vWorld.xy;
            float r = length(q - vec2(0.0, ${TUNNEL_Y.toFixed(1)}));
            if (r < ${(TUNNEL_R + 0.15).toFixed(2)}) discard;
            vec3 albedo = concreteAlbedo(q, 9.1);
            // Chevrons around the portal
            float ring = step(r, ${(TUNNEL_R + 1.3).toFixed(2)});
            float ang = atan(q.y - ${TUNNEL_Y.toFixed(1)}, q.x);
            float chevron = step(0.5, fract(ang * 5.0 + r * 0.6));
            albedo = mix(albedo, mix(vec3(0.014), uPaint * 0.7, chevron), ring * wear(q, 7.0));
            float leak = smoothstep(0.2, 0.9, snoise(vec2(q.x * 1.1, q.y * 0.05)));
            albedo *= 1.0 - leak * 0.45;
            vec3 n = vec3(0.0, 0.0, 1.0);
            vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT);
            col = applyFog(col, length(vWorld - cameraPosition));
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </mesh>
  );
}

function Ceiling({ layout, tier }: { layout: Layout; tier: Tier }) {
  const uniforms = useMemo(() => ({ ...shared, uPaint: { value: PAINT } }), []);
  const beamRef = useRef<InstancedMesh>(null);
  const beamGeometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const data = new Float32Array(layout.beams.length * 4);
    layout.beams.forEach((b, i) => data.set([b.seed, 0, 0, 1], i * 4));
    g.setAttribute("aData", new InstancedBufferAttribute(data, 4));
    return g;
  }, [layout]);
  useDisposable(beamGeometry);
  const writeBeam = useMemo(
    () => (i: number, d: Object3D) => {
      const b = layout.beams[i];
      d.position.set(b.x, b.y, b.z);
      d.scale.set(b.sx, b.sy, b.sz);
    },
    [layout],
  );
  useInstanceMatrices(beamRef, layout.beams.length, writeBeam);

  const pipes = [
    { x: -13, y: 18.3, r: 0.45 },
    { x: -11.8, y: 18.55, r: 0.28 },
    { x: 14, y: 18.15, r: 0.55 },
    { x: 15.4, y: 18.6, r: 0.22 },
    { x: -HALL_X + 1.2, y: 16.2, r: 0.35 },
    { x: HALL_X - 1.4, y: 12.6, r: 0.4 },
  ];

  return (
    <group>
      <mesh position={[0, CEILING, -200]} rotation-x={Math.PI / 2} frustumCulled={false}>
        <planeGeometry args={[HALL_X * 2, 520]} />
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={meshVertex}
          fragmentShader={
            /* glsl */ `
            varying vec3 vWorld;
            ${lightsGLSL}
            ${fogGLSL}
            ${hashGLSL}
            ${simplexGLSL}
            ${surfaceGLSL}
            void main() {
              vec3 n = vec3(0.0, -1.0, 0.0);
              vec3 albedo = concreteAlbedo(vWorld.xz, 5.3) * 0.7;
              vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT * 0.6);
              col = applyFog(col, length(vWorld - cameraPosition));
              gl_FragColor = vec4(col, 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      <instancedMesh
        ref={beamRef}
        args={[beamGeometry, undefined, layout.beams.length]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={concreteFragment}
        />
      </instancedMesh>
      {pipes.map((pipe, i) => (
        <mesh
          key={i}
          position={[pipe.x, pipe.y, -160]}
          rotation-x={Math.PI / 2}
          frustumCulled={false}
        >
          <cylinderGeometry args={[pipe.r, pipe.r, 400, 12, 1, true]} />
          <shaderMaterial
            uniforms={uniforms}
            defines={lightDefines(tier)}
            vertexShader={meshVertex}
            fragmentShader={metalFragment}
          />
        </mesh>
      ))}
    </group>
  );
}

const metalFragment = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
${lightsGLSL}
${fogGLSL}
${hashGLSL}
${simplexGLSL}
const vec3 AMBIENT = vec3(0.011, 0.0095, 0.0105);
void main() {
  vec3 n = normalize(vNormalW);
  float rust = smoothstep(0.1, 0.8, snoise(vWorld * 0.6));
  vec3 albedo = mix(vec3(0.2, 0.2, 0.21), vec3(0.3, 0.16, 0.08), rust * 0.7);
  vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT);
  // A little sheen toward the lights
  col += sceneLight(vWorld, n) * 0.06 * pow(max(dot(normalize(cameraPosition - vWorld), n), 0.0), 4.0);
  col = applyFog(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Pillars, beams and barriers                                         */
/* ------------------------------------------------------------------ */

// aData: x = seed, y = hazard band, z = 1 for road barriers, w = 1 for beams
const concreteFragment = /* glsl */ `
uniform vec3 uPaint;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying vec3 vScale;
varying vec4 vData;
${lightsGLSL}
${fogGLSL}
${hashGLSL}
${simplexGLSL}
${surfaceGLSL}
void main() {
  vec3 n = normalize(vNormalW);
  float seed = vData.x;
  vec2 q = abs(n.x) > 0.5 ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
  if (abs(n.y) > 0.5) q = vWorld.xz;
  vec3 albedo = concreteAlbedo(q, seed);

  if (vData.z > 0.5) {
    // Road barrier: worn red and white stripes
    vec3 paint = mix(vec3(0.42, 0.04, 0.03), vec3(0.42, 0.4, 0.37), stripes(q, 0.8));
    albedo = mix(albedo, paint, wear(q, seed) * step(abs(n.y), 0.5));
  } else {
    // Formwork lines from each concrete pour
    float pour = abs(fract(vWorld.y / 1.25 + 0.5) - 0.5) * 1.25;
    albedo *= 1.0 - (1.0 - smoothstep(0.01, 0.035, pour)) * 0.3 * (1.0 - vData.w);
    // Water stains running down from the ceiling
    float stain = smoothstep(0.15, 0.85, snoise(vec2(q.x * 1.8 + seed * 9.0, q.y * 0.07)));
    albedo *= 1.0 - stain * (0.15 + 0.4 * smoothstep(4.0, 18.0, vWorld.y)) * 0.6;
    // Hazard band at the base
    float band = vData.y * step(0.25, vWorld.y) * step(vWorld.y, 1.35) * step(abs(n.y), 0.5);
    albedo = mix(albedo, mix(vec3(0.014), uPaint * 0.72, stripes(vec2(q.x, vWorld.y), 1.4)), band * wear(q, seed));
    albedo *= mix(0.55, 1.0, smoothstep(0.0, 1.6, vWorld.y));
  }
  vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT);
  col = applyFog(col, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

function Pillars({ layout, tier }: { layout: Layout; tier: Tier }) {
  const uniforms = useMemo(() => ({ ...shared, uPaint: { value: PAINT } }), []);
  const pillarRef = useRef<InstancedMesh>(null);
  const barrierRef = useRef<InstancedMesh>(null);

  const pillarGeometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const data = new Float32Array(layout.pillars.length * 4);
    layout.pillars.forEach((p, i) => data.set([p.seed, p.hazard ? 1 : 0, 0, 0], i * 4));
    g.setAttribute("aData", new InstancedBufferAttribute(data, 4));
    return g;
  }, [layout]);
  const barrierGeometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const data = new Float32Array(layout.barriers.length * 4);
    layout.barriers.forEach((b, i) => data.set([b.seed, 0, 1, 0], i * 4));
    g.setAttribute("aData", new InstancedBufferAttribute(data, 4));
    return g;
  }, [layout]);
  useDisposable(pillarGeometry);
  useDisposable(barrierGeometry);

  const writePillar = useMemo(
    () => (i: number, d: Object3D) => {
      const p = layout.pillars[i];
      d.position.set(p.x, p.h / 2, p.z);
      d.scale.set(PILLAR, p.h, PILLAR);
    },
    [layout],
  );
  const writeBarrier = useMemo(
    () => (i: number, d: Object3D) => {
      const b = layout.barriers[i];
      d.position.set(b.x, b.y, b.z);
      d.scale.set(b.sx, b.sy, b.sz);
    },
    [layout],
  );
  useInstanceMatrices(pillarRef, layout.pillars.length, writePillar);
  useInstanceMatrices(barrierRef, layout.barriers.length, writeBarrier);

  return (
    <group>
      <instancedMesh
        ref={pillarRef}
        args={[pillarGeometry, undefined, layout.pillars.length]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={concreteFragment}
        />
      </instancedMesh>
      <instancedMesh
        ref={barrierRef}
        args={[barrierGeometry, undefined, layout.barriers.length]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={concreteFragment}
        />
      </instancedMesh>
    </group>
  );
}

/** Steel bars sticking out of the unfinished pillars. */
function Rebar({ layout, tier }: { layout: Layout; tier: Tier }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(layout.rebar, 3));
    return g;
  }, [layout]);
  useDisposable(geometry);
  const uniforms = useMemo(() => ({ ...shared }), []);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        defines={lightDefines(tier)}
        vertexShader={
          /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          varying vec3 vWorld;
          ${lightsGLSL}
          ${fogGLSL}
          void main() {
            vec3 col = vec3(0.32, 0.17, 0.09) * (airLight(vWorld) * 0.8 + vec3(0.02));
            col = applyFog(col, length(vWorld - cameraPosition));
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ */
/* Scaffolding                                                         */
/* ------------------------------------------------------------------ */

const UP = new Vector3(0, 1, 0);

function Scaffolding({ layout, tier }: { layout: Layout; tier: Tier }) {
  const meshRef = useRef<InstancedMesh>(null);
  const uniforms = useMemo(() => ({ ...shared }), []);
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const data = new Float32Array(layout.members.length * 4);
    layout.members.forEach((m, i) => data.set([i * 0.137, m.plank ? 1 : 0, 0, 0], i * 4));
    g.setAttribute("aData", new InstancedBufferAttribute(data, 4));
    return g;
  }, [layout]);
  useDisposable(geometry);

  const write = useMemo(() => {
    const dir = new Vector3();
    const q = new Quaternion();
    return (i: number, d: Object3D) => {
      const m = layout.members[i];
      dir.subVectors(m.b, m.a);
      const len = dir.length();
      d.position.addVectors(m.a, m.b).multiplyScalar(0.5);
      if (m.plank) {
        // Planks lie flat, running along x or z
        const alongX = Math.abs(dir.x) > Math.abs(dir.z);
        d.scale.set(alongX ? len : 0.75, 0.05, alongX ? 0.75 : len);
      } else {
        q.setFromUnitVectors(UP, dir.normalize());
        d.quaternion.copy(q);
        d.scale.set(m.thick, len, m.thick);
      }
    };
  }, [layout]);
  useInstanceMatrices(meshRef, layout.members.length, write);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, layout.members.length]}
      frustumCulled={false}
    >
      <shaderMaterial
        uniforms={uniforms}
        defines={lightDefines(tier)}
        vertexShader={instancedVertex}
        fragmentShader={
          /* glsl */ `
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying vec4 vData;
          ${lightsGLSL}
          ${fogGLSL}
          ${hashGLSL}
          ${simplexGLSL}
          const vec3 AMBIENT = vec3(0.011, 0.0095, 0.0105);
          void main() {
            vec3 n = normalize(vNormalW);
            vec3 albedo;
            if (vData.y > 0.5) {
              // Weathered wooden boards
              float grain = snoise(vec2(vWorld.x + vWorld.z, vWorld.y * 3.0) * vec2(0.6, 6.0));
              albedo = vec3(0.26, 0.17, 0.09) * (0.75 + 0.25 * grain);
            } else {
              // Galvanised tube, rusting in places, a few painted safety orange
              float rust = smoothstep(0.2, 0.9, snoise(vWorld * 0.9 + vData.x));
              albedo = mix(vec3(0.3, 0.3, 0.31), vec3(0.32, 0.15, 0.07), rust * 0.75);
              albedo = mix(albedo, vec3(0.45, 0.17, 0.02), step(0.88, fract(vData.x * 7.31)));
            }
            vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT);
            col = applyFog(col, length(vWorld - cameraPosition));
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Caution tape and blinkers                                           */
/* ------------------------------------------------------------------ */

function Tape({ layout, tier }: { layout: Layout; tier: Tier }) {
  const meshRef = useRef<InstancedMesh>(null);
  const uniforms = useMemo(() => ({ ...shared, uPaint: { value: AMBER } }), []);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1, 24, 1);
    const data = new Float32Array(layout.tapes.length * 4);
    layout.tapes.forEach((tp, i) => data.set([tp.seed, tp.a.distanceTo(tp.b), 0, 0], i * 4));
    g.setAttribute("aData", new InstancedBufferAttribute(data, 4));
    return g;
  }, [layout]);
  useDisposable(geometry);
  const write = useMemo(() => {
    const dir = new Vector3();
    return (i: number, d: Object3D) => {
      const tp = layout.tapes[i];
      dir.subVectors(tp.b, tp.a);
      d.position.addVectors(tp.a, tp.b).multiplyScalar(0.5);
      d.rotation.set(0, -Math.atan2(dir.z, dir.x), 0);
      d.scale.set(dir.length(), 0.09, 1);
    };
  }, [layout]);
  useInstanceMatrices(meshRef, layout.tapes.length, write);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, layout.tapes.length]}
      frustumCulled={false}
    >
      <shaderMaterial
        uniforms={uniforms}
        side={DoubleSide}
        defines={lightDefines(tier)}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          attribute vec4 aData;
          varying vec3 vWorld;
          varying vec2 vUv;
          varying vec4 vData;
          void main() {
            vec3 p = position;
            // Sag in the middle and flutter a little in the draught
            float u = p.x + 0.5;
            float sag = 4.0 * u * (1.0 - u);
            vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
            w.y -= sag * (0.12 + aData.y * 0.008);
            w.y += sin(u * 18.0 + uTime * 3.0 + aData.x * 20.0) * 0.03 * sag;
            vWorld = w.xyz;
            vUv = vec2(u * aData.y, uv.y);
            vData = aData;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uPaint;
          varying vec3 vWorld;
          varying vec2 vUv;
          varying vec4 vData;
          ${lightsGLSL}
          ${fogGLSL}
          void main() {
            float s = step(0.5, fract(vUv.x * 1.6 + vUv.y * 0.5));
            vec3 albedo = mix(vec3(0.02), uPaint * 0.8, s);
            // Plastic tape catches light, so it stays faintly visible in the dark
            vec3 col = albedo * (airLight(vWorld) + vec3(0.05));
            col = applyFog(col, length(vWorld - cameraPosition));
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

function Blinkers({ layout }: { layout: Layout }) {
  const geometry = useMemo(() => {
    const count = layout.blinkers.length / 4;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions.set(layout.blinkers.subarray(i * 4, i * 4 + 3), i * 3);
      seeds[i] = layout.blinkers[i * 4 + 3];
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    return g;
  }, [layout]);
  useDisposable(geometry);
  const uniforms = useMemo(() => ({ ...shared, uColor: { value: AMBER } }), []);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          attribute float aSeed;
          varying float vOn;
          varying float vDist;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDist = -mv.z;
            // Classic construction flasher: one blink a second
            vOn = step(0.55, fract(uTime * 1.0 + aSeed));
            gl_PointSize = clamp(260.0 / vDist, 2.0, 9.0);
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColor;
          varying float vOn;
          varying float vDist;
          ${fogGLSL}
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = (1.0 - smoothstep(0.1, 0.5, d)) * mix(0.06, 1.0, vOn);
            vec3 col = uColor * a * 3.0 * (1.0 - fogAmount(vDist));
            gl_FragColor = vec4(col, a);
            ${outputGLSL}
          }
        `
        }
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Failing neon signs                                                  */
/* ------------------------------------------------------------------ */

/**
 * Atlas of the Underworks signs. Top half: 8 vertical signs (128x512).
 * Bottom half: 8 horizontal signs (512x128). Glyphs are white; the shader tints them.
 */
function createUnderworksAtlas(): CanvasAtlas {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    const font = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
    const vertical = ["B4", "WIP", "404", "DEV", "BETA", "EXIT", "ALPHA", "ERR"];
    const horizontal = [
      "UNDER CONSTRUCTION",
      "AUTHORIZED ONLY",
      "WORK IN PROGRESS",
      "DANGER",
      "SECTOR B-04",
      "NO ENTRY",
      "BUILD 0.4.2",
      "COMPILING...",
    ];
    const frame = (x: number, y: number, w: number, h: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 5;
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = 8;
      ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
      ctx.restore();
    };
    for (let i = 0; i < 8; i++) {
      const x = i * 128;
      frame(x, 0, 128, 512);
      const chars = Array.from(vertical[i]);
      const step = Math.min(100, 430 / chars.length);
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 12;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.floor(step * 0.8)}px ${font}`;
      const startY = 256 - (step * (chars.length - 1)) / 2;
      chars.forEach((char, c) => ctx.fillText(char, x + 64, startY + c * step));
      ctx.restore();
    }
    for (let i = 0; i < 8; i++) {
      const x = (i % 2) * 512;
      const y = 512 + Math.floor(i / 2) * 128;
      frame(x, y, 512, 128);
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let fontSize = 62;
      ctx.font = `800 ${fontSize}px ${font}`;
      while (ctx.measureText(horizontal[i]).width > 446 && fontSize > 18) {
        fontSize -= 2;
        ctx.font = `800 ${fontSize}px ${font}`;
      }
      ctx.fillText(horizontal[i], x + 256, y + 66);
      ctx.restore();
    }
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}

function Signs({
  layout,
  tier,
  runtimeRef,
  active,
}: {
  layout: Layout;
  tier: Tier;
  runtimeRef: RefObject<Runtime | null>;
  active: boolean;
}) {
  const signRef = useRef<InstancedMesh>(null);
  const backRef = useRef<InstancedMesh>(null);
  const cableRef = useRef<InstancedMesh>(null);
  const activeRef = useActiveRef(active);
  const atlas = useMemo(() => createUnderworksAtlas(), []);
  useFontsReady(atlas);
  const count = layout.signs.length;
  const hangers = useMemo(() => layout.signs.filter((s) => s.hanging), [layout]);

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const rects = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 2);
    const power = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    power.setUsage(DynamicDrawUsage);
    layout.signs.forEach((s, i) => {
      rects.set(s.rect, i * 4);
      colors.set([s.color.r, s.color.g, s.color.b], i * 3);
      seeds.set([s.seed, s.broken], i * 2);
    });
    g.setAttribute("aRect", new InstancedBufferAttribute(rects, 4));
    g.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 2));
    g.setAttribute("aPower", power);
    return g;
  }, [layout, count]);
  useDisposable(geometry);
  const backGeometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const data = new Float32Array(count * 4);
    layout.signs.forEach((s, i) => data.set([s.seed, 0, 0, 0], i * 4));
    g.setAttribute("aData", new InstancedBufferAttribute(data, 4));
    return g;
  }, [layout, count]);
  useDisposable(backGeometry);
  const cableGeometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    g.setAttribute(
      "aData",
      new InstancedBufferAttribute(new Float32Array(hangers.length * 2 * 4), 4),
    );
    return g;
  }, [hangers.length]);
  useDisposable(cableGeometry);

  const writeSign = useMemo(
    () => (i: number, d: Object3D) => {
      const s = layout.signs[i];
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(0, s.rotY, 0);
      d.scale.set(s.w, s.h, 1);
    },
    [layout],
  );
  const writeBack = useMemo(
    () => (i: number, d: Object3D) => {
      const s = layout.signs[i];
      d.rotation.set(0, s.rotY, 0);
      d.position.set(s.x - Math.sin(s.rotY) * 0.16, s.y, s.z - Math.cos(s.rotY) * 0.16);
      d.scale.set(s.w + 0.25, s.h + 0.25, 0.3);
    },
    [layout],
  );
  const writeCable = useMemo(
    () => (i: number, d: Object3D) => {
      const s = hangers[Math.floor(i / 2)];
      const side = i % 2 === 0 ? -1 : 1;
      const top = s.y + s.h / 2 + 0.1;
      d.position.set(s.x + side * s.w * 0.38, (top + CEILING - 1.3) / 2, s.z - 0.16);
      d.scale.set(0.04, Math.max(0.1, CEILING - 1.3 - top), 0.04);
    },
    [hangers],
  );
  useInstanceMatrices(signRef, count, writeSign);
  useInstanceMatrices(backRef, count, writeBack);
  useInstanceMatrices(cableRef, hangers.length * 2, writeCable);

  const uniforms = useMemo(() => ({ ...shared, uAtlas: { value: atlas.texture } }), [atlas]);
  const backUniforms = useMemo(() => ({ ...shared }), []);

  useFrame(() => {
    const rt = runtimeRef.current;
    const mesh = signRef.current;
    if (!activeRef.current || !rt || !mesh) return;
    const attribute = mesh.geometry.getAttribute("aPower") as InstancedBufferAttribute;
    (attribute.array as Float32Array).set(rt.signPower);
    attribute.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={signRef} args={[geometry, undefined, count]} frustumCulled={false}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={
            /* glsl */ `
            attribute vec4 aRect;
            attribute vec3 aColor;
            attribute vec2 aSeed;
            attribute float aPower;
            varying vec2 vUv;
            varying vec2 vLocalUv;
            varying vec3 vColor;
            varying vec2 vSeed;
            varying float vPower;
            varying float vDist;
            varying float vVertical;
            void main() {
              vUv = aRect.xy + uv * aRect.zw;
              vLocalUv = uv;
              vColor = aColor;
              vSeed = aSeed;
              vPower = aPower;
              vVertical = step(aRect.z, 0.2);
              vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
              vDist = length(w.xyz - cameraPosition);
              gl_Position = projectionMatrix * viewMatrix * w;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform sampler2D uAtlas;
            uniform float uTime;
            varying vec2 vUv;
            varying vec2 vLocalUv;
            varying vec3 vColor;
            varying vec2 vSeed;
            varying float vPower;
            varying float vDist;
            varying float vVertical;
            ${fogGLSL}
            ${hashGLSL}
            void main() {
              float glyph = texture2D(uAtlas, vUv).r;
              // Broken signs: some stretches of tube are dead, a few still sputter
              float along = mix(vLocalUv.x, 1.0 - vLocalUv.y, vVertical);
              float segments = mix(14.0, 6.0, vVertical);
              float seg = floor(along * segments);
              float r = hash12(vec2(seg, vSeed.x * 91.0));
              float dead = step(1.0 - vSeed.y, r);
              float sputter = step(0.82, hash11(floor(uTime * 3.0) + r * 57.0)) * step(0.6, r);
              float on = vPower * mix(1.0, sputter * 0.7, dead);
              vec3 lit = vColor * glyph * 3.4 * on;
              // Unlit glass tube: you can still read a dead sign up close
              vec3 dark = (vColor * 0.06 + vec3(0.03)) * glyph;
              vec3 col = max(lit, dark) + vColor * 0.02 * vPower;
              col = applyFog(col, vDist);
              gl_FragColor = vec4(col, 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </instancedMesh>
      <instancedMesh ref={backRef} args={[backGeometry, undefined, count]} frustumCulled={false}>
        <shaderMaterial
          uniforms={backUniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={metalFragment}
        />
      </instancedMesh>
      <instancedMesh
        ref={cableRef}
        args={[cableGeometry, undefined, hangers.length * 2]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={backUniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={metalFragment}
        />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Neon tubes                                                          */
/* ------------------------------------------------------------------ */

function Tubes({
  layout,
  runtimeRef,
  active,
}: {
  layout: Layout;
  runtimeRef: RefObject<Runtime | null>;
  active: boolean;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const activeRef = useActiveRef(active);
  const count = layout.tubes.length;
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const power = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    power.setUsage(DynamicDrawUsage);
    layout.tubes.forEach((t, i) => {
      colors.set([t.color.r, t.color.g, t.color.b], i * 3);
      seeds[i] = t.seed;
    });
    g.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
    g.setAttribute("aPower", power);
    return g;
  }, [layout, count]);
  useDisposable(geometry);
  const write = useMemo(
    () => (i: number, d: Object3D) => {
      const t = layout.tubes[i];
      d.position.set(t.x, t.y, t.z);
      d.scale.set(t.sx, t.sy, t.sz);
    },
    [layout],
  );
  useInstanceMatrices(meshRef, count, write);
  const uniforms = useMemo(() => ({ ...shared }), []);

  useFrame(() => {
    const rt = runtimeRef.current;
    const mesh = meshRef.current;
    if (!activeRef.current || !rt || !mesh) return;
    const attribute = mesh.geometry.getAttribute("aPower") as InstancedBufferAttribute;
    (attribute.array as Float32Array).set(rt.tubePower);
    attribute.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          attribute vec3 aColor;
          attribute float aSeed;
          attribute float aPower;
          varying vec3 vColor;
          varying float vSeed;
          varying float vPower;
          varying float vAlong;
          varying float vDist;
          void main() {
            vColor = aColor;
            vSeed = aSeed;
            vPower = aPower;
            // Position along the tube's longest side, 0..1
            vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vAlong = (s.y > s.z ? position.y : position.z) + 0.5;
            vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vDist = length(w.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          varying vec3 vColor;
          varying float vSeed;
          varying float vPower;
          varying float vAlong;
          varying float vDist;
          ${fogGLSL}
          void main() {
            // Blackened ends, and on some tubes a dead stretch where the gas gave out
            float ends = smoothstep(0.0, 0.04, vAlong) * (1.0 - smoothstep(0.96, 1.0, vAlong));
            float deadEnd = step(0.7, vSeed) * smoothstep(0.78, 0.84, fract(vAlong + vSeed * 3.0));
            float glow = vPower * ends * (1.0 - deadEnd);
            vec3 col = vColor * (glow * 3.2 + 0.04);
            col = applyFog(col, vDist);
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Work lamps                                                          */
/* ------------------------------------------------------------------ */

const CONE_LENGTH = LAMP_PIVOT - LAMP_DROP - 0.4;

function Lamps({
  layout,
  tier,
  runtimeRef,
  active,
}: {
  layout: Layout;
  tier: Tier;
  runtimeRef: RefObject<Runtime | null>;
  active: boolean;
}) {
  const housingRef = useRef<InstancedMesh>(null);
  const bulbRef = useRef<InstancedMesh>(null);
  const coneRef = useRef<InstancedMesh>(null);
  const cableRef = useRef<InstancedMesh>(null);
  const activeRef = useActiveRef(active);
  const count = layout.lamps.length;

  const geometries = useMemo(() => {
    const power = () => {
      const a = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    const housing = new BoxGeometry(1, 1, 1);
    housing.setAttribute("aData", new InstancedBufferAttribute(new Float32Array(count * 4), 4));
    const cable = new BoxGeometry(1, 1, 1);
    cable.setAttribute("aData", new InstancedBufferAttribute(new Float32Array(count * 4), 4));
    const bulb = new SphereGeometry(0.24, 12, 8);
    bulb.setAttribute("aPower", power());
    // Open cone with its tip at the origin, widening downwards
    const cone = new ConeGeometry(5.2, CONE_LENGTH, 40, 1, true);
    cone.translate(0, -CONE_LENGTH / 2, 0);
    cone.setAttribute("aPower", power());
    return { housing, cable, bulb, cone };
  }, [count]);
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries]);

  const placeAll = useMemo(() => {
    const dummy = new Object3D();
    const point = new Vector3();
    return (rt: Runtime | null) => {
      const housing = housingRef.current;
      const bulb = bulbRef.current;
      const cone = coneRef.current;
      const cable = cableRef.current;
      if (!housing || !bulb || !cone || !cable) return;
      layout.lamps.forEach((l, i) => {
        const angle = rt ? rt.lampAngle[i] : 0;
        lampPoint(l, angle, LAMP_DROP, point);
        dummy.position.copy(point);
        dummy.rotation.set(0, 0, angle);
        dummy.scale.set(1.15, 0.42, 0.75);
        dummy.updateMatrix();
        housing.setMatrixAt(i, dummy.matrix);
        lampPoint(l, angle, LAMP_DROP + 0.28, point);
        dummy.position.copy(point);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bulb.setMatrixAt(i, dummy.matrix);
        lampPoint(l, angle, LAMP_DROP + 0.36, point);
        dummy.position.copy(point);
        dummy.updateMatrix();
        cone.setMatrixAt(i, dummy.matrix);
        lampPoint(l, angle, LAMP_DROP / 2, point);
        dummy.position.copy(point);
        dummy.scale.set(0.035, LAMP_DROP, 0.035);
        dummy.updateMatrix();
        cable.setMatrixAt(i, dummy.matrix);
      });
      housing.instanceMatrix.needsUpdate = true;
      bulb.instanceMatrix.needsUpdate = true;
      cone.instanceMatrix.needsUpdate = true;
      cable.instanceMatrix.needsUpdate = true;
    };
  }, [layout]);

  useLayoutEffect(() => placeAll(null), [placeAll]);

  useFrame(() => {
    const rt = runtimeRef.current;
    if (!activeRef.current || !rt) return;
    if (layout.lamps.some((l) => l.swing > 0)) placeAll(rt);
    for (const mesh of [bulbRef.current, coneRef.current]) {
      if (!mesh) continue;
      const attribute = mesh.geometry.getAttribute("aPower") as InstancedBufferAttribute;
      (attribute.array as Float32Array).set(rt.lampPower);
      attribute.needsUpdate = true;
    }
  });

  const uniforms = useMemo(() => ({ ...shared, uColor: { value: SODIUM } }), []);

  return (
    <group>
      <instancedMesh
        ref={housingRef}
        args={[geometries.housing, undefined, count]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={metalFragment}
        />
      </instancedMesh>
      <instancedMesh
        ref={cableRef}
        args={[geometries.cable, undefined, count]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={metalFragment}
        />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[geometries.bulb, undefined, count]} frustumCulled={false}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={
            /* glsl */ `
            attribute float aPower;
            varying float vPower;
            varying float vDist;
            void main() {
              vPower = aPower;
              vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
              vDist = length(w.xyz - cameraPosition);
              gl_Position = projectionMatrix * viewMatrix * w;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            varying float vPower;
            varying float vDist;
            ${fogGLSL}
            void main() {
              vec3 col = uColor * (vPower * 6.0 + 0.05);
              col = applyFog(col, vDist * 0.8);
              gl_FragColor = vec4(col, 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </instancedMesh>
      <instancedMesh ref={coneRef} args={[geometries.cone, undefined, count]} frustumCulled={false}>
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            attribute float aPower;
            varying float vH;
            varying float vPower;
            varying vec3 vNormalV;
            varying vec3 vViewV;
            varying vec3 vWorld;
            void main() {
              vH = clamp(-position.y / ${CONE_LENGTH.toFixed(2)}, 0.0, 1.0);
              vPower = aPower;
              vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
              vWorld = w.xyz;
              vec4 mv = viewMatrix * w;
              vNormalV = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
              vViewV = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            uniform float uTime;
            varying float vH;
            varying float vPower;
            varying vec3 vNormalV;
            varying vec3 vViewV;
            varying vec3 vWorld;
            ${fogGLSL}
            ${simplexGLSL}
            void main() {
              float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
              float dust = 0.55 + 0.45 * snoise(vWorld * 0.4 + vec3(0.0, -uTime * 0.2, uTime * 0.07));
              float shape = smoothstep(0.0, 0.1, vH) * (1.0 - smoothstep(0.7, 1.0, vH));
              float a = pow(facing, 1.6) * shape * dust * 0.14 * vPower;
              vec3 col = uColor * a;
              col *= 1.0 - fogAmount(length(vWorld - cameraPosition));
              gl_FragColor = vec4(col, a);
              ${outputGLSL}
            }
          `
          }
        />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Rotating warning beacons                                            */
/* ------------------------------------------------------------------ */

const BEAM_LENGTH = 7;

function Beacons({
  layout,
  runtimeRef,
  active,
}: {
  layout: Layout;
  runtimeRef: RefObject<Runtime | null>;
  active: boolean;
}) {
  const domeRef = useRef<InstancedMesh>(null);
  const beamRef = useRef<InstancedMesh>(null);
  const activeRef = useActiveRef(active);
  const count = layout.beacons.length;
  const geometries = useMemo(() => {
    const dome = new SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    // A horizontal cone of light pointing along +x, tip at the origin
    const beam = new ConeGeometry(1.5, BEAM_LENGTH, 24, 1, true);
    beam.translate(0, -BEAM_LENGTH / 2, 0);
    beam.rotateZ(Math.PI / 2);
    return { dome, beam };
  }, []);
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries]);

  const place = useMemo(() => {
    const dummy = new Object3D();
    return (rt: Runtime | null) => {
      const dome = domeRef.current;
      const beam = beamRef.current;
      if (!dome || !beam) return;
      layout.beacons.forEach((b, i) => {
        dummy.position.set(b.x, b.y + 0.35, b.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        dome.setMatrixAt(i, dummy.matrix);
        const angle = rt ? rt.beaconAngle[i] : b.phase;
        for (let k = 0; k < 2; k++) {
          dummy.position.set(b.x, b.y + 0.45, b.z);
          dummy.rotation.set(0, angle + k * Math.PI, 0);
          dummy.updateMatrix();
          beam.setMatrixAt(i * 2 + k, dummy.matrix);
        }
      });
      dome.instanceMatrix.needsUpdate = true;
      beam.instanceMatrix.needsUpdate = true;
    };
  }, [layout]);
  useLayoutEffect(() => place(null), [place]);
  useFrame(() => {
    if (!activeRef.current || !runtimeRef.current) return;
    place(runtimeRef.current);
  });

  const uniforms = useMemo(() => ({ ...shared, uColor: { value: RED } }), []);

  return (
    <group>
      <instancedMesh ref={domeRef} args={[geometries.dome, undefined, count]} frustumCulled={false}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={
            /* glsl */ `
            varying float vDist;
            void main() {
              vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
              vDist = length(w.xyz - cameraPosition);
              gl_Position = projectionMatrix * viewMatrix * w;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            varying float vDist;
            ${fogGLSL}
            void main() {
              gl_FragColor = vec4(applyFog(uColor * 4.0, vDist * 0.8), 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </instancedMesh>
      <instancedMesh
        ref={beamRef}
        args={[geometries.beam, undefined, count * 2]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            varying float vAlong;
            varying vec3 vNormalV;
            varying vec3 vViewV;
            varying vec3 vWorld;
            void main() {
              vec4 local = instanceMatrix * vec4(position, 1.0);
              vAlong = clamp(position.x / ${BEAM_LENGTH.toFixed(1)}, 0.0, 1.0);
              vec4 w = modelMatrix * local;
              vWorld = w.xyz;
              vec4 mv = viewMatrix * w;
              vNormalV = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
              vViewV = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            varying float vAlong;
            varying vec3 vNormalV;
            varying vec3 vViewV;
            varying vec3 vWorld;
            ${fogGLSL}
            void main() {
              float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
              float a = pow(facing, 2.0) * pow(1.0 - vAlong, 2.0) * 0.32;
              vec3 col = uColor * a * (1.0 - fogAmount(length(vWorld - cameraPosition)));
              gl_FragColor = vec4(col, a);
              ${outputGLSL}
            }
          `
          }
        />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Holographic builds (the projects under development)                 */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];

function towerLines(): number[] {
  const out: number[] = [];
  const seg = (a: V3, b: V3) => out.push(...a, ...b);
  const s = 2.2;
  const height = 9;
  const floors = 7;
  const corners: [number, number][] = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ];
  corners.forEach(([x, z]) => seg([x, 0, z], [x, height, z]));
  for (let f = 0; f <= floors; f++) {
    const y = (f * height) / floors;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      seg([ax, y, az], [bx, y, bz]);
    }
    // Inner core
    const k = 0.7;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      seg([ax * k * 0.45, y, az * k * 0.45], [bx * k * 0.45, y, bz * k * 0.45]);
    }
    if (f < floors) {
      const y1 = ((f + 1) * height) / floors;
      const flip = f % 2 === 0;
      seg([-s, y, flip ? -s : s], [-s, y1, flip ? s : -s]);
      seg([s, y, flip ? s : -s], [s, y1, flip ? -s : s]);
      seg([flip ? -s : s, y, s], [flip ? s : -s, y1, s]);
    }
  }
  // A crane jib on the roof
  seg([0, height, 0], [0, height + 2.4, 0]);
  seg([-1.4, height + 2.2, 0], [4.6, height + 2.2, 0]);
  seg([0, height + 2.4, 0], [4.6, height + 2.2, 0]);
  seg([0, height + 2.4, 0], [-1.4, height + 2.2, 0]);
  seg([3.6, height + 2.2, 0], [3.6, height - 0.8, 0]);
  return out;
}

function domeLines(): number[] {
  const edges = new EdgesGeometry(new IcosahedronGeometry(4.3, 1), 1);
  const position = edges.getAttribute("position");
  const out: number[] = [];
  for (let i = 0; i < position.count; i++) {
    out.push(position.getX(i), position.getY(i) + 5.2, position.getZ(i));
  }
  edges.dispose();
  // Support ring and legs
  const ring = 32;
  for (let i = 0; i < ring; i++) {
    const a0 = (i / ring) * Math.PI * 2;
    const a1 = ((i + 1) / ring) * Math.PI * 2;
    out.push(Math.cos(a0) * 3, 0.9, Math.sin(a0) * 3, Math.cos(a1) * 3, 0.9, Math.sin(a1) * 3);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    out.push(Math.cos(a) * 3, 0.9, Math.sin(a) * 3, Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6);
  }
  return out;
}

function gearLines(): number[] {
  const out: number[] = [];
  const teeth = 14;
  const outer = 3.9;
  const inner = 3.3;
  const depth = 0.6;
  const center = 5.2;
  const profile: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = (Math.PI * 2) / teeth;
    for (const [da, r] of [
      [0, inner],
      [w * 0.18, outer],
      [w * 0.5, outer],
      [w * 0.68, inner],
    ] as const) {
      profile.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
    }
  }
  for (const z of [-depth, depth]) {
    for (let i = 0; i < profile.length; i++) {
      const [ax, ay] = profile[i];
      const [bx, by] = profile[(i + 1) % profile.length];
      out.push(ax, ay + center, z, bx, by + center, z);
    }
  }
  profile.forEach(([x, y], i) => {
    if (i % 2 === 1) out.push(x, y + center, -depth, x, y + center, depth);
  });
  // Hub and spokes
  const hub = 24;
  for (let i = 0; i < hub; i++) {
    const a0 = (i / hub) * Math.PI * 2;
    const a1 = ((i + 1) / hub) * Math.PI * 2;
    out.push(
      Math.cos(a0) * 0.9,
      Math.sin(a0) * 0.9 + center,
      0,
      Math.cos(a1) * 0.9,
      Math.sin(a1) * 0.9 + center,
      0,
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    out.push(
      Math.cos(a) * 0.9,
      Math.sin(a) * 0.9 + center,
      0,
      Math.cos(a) * inner,
      Math.sin(a) * inner + center,
      0,
    );
  }
  return out;
}

function hologramGeometry(kind: StationDef["kind"]) {
  const lines = kind === "tower" ? towerLines() : kind === "dome" ? domeLines() : gearLines();
  const positions = new Float32Array(lines);
  const along = new Float32Array(positions.length / 3);
  for (let i = 0; i < along.length; i += 2) {
    const dx = positions[i * 3 + 3] - positions[i * 3];
    const dy = positions[i * 3 + 4] - positions[i * 3 + 1];
    const dz = positions[i * 3 + 5] - positions[i * 3 + 2];
    along[i] = 0;
    along[i + 1] = Math.hypot(dx, dy, dz);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("aAlong", new BufferAttribute(along, 1));
  return g;
}

const HOLO_HEIGHT: Record<StationDef["kind"], number> = { tower: 11.6, dome: 9.6, gear: 9.2 };

function Hologram({
  station,
  index,
  runtimeRef,
  active,
}: {
  station: StationDef;
  index: number;
  runtimeRef: RefObject<Runtime | null>;
  active: boolean;
}) {
  const lineRef = useRef<LineSegments>(null);
  const spinRef = useRef<Group>(null);
  const scanRef = useRef<Mesh>(null);
  const activeRef = useActiveRef(active);
  const geometry = useMemo(() => hologramGeometry(station.kind), [station.kind]);
  useDisposable(geometry);
  const height = HOLO_HEIGHT[station.kind];

  const uniforms = useMemo(
    () => ({
      ...shared,
      uColor: { value: CYAN },
      uBuild: { value: 1 },
      uFade: { value: 1 },
      uBase: { value: 0 },
      uHeight: { value: height },
    }),
    [height],
  );
  const scanUniforms = useMemo(
    () => ({ ...shared, uColor: { value: CYAN }, uFade: { value: 0 } }),
    [],
  );

  useFrame((_, delta) => {
    const rt = runtimeRef.current;
    const lines = lineRef.current;
    if (!activeRef.current || !rt || !lines) return;
    const material = lines.material as ShaderMaterial;
    const build = rt.build[index];
    material.uniforms.uBuild.value = build;
    material.uniforms.uFade.value = rt.fade[index];
    const spin = spinRef.current;
    if (spin && !world.reducedMotion) {
      if (station.kind === "dome") spin.rotation.y += delta * 0.12;
      if (station.kind === "gear") spin.rotation.z += delta * 0.18;
    }
    const scan = scanRef.current;
    if (scan) {
      scan.position.y = build * height;
      const visible = build > 0.002 && build < 0.998 ? 1 : 0;
      (scan.material as ShaderMaterial).uniforms.uFade.value = visible * rt.fade[index];
    }
  });

  const pivotY = station.kind === "tower" ? 0 : 5.2;

  return (
    <group position={[station.x, 0, station.z]}>
      <group ref={spinRef} position={[0, pivotY, 0]}>
        <lineSegments
          ref={lineRef}
          geometry={geometry}
          position={[0, -pivotY, 0]}
          frustumCulled={false}
        >
          <shaderMaterial
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            vertexShader={
              /* glsl */ `
              uniform float uBase;
              uniform float uHeight;
              uniform float uGlitch;
              uniform float uTime;
              attribute float aAlong;
              varying float vH;
              varying float vAlong;
              varying float vDist;
              ${hashGLSL}
              void main() {
                vec4 w = modelMatrix * vec4(position, 1.0);
                // When the power dips the hologram tears into slices
                float slice = floor(w.y * 2.5);
                w.x += uGlitch * (hash11(slice + floor(uTime * 14.0) * 7.0) - 0.5) * 1.4;
                vH = (w.y - uBase) / uHeight;
                vAlong = aAlong;
                vec4 mv = viewMatrix * w;
                vDist = -mv.z;
                gl_Position = projectionMatrix * mv;
              }
            `
            }
            fragmentShader={
              /* glsl */ `
              uniform vec3 uColor;
              uniform float uBuild;
              uniform float uFade;
              uniform float uTime;
              varying float vH;
              varying float vAlong;
              varying float vDist;
              ${fogGLSL}
              void main() {
                float built = 1.0 - smoothstep(uBuild - 0.004, uBuild + 0.004, vH);
                float front = exp(-abs(vH - uBuild) * 70.0) * step(0.002, uBuild) * step(uBuild, 0.998);
                float dash = step(0.55, fract(vAlong * 2.4 - uTime * 0.4));
                float ghost = (1.0 - built) * dash * 0.14;
                float scan = 0.8 + 0.2 * sin(vH * 140.0 - uTime * 7.0);
                vec3 col = uColor * (built * 1.1 * scan + front * 4.5 + ghost) * uFade;
                col *= 1.0 - fogAmount(vDist);
                gl_FragColor = vec4(col, 1.0);
                ${outputGLSL}
              }
            `
            }
          />
        </lineSegments>
      </group>
      {/* Scanning plane at the build front */}
      <mesh ref={scanRef} rotation-x={-Math.PI / 2} frustumCulled={false}>
        <planeGeometry args={[station.kind === "tower" ? 6 : 9, station.kind === "gear" ? 3 : 9]} />
        <shaderMaterial
          uniforms={scanUniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            varying vec2 vUv;
            varying float vDist;
            void main() {
              vUv = uv;
              vec4 w = modelMatrix * vec4(position, 1.0);
              vDist = length(w.xyz - cameraPosition);
              gl_Position = projectionMatrix * viewMatrix * w;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            uniform float uFade;
            uniform float uTime;
            varying vec2 vUv;
            varying float vDist;
            ${fogGLSL}
            void main() {
              vec2 e = min(vUv, 1.0 - vUv);
              float edge = 1.0 - smoothstep(0.0, 0.04, min(e.x, e.y));
              float grid = step(0.92, fract(vUv.x * 18.0)) + step(0.92, fract(vUv.y * 18.0 + uTime * 0.5));
              float a = (edge * 0.9 + grid * 0.12 + 0.05) * uFade;
              vec3 col = uColor * a * (1.0 - fogAmount(vDist));
              gl_FragColor = vec4(col, a);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      {/* Projector pad on the floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} frustumCulled={false}>
        <circleGeometry args={[3.6, 48]} />
        <shaderMaterial
          uniforms={scanUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            varying vec2 vLocal;
            varying float vDist;
            void main() {
              vLocal = position.xy;
              vec4 w = modelMatrix * vec4(position, 1.0);
              vDist = length(w.xyz - cameraPosition);
              gl_Position = projectionMatrix * viewMatrix * w;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            uniform float uTime;
            varying vec2 vLocal;
            varying float vDist;
            ${fogGLSL}
            void main() {
              float r = length(vLocal);
              float rings = exp(-abs(r - 3.4) * 12.0) + exp(-abs(r - 2.2) * 16.0) * 0.6;
              float sweep = fract(atan(vLocal.y, vLocal.x) / 6.2831853 + uTime * 0.15);
              float a = rings * (0.35 + 0.65 * smoothstep(0.6, 1.0, sweep)) * 0.9;
              vec3 col = uColor * a * (1.0 - fogAmount(vDist));
              gl_FragColor = vec4(col, a);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Welding sparks                                                      */
/* ------------------------------------------------------------------ */

function Sparks({
  layout,
  tier,
  runtimeRef,
  active,
}: {
  layout: Layout;
  tier: Tier;
  runtimeRef: RefObject<Runtime | null>;
  active: boolean;
}) {
  const flashRef = useRef<InstancedMesh>(null);
  const activeRef = useActiveRef(active);
  const perWelder = tier === "high" ? 110 : 50;

  const geometry = useMemo(() => {
    const rnd = createRandom(808);
    const total = layout.welders.length * perWelder;
    const origin = new Float32Array(total * 2 * 3);
    const seed = new Float32Array(total * 2 * 4);
    const burst = new Float32Array(total * 2 * 3);
    const end = new Float32Array(total * 2);
    let v = 0;
    layout.welders.forEach((w) => {
      for (let i = 0; i < perWelder; i++) {
        const s = [rnd.next(), rnd.next(), rnd.next(), rnd.next()];
        for (let e = 0; e < 2; e++) {
          origin.set([w.x, w.y, w.z], v * 3);
          seed.set(s, v * 4);
          burst.set([w.period, w.phase, w.duty], v * 3);
          end[v] = e;
          v++;
        }
      }
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(origin, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 4));
    g.setAttribute("aBurst", new BufferAttribute(burst, 3));
    g.setAttribute("aEnd", new BufferAttribute(end, 1));
    return g;
  }, [layout, perWelder]);
  useDisposable(geometry);

  const flashGeometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const power = new InstancedBufferAttribute(new Float32Array(layout.welders.length), 1);
    power.setUsage(DynamicDrawUsage);
    g.setAttribute("aPower", power);
    return g;
  }, [layout]);
  useDisposable(flashGeometry);
  const writeFlash = useMemo(
    () => (i: number, d: Object3D) => {
      const w = layout.welders[i];
      d.position.set(w.x, w.y, w.z);
    },
    [layout],
  );
  useInstanceMatrices(flashRef, layout.welders.length, writeFlash);

  useFrame(() => {
    const rt = runtimeRef.current;
    const mesh = flashRef.current;
    if (!activeRef.current || !rt || !mesh) return;
    const attribute = mesh.geometry.getAttribute("aPower") as InstancedBufferAttribute;
    (attribute.array as Float32Array).set(rt.arcPower);
    attribute.needsUpdate = true;
  });

  const uniforms = useMemo(() => ({ ...shared, uEnabled: { value: 1 } }), []);
  const flashUniforms = useMemo(() => ({ ...shared, uColor: { value: ARC } }), []);

  return (
    <group>
      <lineSegments geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            uniform float uTime;
            attribute vec4 aSeed;
            attribute vec3 aBurst;
            attribute float aEnd;
            varying float vHeat;
            varying float vAlpha;
            varying float vDist;
            void main() {
              float life = 0.6 + aSeed.w * 1.0;
              float age = mod(uTime + aSeed.x * life, life);
              float born = uTime - age;
              // Only sparks born while the welder was firing exist
              float firing = step(fract(born / aBurst.x + aBurst.y), aBurst.z);
              float ang = aSeed.z * 6.2831853;
              float speed = 2.0 + aSeed.y * 5.0;
              vec3 v0 = vec3(cos(ang), mix(-0.4, 0.9, aSeed.y), sin(ang)) * speed;
              float t = max(age - aEnd * 0.03, 0.0);
              vec3 p = position + v0 * t + vec3(0.0, -4.9, 0.0) * t * t;
              float alive = step(0.02, p.y);
              p.y = max(p.y, 0.02);
              vHeat = 1.0 - age / life;
              vAlpha = firing * alive * (uTime > 0.0 ? 1.0 : 0.0);
              vec4 mv = viewMatrix * vec4(p, 1.0);
              vDist = -mv.z;
              gl_Position = projectionMatrix * mv;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            varying float vHeat;
            varying float vAlpha;
            varying float vDist;
            ${fogGLSL}
            void main() {
              vec3 hot = vec3(1.0, 0.92, 0.65);
              vec3 cool = vec3(1.0, 0.32, 0.05);
              vec3 col = mix(cool, hot, vHeat) * (1.0 + vHeat * 3.0) * vAlpha;
              col *= 1.0 - fogAmount(vDist);
              gl_FragColor = vec4(col, vAlpha);
              ${outputGLSL}
            }
          `
          }
        />
      </lineSegments>
      <instancedMesh
        ref={flashRef}
        args={[flashGeometry, undefined, layout.welders.length]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={flashUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            attribute float aPower;
            varying vec2 vUv;
            varying float vPower;
            varying float vDist;
            void main() {
              vUv = uv;
              vPower = aPower;
              // Billboard: always face the camera
              vec4 center = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
              center.xy += position.xy * 2.2;
              vDist = -center.z;
              gl_Position = projectionMatrix * center;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            varying vec2 vUv;
            varying float vPower;
            varying float vDist;
            ${fogGLSL}
            void main() {
              float d = length(vUv - 0.5) * 2.0;
              float core = exp(-d * d * 60.0) * 6.0 + exp(-d * 5.0) * 0.6;
              float a = core * vPower * (1.0 - smoothstep(0.85, 1.0, d));
              vec3 col = uColor * a * (1.0 - fogAmount(vDist));
              gl_FragColor = vec4(col, a);
              ${outputGLSL}
            }
          `
          }
        />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Dust, drips and light shafts from the city above                    */
/* ------------------------------------------------------------------ */

function Dust({ tier }: { tier: Tier }) {
  const count = tier === "high" ? 1800 : 700;
  const geometry = useMemo(() => {
    const rnd = createRandom(66);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++)
      seeds.set([rnd.next(), rnd.next(), rnd.next(), rnd.next()], i * 4);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    return g;
  }, [count]);
  useDisposable(geometry);
  const uniforms = useMemo(() => ({ ...shared }), []);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        defines={lightDefines(tier)}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          attribute vec4 aSeed;
          varying vec3 vColor;
          varying float vAlpha;
          ${lightsGLSL}
          ${fogGLSL}
          void main() {
            vec3 box = vec3(40.0, 18.0, 64.0);
            vec3 p = aSeed.xyz * box;
            p += vec3(sin(uTime * 0.13 + aSeed.w * 30.0) * 1.5, -uTime * (0.08 + aSeed.w * 0.12), cos(uTime * 0.11 + aSeed.w * 21.0) * 1.5);
            vec3 origin = vec3(cameraPosition.x - box.x * 0.5, 0.3, cameraPosition.z - box.z * 0.8);
            vec3 local = mod(p - origin, box);
            vec3 worldPos = origin + local;
            float edge = smoothstep(0.0, 3.0, local.x) * (1.0 - smoothstep(box.x - 3.0, box.x, local.x))
                       * smoothstep(0.0, 4.0, local.z) * (1.0 - smoothstep(box.z - 4.0, box.z, local.z));
            // Dust is only visible where light hits it
            vec3 lit = airLight(worldPos);
            vec4 mv = viewMatrix * vec4(worldPos, 1.0);
            float dist = -mv.z;
            vColor = lit * 0.55 + vec3(0.006);
            vAlpha = edge * (1.0 - fogAmount(dist)) * (0.35 + aSeed.w * 0.65);
            gl_PointSize = clamp(34.0 / dist, 1.0, 4.0);
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
            gl_FragColor = vec4(vColor * a, a);
            ${outputGLSL}
          }
        `
        }
      />
    </points>
  );
}

function Drips({ layout, tier }: { layout: Layout; tier: Tier }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(layout.drips.length * 2 * 3);
    const data = new Float32Array(layout.drips.length * 2 * 3);
    layout.drips.forEach((d, i) => {
      for (let e = 0; e < 2; e++) {
        positions.set([d.x, 0, d.z], (i * 2 + e) * 3);
        data.set([d.period, d.phase, e], (i * 2 + e) * 3);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aDrip", new BufferAttribute(data, 3));
    return g;
  }, [layout]);
  useDisposable(geometry);
  const uniforms = useMemo(() => ({ ...shared }), []);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        defines={lightDefines(tier)}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          attribute vec3 aDrip;
          varying vec3 vColor;
          ${lightsGLSL}
          ${fogGLSL}
          void main() {
            float t = mod(uTime + aDrip.y, aDrip.x);
            float y = ${CEILING.toFixed(1)} - 4.9 * t * t;
            vec3 p = vec3(position.x, max(y, 0.0) + aDrip.z * 0.35, position.z);
            float visible = step(0.0, y) * step(0.001, uTime);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            vColor = (airLight(p) * 0.6 + vec3(0.02)) * visible * (1.0 - fogAmount(-mv.z));
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          varying vec3 vColor;
          void main() {
            gl_FragColor = vec4(vColor, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </lineSegments>
  );
}

/** Work floodlights on tripods, aimed at the tunnel mouth (seen from behind). */
function Floodlights({ layout, tier }: { layout: Layout; tier: Tier }) {
  const meshRef = useRef<InstancedMesh>(null);
  const parts = layout.floods.length * 6;
  const uniforms = useMemo(() => ({ ...shared }), []);
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    g.setAttribute("aData", new InstancedBufferAttribute(new Float32Array(parts * 4), 4));
    return g;
  }, [parts]);
  useDisposable(geometry);
  const write = useMemo(() => {
    const target = new Vector3();
    const dir = new Vector3();
    const q = new Quaternion();
    return (i: number, d: Object3D) => {
      const f = layout.floods[Math.floor(i / 6)];
      const part = i % 6;
      if (part === 0) {
        d.position.set(f.x, f.y / 2, f.z);
        d.scale.set(0.09, f.y, 0.09);
      } else if (part < 4) {
        // Tripod legs
        const a = (part / 3) * Math.PI * 2;
        const foot = new Vector3(f.x + Math.cos(a) * 1.1, 0, f.z + Math.sin(a) * 1.1);
        const top = new Vector3(f.x, 1.6, f.z);
        dir.subVectors(top, foot);
        d.position.addVectors(foot, top).multiplyScalar(0.5);
        q.setFromUnitVectors(UP, dir.clone().normalize());
        d.quaternion.copy(q);
        d.scale.set(0.06, dir.length(), 0.06);
      } else if (part === 4) {
        // Crossbar
        d.position.set(f.x, f.y, f.z);
        d.scale.set(1.6, 0.08, 0.08);
      } else {
        // Lamp head, turned towards the tunnel
        target.set(0, TUNNEL_Y - 2, PORTAL_Z);
        d.position.set(f.x, f.y + 0.35, f.z);
        d.lookAt(target);
        d.scale.set(1.3, 0.85, 0.5);
      }
    };
  }, [layout]);
  useInstanceMatrices(meshRef, parts, write);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, parts]} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        defines={lightDefines(tier)}
        vertexShader={instancedVertex}
        fragmentShader={metalFragment}
      />
    </instancedMesh>
  );
}

function Shafts({ layout }: { layout: Layout }) {
  const uniforms = useMemo(() => ({ ...shared, uColor: { value: COLD } }), []);
  return (
    <group>
      {layout.shafts.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh position={[0, CEILING / 2, 0]} frustumCulled={false}>
            <cylinderGeometry args={[1.5, 3.4, CEILING, 32, 1, true]} />
            <shaderMaterial
              uniforms={uniforms}
              transparent
              depthWrite={false}
              side={DoubleSide}
              blending={AdditiveBlending}
              vertexShader={
                /* glsl */ `
                varying vec3 vNormalV;
                varying vec3 vViewV;
                varying vec3 vWorld;
                void main() {
                  vec4 w = modelMatrix * vec4(position, 1.0);
                  vWorld = w.xyz;
                  vec4 mv = viewMatrix * w;
                  vNormalV = normalize(normalMatrix * normal);
                  vViewV = normalize(-mv.xyz);
                  gl_Position = projectionMatrix * mv;
                }
              `
              }
              fragmentShader={
                /* glsl */ `
                uniform vec3 uColor;
                uniform float uTime;
                varying vec3 vNormalV;
                varying vec3 vViewV;
                varying vec3 vWorld;
                ${fogGLSL}
                ${simplexGLSL}
                void main() {
                  float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
                  float dust = 0.5 + 0.5 * snoise(vWorld * 0.5 + vec3(0.0, uTime * 0.15, 0.0));
                  float h = vWorld.y / ${CEILING.toFixed(1)};
                  float a = pow(facing, 2.0) * dust * (0.25 + 0.75 * h) * 0.06;
                  vec3 col = uColor * a * (1.0 - fogAmount(length(vWorld - cameraPosition)));
                  gl_FragColor = vec4(col, a);
                  ${outputGLSL}
                }
              `
              }
            />
          </mesh>
          {/* The grate the light falls through */}
          <mesh position={[0, CEILING - 0.05, 0]} rotation-x={Math.PI / 2} frustumCulled={false}>
            <planeGeometry args={[3, 3]} />
            <shaderMaterial
              uniforms={uniforms}
              vertexShader={
                /* glsl */ `
                varying vec2 vUv;
                varying float vDist;
                void main() {
                  vUv = uv;
                  vec4 w = modelMatrix * vec4(position, 1.0);
                  vDist = length(w.xyz - cameraPosition);
                  gl_Position = projectionMatrix * viewMatrix * w;
                }
              `
              }
              fragmentShader={
                /* glsl */ `
                uniform vec3 uColor;
                varying vec2 vUv;
                varying float vDist;
                ${fogGLSL}
                void main() {
                  vec2 g = abs(fract(vUv * 8.0) - 0.5);
                  float bars = step(0.38, max(g.x, g.y));
                  vec3 col = mix(uColor * 1.6, vec3(0.01), bars);
                  gl_FragColor = vec4(applyFog(col, vDist), 1.0);
                  ${outputGLSL}
                }
              `
              }
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The tunnel and the boring machine at the end                        */
/* ------------------------------------------------------------------ */

function Tunnel({ tier }: { tier: Tier }) {
  const uniforms = useMemo(() => ({ ...shared }), []);
  const ribRef = useRef<InstancedMesh>(null);
  const ribCount = 12;
  const ribGeometry = useMemo(() => {
    const g = new TorusGeometry(TUNNEL_R - 0.15, 0.22, 6, 64);
    g.setAttribute("aData", new InstancedBufferAttribute(new Float32Array(ribCount * 4), 4));
    return g;
  }, []);
  useDisposable(ribGeometry);
  const writeRib = useMemo(
    () => (i: number, d: Object3D) => {
      d.position.set(0, TUNNEL_Y, PORTAL_Z - 6 - i * 6);
    },
    [],
  );
  useInstanceMatrices(ribRef, ribCount, writeRib);
  const length = PORTAL_Z - TBM_Z + 4;

  return (
    <group>
      <mesh
        position={[0, TUNNEL_Y, PORTAL_Z - length / 2]}
        rotation-x={Math.PI / 2}
        frustumCulled={false}
      >
        <cylinderGeometry args={[TUNNEL_R, TUNNEL_R, length, 64, 1, true]} />
        <shaderMaterial
          uniforms={uniforms}
          side={BackSide}
          defines={lightDefines(tier)}
          vertexShader={meshVertex}
          fragmentShader={
            /* glsl */ `
            varying vec3 vWorld;
            varying vec3 vNormalW;
            ${lightsGLSL}
            ${fogGLSL}
            ${hashGLSL}
            ${simplexGLSL}
            ${surfaceGLSL}
            void main() {
              vec3 n = -normalize(vNormalW);
              vec2 rel = vWorld.xy - vec2(0.0, ${TUNNEL_Y.toFixed(1)});
              float ang = atan(rel.x, rel.y);
              vec2 q = vec2(ang * ${TUNNEL_R.toFixed(1)}, vWorld.z);
              vec3 albedo = concreteAlbedo(q, 2.2) * 0.85;
              // Lining segments: rings every 1.6 m, staggered joints
              float ringJ = abs(fract(q.y / 1.6) - 0.5) * 1.6;
              float row = floor(q.y / 1.6);
              float joint = abs(fract(q.x / 5.2 + row * 0.5) - 0.5) * 5.2;
              float seams = 1.0 - smoothstep(0.02, 0.05, min(ringJ, joint));
              albedo *= 1.0 - seams * 0.6;
              vec3 col = albedo * (sceneLight(vWorld + n * 0.05, n) + AMBIENT);
              col = applyFog(col, length(vWorld - cameraPosition));
              gl_FragColor = vec4(col, 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      <instancedMesh ref={ribRef} args={[ribGeometry, undefined, ribCount]} frustumCulled={false}>
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={instancedVertex}
          fragmentShader={metalFragment}
        />
      </instancedMesh>
    </group>
  );
}

function BoringMachine({ tier, active }: { tier: Tier; active: boolean }) {
  const headRef = useRef<Mesh>(null);
  const activeRef = useActiveRef(active);
  const uniforms = useMemo(
    () => ({ ...shared, uRed: { value: RED }, uAmber: { value: AMBER } }),
    [],
  );
  useFrame((_, delta) => {
    if (!activeRef.current || !headRef.current || world.reducedMotion) return;
    headRef.current.rotation.z += delta * 0.06;
  });

  return (
    <group position={[0, TUNNEL_Y, TBM_Z]}>
      <mesh ref={headRef} frustumCulled={false}>
        <circleGeometry args={[TUNNEL_R - 0.35, 128]} />
        <shaderMaterial
          uniforms={uniforms}
          defines={lightDefines(tier)}
          vertexShader={meshVertex}
          fragmentShader={
            /* glsl */ `
            uniform vec3 uRed;
            uniform vec3 uAmber;
            uniform float uTime;
            varying vec3 vWorld;
            varying vec3 vLocal;
            ${lightsGLSL}
            ${fogGLSL}
            ${hashGLSL}
            ${simplexGLSL}
            const vec3 AMBIENT = vec3(0.011, 0.0095, 0.0105);
            void main() {
              vec2 q = vLocal.xy;
              float r = length(q);
              float a = atan(q.y, q.x);
              float sector = 6.2831853 / 6.0;
              float sa = (fract(a / sector + 0.5) - 0.5) * sector; // angle from the nearest spoke
              float spokeDist = abs(sa) * r;
              float spoke = 1.0 - smoothstep(0.42, 0.5, spokeDist);
              float rings = (1.0 - smoothstep(0.12, 0.2, abs(r - 3.2))) + (1.0 - smoothstep(0.12, 0.2, abs(r - 6.4)));
              // Cutter discs along the spokes
              float rr = clamp(floor((r - 1.6) / 1.2 + 0.5) * 1.2 + 1.6, 1.6, 8.8);
              float along = abs(r - rr);
              float cutter = (1.0 - smoothstep(0.26, 0.32, length(vec2(along, spokeDist)))) * step(1.2, r);
              // Openings for the spoil between the spokes
              float slot = step(4.6, r) * step(r, 8.6) * step(0.55, abs(sa) * 3.0) * step(abs(sa) * 3.0, 0.85);
              vec3 albedo = vec3(0.09, 0.085, 0.08) * (0.8 + 0.2 * snoise(q * 1.3));
              albedo = mix(albedo, vec3(0.2, 0.19, 0.18), max(spoke, rings));
              albedo = mix(albedo, vec3(0.42, 0.4, 0.37), cutter);
              albedo *= 1.0 - slot * 0.85;
              vec3 n = vec3(0.0, 0.0, 1.0);
              vec3 col = albedo * (sceneLight(vWorld + n * 0.1, n) + AMBIENT);
              // Glowing hub and a ring of amber running lights at the rim
              float pulse = 0.75 + 0.25 * sin(uTime * 1.3);
              col += uRed * (1.0 - smoothstep(0.6, 1.25, r)) * 4.0 * pulse;
              col += uRed * slot * 0.05 * pulse;
              float rimLights = (1.0 - smoothstep(0.08, 0.16, abs(r - 9.25))) * step(0.5, fract(a / 6.2831853 * 36.0 - uTime * 0.6));
              col += uAmber * rimLights * 2.5;
              col = applyFog(col, length(vWorld - cameraPosition) * 0.8);
              gl_FragColor = vec4(col, 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      <DeepGlow />
    </group>
  );
}

/** A huge, faint red glow around the machine, visible from the far end of the hall. */
function DeepGlow() {
  const uniforms = useMemo(() => ({ ...shared, uColor: { value: RED } }), []);
  return (
    <mesh position={[0, 0, 5]} frustumCulled={false}>
      <planeGeometry args={[46, 46]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          varying vec2 vUv;
          varying float vDist;
          void main() {
            vUv = uv;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vDist = length(w.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColor;
          uniform float uTime;
          varying vec2 vUv;
          varying float vDist;
          ${fogGLSL}
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float glow = exp(-d * 3.2) * (1.0 - smoothstep(0.7, 1.0, d));
            float pulse = 0.8 + 0.2 * sin(uTime * 1.3);
            // Fog only partly hides it, so the end of the hall always glows a little
            float vis = 1.0 - fogAmount(vDist) * 0.9;
            vec3 col = uColor * glow * 0.9 * pulse * vis;
            gl_FragColor = vec4(col, glow);
            ${outputGLSL}
          }
        `
        }
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export default function UnderworksScene({ active, tier }: SceneProps) {
  const layout = useMemo(() => generateLayout(tier), [tier]);
  const runtimeRef = useRef<Runtime | null>(null);

  return (
    <group visible={active}>
      <Controller layout={layout} tier={tier} active={active} runtimeRef={runtimeRef} />
      <Floor layout={layout} tier={tier} />
      <Walls tier={tier} />
      <Ceiling layout={layout} tier={tier} />
      <Pillars layout={layout} tier={tier} />
      <Rebar layout={layout} tier={tier} />
      <Scaffolding layout={layout} tier={tier} />
      <Tape layout={layout} tier={tier} />
      <Blinkers layout={layout} />
      <Signs layout={layout} tier={tier} runtimeRef={runtimeRef} active={active} />
      <Tubes layout={layout} runtimeRef={runtimeRef} active={active} />
      <Lamps layout={layout} tier={tier} runtimeRef={runtimeRef} active={active} />
      <Beacons layout={layout} runtimeRef={runtimeRef} active={active} />
      {layout.stations.map((station, i) => (
        <Hologram
          key={station.kind}
          station={station}
          index={i}
          runtimeRef={runtimeRef}
          active={active}
        />
      ))}
      <Sparks layout={layout} tier={tier} runtimeRef={runtimeRef} active={active} />
      <Dust tier={tier} />
      {tier === "high" && <Drips layout={layout} tier={tier} />}
      <Shafts layout={layout} />
      <Floodlights layout={layout} tier={tier} />
      <Tunnel tier={tier} />
      <BoringMachine tier={tier} active={active} />
    </group>
  );
}
