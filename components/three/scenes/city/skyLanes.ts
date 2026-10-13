import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { SHIP_POSITION } from "@/lib/car/ship";
import { createRandom } from "@/lib/random";
import { PartBuilder } from "../../vehicle/builder";

/**
 * The sky traffic around the taxi: ships in lanes over the avenue (some at your
 * altitude, some just above or below) and more lanes over the rooftops.
 * Seen from the page the city's traffic is light streaks; these real ships only
 * show up while you ride.
 *
 * Everything is placed relative to the taxi, which stays put while the city flows
 * (see ./flow.ts): ships going your way at your speed hang in front of you,
 * faster ones pull away, oncoming ones rush past.
 */

/** [x, y, speed]: speed > 0 flies your way, < 0 comes toward you, 0 is your own lane (a convoy). */
export const SKY_LANES: [number, number, number][] = [
  [SHIP_POSITION.x, SHIP_POSITION.y, 0],
  // Same altitude, oncoming
  [2.7, SHIP_POSITION.y, -30],
  // Just above and to the left, a little faster: they overtake you slowly
  [-6.1, SHIP_POSITION.y + 4.6, 33],
  // Below and to the right, oncoming
  [5.8, SHIP_POSITION.y - 4.8, -26],
  // Above, a little slower: you catch up and pass under them
  [1.3, SHIP_POSITION.y + 8, 27],
  // Below and to the left, slower
  [-5.6, SHIP_POSITION.y - 5.4, 28],
  // Over the rooftops
  [-30, 64, 34],
  [27, 71, -30],
  [-44, 79, -28],
  [41, 57, 32],
];

/** Relative positions wrap around this window: from far ahead (in the haze) to well behind. */
export const SKY_AHEAD = 330;
export const SKY_SPAN = 600;

export type SkyTraffic = {
  /** Per ship: lane x, lane y, speed, phase (or distance ahead, in your own lane) */
  lanes: Float32Array;
  /** Per ship: model (0 dart, 1 hauler), paint, engine color, seed */
  looks: Float32Array;
  count: number;
};

/** All the ships, and the subset for each model. */
export function skyTraffic(tier: "high" | "low") {
  const rnd = createRandom(77);
  const lanes: number[] = [];
  const looks: number[] = [];
  SKY_LANES.forEach(([x, y, speed], laneIndex) => {
    const rooftops = Math.abs(x) > 20;
    const count = speed === 0 ? 6 : rooftops ? (tier === "high" ? 6 : 3) : tier === "high" ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const phase =
        speed === 0
          ? // Your convoy: spaced out ahead of you
            24 + i * 36 + rnd.range(-4, 4)
          : (i / count) * SKY_SPAN + rnd.range(0, SKY_SPAN / count / 2);
      lanes.push(x, y, speed, phase);
      // Haulers (taxis, vans) on the lower lanes, darts higher up and over the roofs
      const hauler = rooftops ? rnd.chance(0.3) : rnd.chance(laneIndex % 2 === 0 ? 0.45 : 0.6);
      looks.push(hauler ? 1 : 0, rnd.int(0, PAINTS.length - 1), rnd.int(0, 2), rnd.next());
    }
  });
  const all: SkyTraffic = { lanes: new Float32Array(lanes), looks: new Float32Array(looks), count: lanes.length / 4 };
  const pick = (model: number): SkyTraffic => {
    const l: number[] = [];
    const k: number[] = [];
    for (let i = 0; i < all.count; i++) {
      if (all.looks[i * 4] !== model) continue;
      l.push(...all.lanes.subarray(i * 4, i * 4 + 4));
      k.push(...all.looks.subarray(i * 4, i * 4 + 4));
    }
    return { lanes: new Float32Array(l), looks: new Float32Array(k), count: l.length / 4 };
  };
  return { all, darts: pick(0), haulers: pick(1) };
}

/** Hull paints, a nod to the colorful ships of No Man's Sky (linear-ish values, set in the shader). */
export const PAINTS = ["#d9cfba", "#e0702a", "#2c8f8a", "#b8323a", "#8aa2c4", "#e2b93a", "#3a3d4a", "#e8e6ee"];
/** Engine glows: cyan, magenta, amber. */
export const ENGINE_COLORS = ["#19f3ff", "#ff2bd1", "#ffa03a"];

/**
 * GLSL shared by the ship bodies and their glows: where a ship is, which way it faces
 * and how it banks, and turning a point of the model into world space.
 */
