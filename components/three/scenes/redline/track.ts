import {
  CatmullRomCurve3,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Vector3,
} from "three";

/*
 * The circuit: a closed spline sampled once into a lookup table. The scene's
 * geometry is laid along it, the camera drives it, and the light trails read
 * the same table from a texture in their vertex shader.
 *
 * Distances along the track are `s` (0 .. TRACK_LENGTH, wrapping). The side
 * offset is positive to the right of the driving direction.
 */

/** Corners of the circuit seen from above (x, z), before scaling. */
const POINTS: [number, number][] = [
  [-330, 200],
  [-60, 200],
  [200, 198],
  [300, 170],
  [345, 100],
  [330, 20],
  [250, -20],
  [150, -60],
  [120, -140],
  [170, -220],
  [280, -250],
  [370, -320],
  [350, -420],
  [250, -440],
  [140, -380],
  [0, -320],
  [-170, -310],
  [-330, -350],
  [-440, -280],
  [-470, -130],
  [-430, 20],
  [-400, 150],
];
const SCALE = 0.6;

/** Samples in the lookup table (and the width of its texture). */
export const SAMPLES = 2048;
/** Half the width of the asphalt. */
export const HALF_WIDTH = 7;
/** Red and white kerbs run outside the asphalt in the corners. */
export const KERB_WIDTH = 1.7;
/** The barriers, measured from the center line. */
export const BARRIER = 17;
/** Where the start/finish line is. */
export const START_S = 190;

type Table = {
  length: number;
  /** x, y, z per sample */
  positions: Float32Array;
  /** Unit tangent (x, z) per sample */
  tangents: Float32Array;
  /** Signed curvature per sample, smoothed (positive bends right) */
  curvature: Float32Array;
  /** 0..1: how much kerb each sample gets (the corners) */
  kerb: Float32Array;
};

let table: Table | null = null;

function smooth(values: Float32Array, radius: number) {
  const out = new Float32Array(values.length);
  const n = values.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[(i + k + n) % n];
    out[i] = sum / (radius * 2 + 1);
  }
  return out;
}

function buildTable(): Table {
  const curve = new CatmullRomCurve3(
    POINTS.map(([x, z]) => new Vector3(x * SCALE, 0, z * SCALE)),
    true,
    "centripetal",
  );
  const length = curve.getLength();
  const points = curve.getSpacedPoints(SAMPLES);
  const positions = new Float32Array(SAMPLES * 3);
  const tangents = new Float32Array(SAMPLES * 2);
  for (let i = 0; i < SAMPLES; i++) {
    const p = points[i];
    positions.set([p.x, 0, p.z], i * 3);
    const a = points[(i - 1 + SAMPLES) % SAMPLES];
    const b = points[(i + 1) % SAMPLES];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    tangents.set([dx / len, dz / len], i * 2);
  }
  // Curvature from the turn of the tangent over a few samples
  const raw = new Float32Array(SAMPLES);
  const step = length / SAMPLES;
  for (let i = 0; i < SAMPLES; i++) {
    const a = (i - 4 + SAMPLES) % SAMPLES;
    const b = (i + 4) % SAMPLES;
    const ax = tangents[a * 2];
    const az = tangents[a * 2 + 1];
    const bx = tangents[b * 2];
    const bz = tangents[b * 2 + 1];
    const turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
    raw[i] = turn / (8 * step);
  }
  const curvature = smooth(raw, 6);
  // Kerbs where the track bends, starting a little before each corner and ending after it
  const wanted = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const k = Math.abs(curvature[i]);
    wanted[i] = Math.min(1, Math.max(0, (k - 1 / 110) / (1 / 60 - 1 / 110)));
  }
  const grown = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    let best = 0;
    for (let k = -14; k <= 14; k++) best = Math.max(best, wanted[(i + k + SAMPLES) % SAMPLES]);
    grown[i] = best;
  }
  const kerb = smooth(grown, 4).map((v) => (v > 0.5 ? 1 : v * 2));
  return { length, positions, tangents, curvature, kerb };
}

