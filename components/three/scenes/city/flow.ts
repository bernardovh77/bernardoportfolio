import { SHIP_POSITION } from "@/lib/car/ship";

/**
 * Riding the sky taxi, the ship stays put and the Megacity flows past it,
 * like the desert highway does under the car. The avenue is ten blocks long,
 * so the blocks that pass behind the ship come around again far ahead,
 * rising out of the haze where the avenue meets the horizon.
 * The landmark tower and the far skyline stay where they are (like the desert's sun).
 */

/** The avenue's blocks: 26 long, with 9-wide cross streets, the first one starting at z = 34. */
export const BLOCK_LENGTH = 26;
export const CROSS_STREET = 9;
export const BLOCK_PITCH = BLOCK_LENGTH + CROSS_STREET;
export const FIRST_BLOCK = 34;
export const BLOCK_COUNT = 10;

/** One full loop of the avenue. */
export const FLOW_SPAN = BLOCK_COUNT * BLOCK_PITCH;
/** Blocks come back this far ahead of the ship (deep in the haze)... */
export const FLOW_START = SHIP_POSITION.z - 290;
/** ...and rise out of the street over this distance. */
export const FLOW_RISE = 55;
/** Anchor of things that never move (the far skyline, the landmark tower). */
export const STATIC_ANCHOR = 10000;

/** Center of the block that starts at `z0` (its anchor: everything on a block moves with it). */
export function blockAnchor(z0: number) {
  return z0 - BLOCK_LENGTH / 2;
}

/**
 * GLSL: `cityFlow(anchor)` returns the z shift for something tied to a block and how
 * far that block has risen (1 = all the way up). Nothing moves unless uRide is 1.
 */
export const cityFlowGLSL = /* glsl */ `
uniform float uRide;
uniform float uTravel;
vec2 cityFlow(float anchor) {
  if (uRide < 0.5 || anchor > ${(STATIC_ANCHOR / 2).toFixed(1)}) return vec2(0.0, 1.0);
  float z = ${FLOW_START.toFixed(1)} + mod(anchor + uTravel - ${FLOW_START.toFixed(1)}, ${FLOW_SPAN.toFixed(1)});
  return vec2(z - anchor, smoothstep(${FLOW_START.toFixed(1)}, ${(FLOW_START + FLOW_RISE).toFixed(1)}, z));
}
`;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** The same as `cityFlow` in GLSL, for objects moved from JavaScript. */
export function cityFlow(anchor: number, travel: number, riding: boolean) {
  if (!riding || anchor > STATIC_ANCHOR / 2) return { shift: 0, rise: 1 };
  const offset = (((anchor + travel - FLOW_START) % FLOW_SPAN) + FLOW_SPAN) % FLOW_SPAN;
  const z = FLOW_START + offset;
  return { shift: z - anchor, rise: smoothstep(FLOW_START, FLOW_START + FLOW_RISE, z) };
}

/** Shared state of a ride over the Megacity (written once per frame by the city scene). */
export type CityRide = {
  /** Riding the sky taxi right now */
  riding: boolean;
  /** Distance flown, world units */
  travel: number;
  /** Current speed, units per second */
  speed: number;
};