export const skyTrafficGLSL = /* glsl */ `
uniform float uTravel;
uniform float uTime;
attribute vec4 aLane;
attribute vec4 aLook;

// xyz: position, w: fade (0 at the ends of the loop)
vec4 shipPlace(out float facing, out float bank) {
  float seed = aLook.w;
  float z;
  float fade;
  facing = aLane.z < 0.0 ? -1.0 : 1.0;
  if (aLane.z == 0.0) {
    // Your lane: everyone cruises at your speed, keeping their gaps
    float ahead = aLane.w + sin(uTime * 0.21 + seed * 9.0) * 2.5;
    z = ${SHIP_POSITION.z.toFixed(1)} - ahead;
    fade = 1.0 - smoothstep(${(SKY_AHEAD - 90).toFixed(1)}, ${(SKY_AHEAD - 20).toFixed(1)}, ahead);
  } else {
    float offset = mod(aLane.w + uTravel - aLane.z * uTime, ${SKY_SPAN.toFixed(1)});
    z = ${(SHIP_POSITION.z - SKY_AHEAD).toFixed(1)} + offset;
    fade = smoothstep(0.0, 70.0, offset) * (1.0 - smoothstep(${(SKY_SPAN - 60).toFixed(1)}, ${SKY_SPAN.toFixed(1)}, offset));
  }
  // Hovering: a slow bob, a drift across the lane and a bank into it
  float drift = sin(uTime * 0.23 + seed * 17.0);
  vec3 p = vec3(aLane.x + drift * 0.5, aLane.y + sin(uTime * 0.9 + seed * 31.0) * 0.22, z);
  bank = -cos(uTime * 0.23 + seed * 17.0) * 0.07 * facing + sin(uTime * 1.3 + seed * 5.0) * 0.012;
  return vec4(p, fade);
}

// Model space (nose toward -z) to world space
vec3 shipToWorld(vec3 local, float facing, float bank, vec3 at) {
  if (facing < 0.0) local.xz = -local.xz;
  float c = cos(bank);
  float s = sin(bank);
  local.xy = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  return local + at;
}
vec3 shipNormal(vec3 n, float facing, float bank) {
  if (facing < 0.0) n.xz = -n.xz;
  float c = cos(bank);
  float s = sin(bank);
  return vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z);
}
`;

/** Parts of a traffic ship, decoded by its shader. */
export const SHIP_PART = { paint: 0, glass: 1, engine: 2, head: 3, trim: 4, tail: 5, nav: 6, neon: 7 } as const;

const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A closed ring of points around the hull at `z` (an elongated octagon), scaled. */
function hullRing(z: number, sx: number, sy: number, dy = 0) {
  const shape: [number, number][] = [
    [0, 0.5],
    [0.42, 0.36],
    [0.6, 0.08],
    [0.48, -0.18],
    [0, -0.3],
    [-0.48, -0.18],
    [-0.6, 0.08],
    [-0.42, 0.36],
    [0, 0.5],
  ];
  return shape.map(([x, y]) => v3(x * sx, y * sy + dy, z));
}

/** A flat plate (a wing, a fin) through four corners, `thickness` thick along `normal`. */
function plate(b: PartBuilder, corners: Vector3[], thickness: number, normal: Vector3) {
  const h = normal.clone().multiplyScalar(thickness / 2);
  const top = corners.map((c) => c.clone().add(h));
  const bottom = corners.map((c) => c.clone().sub(h));
  b.quad(top[0], top[1], top[2], top[3]);
  b.quad(bottom[3], bottom[2], bottom[1], bottom[0]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.quad(bottom[i], bottom[j], top[j], top[i]);
  }
}

/**
 * Dart: a small fighter, about 5.5 long with swept wings, twin engines and a bubble canopy.
 * Nose toward -z.
 */