export function trackTable() {
  if (!table) table = buildTable();
  return table;
}

export const trackLength = () => trackTable().length;

/** Wraps a distance into 0 .. length. */
export function wrapS(s: number) {
  const length = trackLength();
  return ((s % length) + length) % length;
}

function lookup(s: number) {
  const t = trackTable();
  const u = (wrapS(s) / t.length) * SAMPLES;
  const i0 = Math.floor(u) % SAMPLES;
  return { t, i0, i1: (i0 + 1) % SAMPLES, f: u - Math.floor(u) };
}

/** Point on the center line at `s`, `side` to the right and `height` up. */
export function trackPoint(s: number, side: number, height: number, out: Vector3) {
  const { t, i0, i1, f } = lookup(s);
  const p = t.positions;
  const g = t.tangents;
  const x = p[i0 * 3] + (p[i1 * 3] - p[i0 * 3]) * f;
  const z = p[i0 * 3 + 2] + (p[i1 * 3 + 2] - p[i0 * 3 + 2]) * f;
  let tx = g[i0 * 2] + (g[i1 * 2] - g[i0 * 2]) * f;
  let tz = g[i0 * 2 + 1] + (g[i1 * 2 + 1] - g[i0 * 2 + 1]) * f;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  // Right of the driving direction is (-tz, tx)
  return out.set(x - tz * side, height, z + tx * side);
}

/** Unit tangent (direction of travel) at `s`. */
export function trackTangent(s: number, out: Vector3) {
  const { t, i0, i1, f } = lookup(s);
  const g = t.tangents;
  const tx = g[i0 * 2] + (g[i1 * 2] - g[i0 * 2]) * f;
  const tz = g[i0 * 2 + 1] + (g[i1 * 2 + 1] - g[i0 * 2 + 1]) * f;
  const len = Math.hypot(tx, tz) || 1;
  return out.set(tx / len, 0, tz / len);
}

/** Smoothed curvature at `s` (positive bends right). */
export function trackCurvature(s: number) {
  const { t, i0, i1, f } = lookup(s);
  return t.curvature[i0] + (t.curvature[i1] - t.curvature[i0]) * f;
}

/**
 * The lookup table as a float texture, read with texelFetch:
 * row 0 holds the position (x, y, z) and the curvature, row 1 the tangent (x, z) and the kerb.
 */
export function createTrackTexture() {
  const t = trackTable();
  const data = new Float32Array(SAMPLES * 2 * 4);
  for (let i = 0; i < SAMPLES; i++) {
    data.set([t.positions[i * 3], 0, t.positions[i * 3 + 2], t.curvature[i]], i * 4);
    data.set([t.tangents[i * 2], t.tangents[i * 2 + 1], t.kerb[i], 0], (SAMPLES + i) * 4);
  }
  const texture = new DataTexture(data, SAMPLES, 2, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** GLSL reading the same table (needs `uTrack`, `uTrackLength`). */
export const trackGLSL = /* glsl */ `
uniform sampler2D uTrack;
uniform float uTrackLength;
const float TRACK_SAMPLES = ${SAMPLES.toFixed(1)};

// Position on the center line at distance s, with the unit tangent (x, z)
vec3 trackAt(float s, out vec2 tangent) {
  float u = fract(s / uTrackLength) * TRACK_SAMPLES;
  float i0 = min(floor(u), TRACK_SAMPLES - 1.0);
  float f = clamp(u - i0, 0.0, 1.0);
  int a = int(i0);
  int b = int(mod(i0 + 1.0, TRACK_SAMPLES));
  vec4 p0 = texelFetch(uTrack, ivec2(a, 0), 0);
  vec4 p1 = texelFetch(uTrack, ivec2(b, 0), 0);
  vec4 t0 = texelFetch(uTrack, ivec2(a, 1), 0);
  vec4 t1 = texelFetch(uTrack, ivec2(b, 1), 0);
  vec2 t = mix(t0.xy, t1.xy, f);
  tangent = t / max(length(t), 1e-5);
  return mix(p0.xyz, p1.xyz, f);
}
`;