export function buildDart() {
  const b = new PartBuilder();
  // Hull: painted top, dark belly
  const stations: [number, number, number, number][] = [
    [-2.75, 0.06, 0.06, 0.02],
    [-2.2, 0.42, 0.42, 0.02],
    [-1.3, 0.78, 0.8, 0.04],
    [-0.2, 0.98, 1.0, 0.06],
    [1.2, 0.98, 0.95, 0.05],
    [2.3, 0.8, 0.78, 0.04],
    [2.62, 0.7, 0.66, 0.04],
  ];
  const rings = stations.map(([z, sx, sy, dy]) => hullRing(z, sx, sy, dy));
  // Upper half (points 0..4 and 4..8 go over the top through the sides) painted, lower half trim
  const upper = rings.map((r) => [r[6], r[7], r[0], r[1], r[2]]);
  const lower = rings.map((r) => [r[2], r[3], r[4], r[5], r[6]]);
  b.paint("#ffffff", SHIP_PART.paint).loft(upper);
  b.paint("#2a2d38", SHIP_PART.trim).loft(lower);
  // Tail cap
  const tail = rings[rings.length - 1];
  b.paint("#1a1c24", SHIP_PART.trim);
  for (let i = 0; i < tail.length - 2; i++) b.tri(tail[0], tail[i + 1], tail[i + 2]);

  // Bubble canopy
  b.paint("#05070c", SHIP_PART.glass).extrude(
    [
      [-1.55, 0.36],
      [-1.15, 0.62],
      [-0.55, 0.74],
      [0.05, 0.66],
      [0.3, 0.46],
      [-1.55, 0.36],
    ],
    -0.32,
    0.32,
  );

  // Swept wings with a painted stripe and nav lights at the tips
  for (const side of [-1, 1]) {
    const root0 = v3(side * 0.5, 0.02, -0.2);
    const root1 = v3(side * 0.55, 0.02, 1.55);
    const tip1 = v3(side * 2.45, -0.06, 2.15);
    const tip0 = v3(side * 2.35, -0.06, 1.45);
    b.paint("#ffffff", SHIP_PART.paint);
    plate(b, side < 0 ? [root0, tip0, tip1, root1] : [root0, root1, tip1, tip0], 0.08, v3(0, 1, 0));
    // Dark leading edge
    b.paint("#1f222c", SHIP_PART.trim).beam(root0.clone().add(v3(0, 0.01, 0)), tip0.clone().add(v3(0, 0.01, 0)), 0.12, 0.09);
    // Nav light: red on the left, green on the right
    b.paint(side < 0 ? "#ff2a3a" : "#2bff8a", SHIP_PART.nav).box(v3(side * 2.47, -0.04, 1.8), 0.08, 0.08, 0.3);
  }

  // Twin fins
  for (const side of [-1, 1]) {
    b.paint("#ffffff", SHIP_PART.paint);
    plate(
      b,
      [v3(side * 0.34, 0.42, 1.2), v3(side * 0.36, 0.42, 2.45), v3(side * 0.62, 1.12, 2.7), v3(side * 0.56, 1.1, 2.05)],
      0.06,
      v3(1, 0, 0),
    );
  }

  // Engines: two nozzles at the back
  for (const side of [-1, 1]) {
    b.paint("#14161d", SHIP_PART.trim).cylinder(v3(side * 0.27, 0.08, 2.3), v3(side * 0.27, 0.08, 2.78), 0.21, 12);
    b.paint("#ffffff", SHIP_PART.engine).disc(v3(side * 0.27, 0.08, 2.76), v3(0, 0, 1), 0.17, 12);
  }
  // Headlights, tail lights and a neon line along the flanks
  b.paint("#fff4e0", SHIP_PART.head);
  b.box(v3(-0.26, -0.02, -2.18), 0.16, 0.05, 0.06);
  b.box(v3(0.26, -0.02, -2.18), 0.16, 0.05, 0.06);
  b.paint("#ff2340", SHIP_PART.tail);
  b.box(v3(-0.55, 0.28, 2.42), 0.06, 0.06, 0.12);
  b.box(v3(0.55, 0.28, 2.42), 0.06, 0.06, 0.12);
  b.paint("#ffffff", SHIP_PART.neon);
  b.box(v3(-0.6, 0.12, 0.4), 0.02, 0.03, 2.6);
  b.box(v3(0.6, 0.12, 0.4), 0.02, 0.03, 2.6);
  return b.build();
}

/**
 * Hauler: a chunky taxi-van with a glass cab up front, two engine pods on pylons
 * and a light on the roof. About 5 long. Nose toward -z.
 */
export function buildHauler() {
  const b = new PartBuilder();
  // Body: side profile [z, y] pulled across
  b.paint("#ffffff", SHIP_PART.paint).extrude(
    [
      [-2.35, -0.25],
      [-2.5, 0.12],
      [-2.2, 0.45],
      [-0.6, 0.98],
      [1.9, 1.0],
      [2.2, 0.82],
      [2.25, -0.2],
      [1.9, -0.42],
      [-2.0, -0.42],
      [-2.35, -0.25],
    ],
    -0.82,
    0.82,
  );
  // Cab glass: windshield and side windows
  b.paint("#05070c", SHIP_PART.glass);
  b.quad(v3(-0.72, 0.692, -1.503), v3(0.72, 0.692, -1.503), v3(0.68, 0.94, -0.753), v3(-0.68, 0.94, -0.753));
  for (const side of [-1, 1]) {
    const x = side * 0.825;
    b.quad(v3(x, 0.6, -1.1), v3(x, 0.6, 0.6), v3(x, 0.9, 0.6), v3(x, 0.92, -0.62));
  }
  // A dark band around the belly
  b.paint("#2a2d38", SHIP_PART.trim).box(v3(0, -0.3, -0.05), 1.7, 0.2, 4.1);
  // Roof light (a taxi, after all)
  b.paint("#1b1d26", SHIP_PART.trim).box(v3(0, 1.04, 0.3), 0.5, 0.08, 0.32);
  b.paint("#ffe94a", SHIP_PART.neon).box(v3(0, 1.13, 0.3), 0.42, 0.12, 0.24);

  // Engine pods on pylons, nozzles at the back, intakes at the front
  for (const side of [-1, 1]) {
    const x = side * 1.18;
    b.paint("#2a2d38", SHIP_PART.trim).beam(v3(side * 0.75, 0.1, 0.6), v3(x, 0.02, 0.6), 0.5, 0.12);
    b.paint("#ffffff", SHIP_PART.paint).cylinder(v3(x, 0.0, -0.75), v3(x, 0.0, 2.05), 0.34, 12);
    b.paint("#14161d", SHIP_PART.trim).cylinder(v3(x, 0.0, 2.05), v3(x, 0.0, 2.32), 0.3, 12);
    b.paint("#ffffff", SHIP_PART.engine).disc(v3(x, 0.0, 2.3), v3(0, 0, 1), 0.25, 12);
    // Intake ring and its dark mouth at the front
    b.paint("#14161d", SHIP_PART.trim).cylinder(v3(x, 0.0, -0.9), v3(x, 0.0, -0.75), 0.36, 12);
    b.paint("#07080c", SHIP_PART.trim).disc(v3(x, 0.0, -0.84), v3(0, 0, -1), 0.3, 12);
    // Nav light on each pod
    b.paint(side < 0 ? "#ff2a3a" : "#2bff8a", SHIP_PART.nav).box(v3(side * 1.53, 0.0, 0.2), 0.06, 0.08, 0.24);
  }
  // Headlights and tail lights
  b.paint("#fff4e0", SHIP_PART.head);
  b.box(v3(-0.5, 0.08, -2.47), 0.34, 0.07, 0.06);
  b.box(v3(0.5, 0.08, -2.47), 0.34, 0.07, 0.06);
  b.paint("#ff2340", SHIP_PART.tail);
  b.box(v3(0, 0.7, 2.24), 1.3, 0.06, 0.04);
  b.paint("#ffffff", SHIP_PART.neon);
  b.box(v3(-0.83, 0.3, 0.3), 0.02, 0.03, 3.4);
  b.box(v3(0.83, 0.3, 0.3), 0.02, 0.03, 3.4);
  return b.build();
}

/**
 * Glows that make a ship read from far away: exhaust plumes behind its two engines
 * (crossed quads), bright engine cores and headlight halos (camera-facing).
 * The shader places them per model (darts and haulers have their engines in different spots).
 */
export function buildShipGlow() {
  const positions: number[] = [];
  const corners: number[] = [];
  const parts: number[] = [];
  const sides: number[] = [];
  const index: number[] = [];
  const quad = (part: number, side: number) => {
    const base = positions.length / 3;
    for (const [u, v] of [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ]) {
      positions.push(0, 0, 0);
      corners.push(u, v);
      parts.push(part);
      sides.push(side);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const side of [-1, 1]) {
    // Plume, flat and upright
    quad(0, side);
    quad(1, side);
    // Engine core and headlight halo (billboards)
    quad(2, side);
    quad(3, side);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("aCorner", new BufferAttribute(new Float32Array(corners), 2));
  g.setAttribute("aPart", new BufferAttribute(new Float32Array(parts), 1));
  g.setAttribute("aSide", new BufferAttribute(new Float32Array(sides), 1));
  g.setIndex(index);
  return g;
}
