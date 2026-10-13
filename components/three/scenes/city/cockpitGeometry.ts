import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from "three";
import {
  SHIP_AUX_HEIGHT,
  SHIP_AUX_OFFSET,
  SHIP_AUX_WIDTH,
  SHIP_EYE,
  SHIP_HUD_CENTER,
  SHIP_HUD_HEIGHT,
  SHIP_HUD_WIDTH,
  SHIP_SCREEN_CENTER,
  SHIP_SCREEN_HEIGHT,
  SHIP_SCREEN_NORMAL,
  SHIP_SCREEN_RIGHT,
  SHIP_SCREEN_UP,
  SHIP_SCREEN_WIDTH,
} from "@/lib/car/ship";
import { blinking, KIND, PartBuilder } from "../../vehicle/builder";

/**
 * The sky taxi's cockpit, in the spirit of the ships of No Man's Sky: a bubble canopy
 * on a chunky painted frame, a sculpted console with a hooded screen and two small
 * displays, a flight stick and a throttle, and the nose and canards out front.
 * Ship space: x right, y up, z toward the back (see lib/car/ship.ts).
 */

const CREAM = "#b8ae98";
/** Hull paint: a deep teal, with cream stripes */
const HULL = "#1f4a5c";
const GUNMETAL = "#283041";
const PANEL = "#1a1f2b";
const DARK = "#0b0e16";
const PAD = "#1e2537";
const SOFT_CAP = "#2c3446";
const TRIM = "#7d88a6";
const ORANGE = "#ff7a1f";
const YELLOW = "#ffe94a";
const CYAN = "#19f3ff";
const MAGENTA = "#ff2bd1";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/* ------------------------------------------------------------------ */
/* Canopy shape                                                        */
/* ------------------------------------------------------------------ */

const CANOPY_HALF_WIDTH = 0.74;
const CANOPY_FRONT = -0.84;
const CANOPY_BACK = 0.95;

/** Height of the sill the canopy sits on (it dips at the front to meet the console). */
function sillHeight(z: number) {
  const t = Math.min(1, Math.max(0, (z - CANOPY_FRONT) / 0.35));
  return 0.89 + 0.11 * t * t * (3 - 2 * t);
}

/** Height of the canopy's crest at `z` (an ellipse in the side view). */
function crest(z: number) {
  const t = (z - 0.4) / 1.24;
  return 0.905 + 0.7 * Math.sqrt(Math.max(0, 1 - t * t));
}

/** A point on the canopy, across it (`a` from -π/2 at the left sill to π/2 at the right one) at `z`. */
function canopyPoint(a: number, z: number) {
  const base = sillHeight(z);
  const h = Math.max(0, crest(z) - base);
  return v(Math.sin(a) * CANOPY_HALF_WIDTH, base + h * Math.pow(Math.max(Math.cos(a), 0), 0.8), z);
}

/** Where the front bow of the canopy frame crosses the middle (its feet are a little further forward). */
const BOW_Z = -0.2;

/** The front bow: high enough to leave the view open, coming down at the sides. */
function bowPoint(a: number) {
  return canopyPoint(a, BOW_Z - 0.14 * (1 - Math.cos(a)));
}

/** The rear hoop, behind the pilot's head. */
const HOOP_Z = 0.62;

function outward(a: number) {
  return v(Math.sin(a), Math.cos(a), 0);
}

/* ------------------------------------------------------------------ */
/* The cockpit                                                         */
/* ------------------------------------------------------------------ */

/** Console side profile [z, y]: under the glass, the deck, then the brow that hoods the screen. */
const DECK: [number, number][] = [
  [-1.02, 0.79],
  [-0.84, 0.875],
  [-0.7, 0.898],
  [-0.56, 0.908],
  [-0.47, 0.91],
  [-0.41, 0.904],
  [-0.392, 0.89],
  [-0.398, 0.876],
  [-0.47, 0.87],
];

/** Under the instrument face: the knee panel, down to the floor. */
const KNEES: [number, number][] = [
  [-0.297, 0.545],
  [-0.274, 0.51],
  [-0.3, 0.42],
  [-0.38, 0.36],
];

export function buildCockpit() {
  const b = new PartBuilder();
  const N = SHIP_SCREEN_NORMAL;
  const U = SHIP_SCREEN_UP;
  const R = SHIP_SCREEN_RIGHT;
  const half = 0.7;

  /* ------------------------------ Console ------------------------------ */
  b.paint(GUNMETAL).extrude(DECK, -half, half);
  b.paint(PAD).extrude(KNEES, -half, half);
  // Instrument face: one tilted plane behind the screen and the two small displays
  const facePoint = (x: number, up: number) =>
    SHIP_SCREEN_CENTER.clone().addScaledVector(N, -0.014).addScaledVector(R, x).addScaledVector(U, up);
  b.paint(PANEL).quad(facePoint(-half, -0.2), facePoint(half, -0.2), facePoint(half, 0.17), facePoint(-half, 0.17));
  // Close the gaps between the face, the brow and the knee panel
  b.paint(DARK).quad(facePoint(-half, 0.17), facePoint(half, 0.17), v(half, 0.87, -0.47), v(-half, 0.87, -0.47));
  b.paint(DARK).quad(v(-half, 0.545, -0.297), v(half, 0.545, -0.297), facePoint(half, -0.2), facePoint(-half, -0.2));

  // Neon lip along the brow, and a thin line under the windscreen
  b.paint(CYAN, KIND.neon, 1.5).box(v(0, 0.887, -0.389), 1.2, 0.004, 0.004);
  b.paint(MAGENTA, KIND.neon, 1.8).box(v(0, 0.88, -0.84), 1.3, 0.006, 0.01);

  // Screen bezel, a hood over it and a glowing frame
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(R, U, N));
  {
    const bezelW = SHIP_SCREEN_WIDTH + 0.05;
    const bezelH = SHIP_SCREEN_HEIGHT + 0.05;
    b.paint(DARK, KIND.gloss).box(SHIP_SCREEN_CENTER.clone().addScaledVector(N, -0.008), bezelW, bezelH, 0.014, q);
    // Side cheeks of the hood
    for (const side of [-1, 1]) {
      const at = SHIP_SCREEN_CENTER.clone().addScaledVector(R, side * (bezelW / 2 + 0.008)).addScaledVector(N, 0.012);
      b.paint(GUNMETAL).box(at, 0.016, bezelH + 0.01, 0.05, q);
    }
    const edge = SHIP_SCREEN_CENTER.clone().addScaledVector(N, 0.0008);
    b.paint(CYAN, KIND.neon, 2).panel(edge.clone().addScaledVector(U, SHIP_SCREEN_HEIGHT / 2 + 0.012), R, U, SHIP_SCREEN_WIDTH + 0.02, 0.0035);
    b.paint(MAGENTA, KIND.neon, 1.6).panel(edge.clone().addScaledVector(U, -SHIP_SCREEN_HEIGHT / 2 - 0.012), R, U, SHIP_SCREEN_WIDTH + 0.02, 0.0035);
    // Row of buttons under the screen
    for (let i = 0; i < 6; i++) {
      const at = SHIP_SCREEN_CENTER.clone()
        .addScaledVector(U, -SHIP_SCREEN_HEIGHT / 2 - 0.045)
        .addScaledVector(R, (i - 2.5) * 0.056)
        .addScaledVector(N, -0.004);
      b.paint(SOFT_CAP, KIND.gloss).panel(at, R, U, 0.042, 0.02);
      b.paint([CYAN, YELLOW, MAGENTA][i % 3], blinking(i * 0.37 + 0.1), 1.6).panel(at.clone().addScaledVector(N, 0.001), R, U, 0.014, 0.004);
    }
  }

  // The two small displays (radar and systems): bezels
  for (const side of [-1, 1]) {
    const center = SHIP_SCREEN_CENTER.clone().addScaledVector(R, side * SHIP_AUX_OFFSET);
    b.paint(DARK, KIND.gloss).box(center.clone().addScaledVector(N, -0.006), SHIP_AUX_WIDTH + 0.03, SHIP_AUX_HEIGHT + 0.03, 0.012, q);
    b.paint(side < 0 ? CYAN : YELLOW, KIND.neon, 1.5).panel(
      center.clone().addScaledVector(U, -SHIP_AUX_HEIGHT / 2 - 0.009).addScaledVector(N, 0.001),
      R,
      U,
      SHIP_AUX_WIDTH,
      0.003,
    );
  }

  // Indicator lights along the deck (both sides of the head-up display's projector)
  for (let i = 0; i < 14; i++) {
    const side = i < 7 ? -1 : 1;
    const k = i % 7;
    const x = side * (0.16 + k * 0.066);
    const color = [CYAN, YELLOW, MAGENTA, CYAN, ORANGE, CYAN, YELLOW][(k + (side > 0 ? 3 : 0)) % 7];
    b.paint(DARK).box(v(x, 0.912, -0.6), 0.034, 0.006, 0.026);
    b.paint(color, blinking(i * 0.61 + 0.2), 1.8).box(v(x, 0.916, -0.6), 0.018, 0.004, 0.012);
  }
  // Projector slot of the head-up display
  b.paint(DARK).box(v(0, 0.911, -0.62), 0.2, 0.006, 0.07);
  b.paint(CYAN, KIND.neon, 0.5).box(v(0, 0.915, -0.62), 0.16, 0.002, 0.012);

  // Cheeks: the console wraps around toward the pilot at both ends
  for (const side of [-1, 1]) {
    const x0 = side * half;
    const x1 = side * 0.74;
    b.paint(GUNMETAL).quad(v(x0, 0.91, -0.47), v(x1, 0.95, -0.3), v(x1, 0.86, -0.3), v(x0, 0.87, -0.46));
    b.paint(PAD).quad(v(x0, 0.87, -0.46), v(x1, 0.86, -0.3), v(x1, 0.4, -0.3), v(x0, 0.4, -0.38));
  }

  /* --------------------------- Side consoles --------------------------- */
  for (const side of [-1, 1]) {
    const inner = side * 0.5;
    const outer = side * 0.75;
    const mid = (inner + outer) / 2;
    // Top deck and its inner face
    b.paint(GUNMETAL).box(v(mid, 0.855, 0.12), 0.25, 0.03, 0.86);
    b.paint(PAD).box(v(inner + side * 0.01, 0.62, 0.12), 0.02, 0.46, 0.86);
    b.paint(CYAN, KIND.neon, 1.6).box(v(inner - side * 0.002, 0.84, 0.12), 0.004, 0.006, 0.8);
    // Wall up to the canopy sill
    b.paint(PAD).quad(v(outer, 0.86, -0.32), v(outer, 0.86, 0.95), v(outer, 1.0, 0.95), v(outer, 0.99, -0.32));
    b.paint(MAGENTA, KIND.neon, 1.4).box(v(outer - side * 0.004, 0.93, 0.3), 0.004, 0.006, 1.1);
  }
  // Left: throttle quadrant and a grid of buttons
  {
    b.paint(DARK).box(v(-0.6, 0.873, 0.08), 0.07, 0.008, 0.28);
    b.paint(TRIM, KIND.gloss).beam(v(-0.615, 0.875, 0.1), v(-0.6, 0.97, 0.0), 0.012, 0.012);
    b.paint(TRIM, KIND.gloss).beam(v(-0.585, 0.875, 0.1), v(-0.585, 0.97, 0.0), 0.012, 0.012);
    b.paint(GUNMETAL, KIND.gloss).box(v(-0.6, 0.99, -0.005), 0.1, 0.05, 0.06);
    b.paint(ORANGE, KIND.neon, 2).box(v(-0.6, 1.018, -0.005), 0.02, 0.006, 0.02);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const at = v(-0.66 + col * 0.05, 0.873, 0.32 + row * 0.055);
        b.paint(PANEL, KIND.gloss).box(at, 0.036, 0.008, 0.036);
        b.paint([CYAN, YELLOW, MAGENTA][(row + col) % 3], blinking(row * 0.29 + col * 0.53), 1.5).box(at.clone().add(v(0, 0.005, 0)), 0.016, 0.003, 0.016);
      }
    }
  }
  // Right: toggle switches and a big guarded button
  {
    for (let i = 0; i < 5; i++) {
      const at = v(0.57 + (i % 2) * 0.03, 0.873, -0.22 + i * 0.05);
      b.paint(DARK).box(at, 0.03, 0.008, 0.03);
      b.paint(TRIM, KIND.gloss).beam(at, at.clone().add(v(0, 0.035, -0.012)), 0.007, 0.007);
    }
    const guard = v(0.64, 0.872, 0.32);
    b.paint(YELLOW).box(guard, 0.11, 0.008, 0.11);
    for (let i = 0; i < 4; i++) {
      b.paint(DARK).box(guard.clone().add(v(-0.04 + i * 0.027, 0.005, 0)), 0.01, 0.003, 0.11, new Quaternion().setFromAxisAngle(v(0, 1, 0), 0.7));
    }
    b.paint("#ff2340", KIND.neon, 1.6).cylinder(guard.clone().add(v(0, 0.004, 0)), guard.clone().add(v(0, 0.026, 0)), 0.032, 14);
  }

  /* ------------------------------ Floor ------------------------------- */
  b.paint(DARK).quad(v(-0.5, 0.36, -0.36), v(0.5, 0.36, -0.36), v(0.5, 0.36, 0.7), v(-0.5, 0.36, 0.7));

  /* --------------------------- Canopy frame --------------------------- */
  const steps = 36;
  // Front bow: cream paint outside, a dark inner face with a neon line
  {
    const points: Vector3[] = [];
    const ups: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI;
      points.push(bowPoint(a));
      ups.push(outward(a));
    }
    b.paint(CREAM, KIND.gloss).polyBeam(points, 0.07, 0.06, (i) => ups[i]);
    const inner = points.map((p, i) => p.clone().addScaledVector(ups[i], -0.033).add(v(0, 0, 0.01)));
    b.paint(CYAN, KIND.neon, 1.8).polyBeam(inner.slice(4, steps - 3), 0.007, 0.006, (i) => ups[i + 4]);
    // Bolts on the bow's inner face
    b.paint(TRIM, KIND.gloss);
    for (let i = 3; i < steps - 2; i += 4) {
      b.box(points[i].clone().addScaledVector(ups[i], -0.032).add(v(0, 0, 0.026)), 0.011, 0.011, 0.011);
    }
    // Amber lamps at its feet
    for (const i of [0, steps]) {
      const foot = points[i];
      b.paint(GUNMETAL).box(foot.clone().add(v(-Math.sign(foot.x) * 0.05, 0.02, 0.03)), 0.05, 0.04, 0.06);
      b.paint(ORANGE, blinking(i === 0 ? 0.1 : 0.6), 2.2).box(foot.clone().add(v(-Math.sign(foot.x) * 0.075, 0.025, 0.03)), 0.006, 0.02, 0.02);
    }
  }
  // Spine over the head, from the bow's crest to the back
  {
    const points: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const z = BOW_Z + (i / 12) * (CANOPY_BACK - BOW_Z);
      points.push(canopyPoint(0, z));
    }
    b.paint(CREAM, KIND.gloss).polyBeam(points, 0.07, 0.06);
  }
  // Rear hoop
  {
    const points: Vector3[] = [];
    const ups: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI;
      points.push(canopyPoint(a, HOOP_Z));
      ups.push(outward(a));
    }
    b.paint(CREAM, KIND.gloss).polyBeam(points, 0.09, 0.07, (i) => ups[i]);
  }
  // Sills, both sides
  for (const side of [-1, 1]) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const z = CANOPY_FRONT + 0.08 + (i / 8) * (CANOPY_BACK - CANOPY_FRONT - 0.08);
      points.push(v(side * (CANOPY_HALF_WIDTH + 0.01), sillHeight(z), z));
    }
    b.paint(GUNMETAL, KIND.gloss).polyBeam(points, 0.08, 0.06);
    // Yellow and black hazard stripes on the sill's top
    for (let i = 0; i < 6; i++) {
      const z = 0.1 + i * 0.06;
      b.paint(i % 2 ? DARK : YELLOW).box(v(side * (CANOPY_HALF_WIDTH + 0.01), 1.031, z), 0.05, 0.004, 0.03);
    }
  }

  /* ------------------------ Out front: the nose ------------------------ */
  {
    // Cross-sections, the right half from the crest down to the chine: [x, y]
    const sections: [number, [number, number][]][] = [
      [-0.85, [[0, 0.885], [0.42, 0.87], [0.68, 0.82], [0.82, 0.7], [0.86, 0.5]]],
      [-1.35, [[0, 0.93], [0.35, 0.905], [0.58, 0.835], [0.7, 0.71], [0.72, 0.5]]],
      [-2.05, [[0, 0.915], [0.26, 0.89], [0.44, 0.815], [0.54, 0.7], [0.56, 0.52]]],
      [-2.75, [[0, 0.85], [0.16, 0.83], [0.27, 0.775], [0.34, 0.7], [0.36, 0.57]]],
      [-3.3, [[0, 0.755], [0.06, 0.748], [0.1, 0.72], [0.12, 0.68], [0.13, 0.63]]],
      [-3.42, [[0, 0.69], [0.004, 0.69], [0.006, 0.688], [0.007, 0.686], [0.008, 0.684]]],
    ];
    const rows = sections.map(([z, half]) => {
      const right = half.map(([x, y]) => v(x, y, z));
      const left = half.slice(1).map(([x, y]) => v(-x, y, z)).reverse();
      return [...left, ...right];
    });
    // Teal hull with a cream stripe down the middle, dark flanks, all in glossy paint
    b.paint(CREAM, KIND.gloss).loft(rows.map((r) => r.slice(3, 6)));
    b.paint(HULL, KIND.gloss).loft(rows.map((r) => r.slice(1, 4)));
    b.paint(HULL, KIND.gloss).loft(rows.map((r) => r.slice(5, 8)));
    b.paint(GUNMETAL, KIND.gloss).loft(rows.map((r) => r.slice(0, 2)));
    b.paint(GUNMETAL, KIND.gloss).loft(rows.map((r) => r.slice(7, 9)));
    // Neon ridge down the middle
    b.paint(CYAN, KIND.neon, 1.6);
    for (let i = 0; i < sections.length - 2; i++) {
      const a = rows[i][4];
      const c = rows[i + 1][4];
      b.beam(a.clone().add(v(0, 0.006, 0)), c.clone().add(v(0, 0.006, 0)), 0.012, 0.004);
    }
    // Hazard chevrons near the cockpit, and panel seams further out
    for (let i = 0; i < 3; i++) {
      const z = -0.98 - i * 0.1;
      const y = 0.885 + (0.93 - 0.885) * ((-z - 0.85) / 0.5);
      b.paint(YELLOW).beam(v(-0.2, y - 0.006, z - 0.04), v(0, y + 0.004, z + 0.03), 0.035, 0.004);
      b.paint(YELLOW).beam(v(0, y + 0.004, z + 0.03), v(0.2, y - 0.006, z - 0.04), 0.035, 0.004);
    }
    b.paint(DARK);
    for (const row of [1, 2]) {
      for (let j = 2; j < 6; j++) {
        const a = rows[row][j].clone().lerp(rows[row + 1][j], 0.43).add(v(0, 0.004, 0));
        const c = rows[row][j + 1].clone().lerp(rows[row + 1][j + 1], 0.43).add(v(0, 0.004, 0));
        b.beam(a, c, 0.012, 0.004);
      }
    }
    // Landing lights on the nose's flanks
    for (const side of [-1, 1]) {
      b.paint("#fff4e0", KIND.neon, 1.6).box(v(side * 0.5, 0.74, -2.2), 0.02, 0.04, 0.12);
    }
  }

  /* ------------------------ Canards with nav lights -------------------- */
  for (const side of [-1, 1]) {
    // Swept forward of the canopy's bow, so they show through the windscreen
    const r0 = v(side * 0.66, 0.72, -1.2);
    const r1 = v(side * 0.6, 0.72, -2.0);
    const t1 = v(side * 1.8, 0.8, -2.95);
    const t0 = v(side * 1.9, 0.82, -2.6);
    const top = [r0, r1, t1, t0];
    const n = new Vector3().subVectors(t0, r0).cross(new Vector3().subVectors(r1, r0)).normalize().multiplyScalar(0.025);
    if (n.y < 0) n.negate();
    const bottom = top.map((p) => p.clone().sub(n));
    const upper = top.map((p) => p.clone().add(n));
    b.paint(HULL, KIND.gloss).quad(upper[0], upper[1], upper[2], upper[3]);
    b.paint(GUNMETAL).quad(bottom[3], bottom[2], bottom[1], bottom[0]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      b.paint(i === 3 ? CREAM : GUNMETAL, KIND.gloss).quad(bottom[i], bottom[j], upper[j], upper[i]);
    }
    // Stripe and the nav light at the tip (red on the left, green on the right)
    b.paint(side < 0 ? MAGENTA : CYAN, KIND.neon, 1.4).beam(
      r0.clone().lerp(t0, 0.15).add(v(0, 0.03, 0)),
      r0.clone().lerp(t0, 0.85).add(v(0, 0.03, 0)),
      0.03,
      0.004,
    );
    b.paint(side < 0 ? "#ff2a3a" : "#2bff8a", blinking(side < 0 ? 0.15 : 0.65), 2.6).box(t0.clone().lerp(t1, 0.5).add(v(side * 0.03, 0, 0)), 0.05, 0.05, 0.12);
  }

  return b.build();
}

/* ------------------------------------------------------------------ */
/* Flight stick (its own mesh, so it can lean with the ship)           */
/* ------------------------------------------------------------------ */

/** Built around its pivot at the floor (see SHIP_STICK_PIVOT). */
export function buildStick() {
  const b = new PartBuilder();
  b.paint(DARK).cylinder(v(0, 0, 0), v(0, 0.06, 0), 0.06, 14);
  b.paint(PAD).cylinder(v(0, 0.06, 0), v(0, 0.12, -0.005), 0.038, 12);
  b.paint(TRIM, KIND.gloss).cylinder(v(0, 0.12, -0.005), v(0, 0.25, -0.02), 0.014, 10);
  // Grip, leaning forward a little
  const grip = new Quaternion().setFromAxisAngle(v(1, 0, 0), -0.18);
  b.paint(GUNMETAL, KIND.gloss).box(v(0, 0.305, -0.03), 0.05, 0.12, 0.056, grip);
  b.paint(PAD).box(v(0.027, 0.3, -0.026), 0.006, 0.09, 0.046, grip);
  // Trigger, hat switch and a glowing thumb button
  b.paint(DARK).box(v(0, 0.3, -0.064), 0.016, 0.03, 0.014, grip);
  b.paint(TRIM, KIND.gloss).cylinder(v(-0.008, 0.366, -0.04), v(-0.008, 0.38, -0.042), 0.008, 8);
  b.paint(CYAN, KIND.neon, 2.2).box(v(0.012, 0.37, -0.03), 0.012, 0.006, 0.012, grip);
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Textured surfaces: screen, displays, head-up display, glass          */
/* ------------------------------------------------------------------ */

/** A flat rectangle with UVs (u from `u0` to `u1`) facing along `right` × `up`. */
function texturedQuad(center: Vector3, right: Vector3, up: Vector3, width: number, height: number, u0 = 0, u1 = 1) {
  const r = right.clone().multiplyScalar(width / 2);
  const u = up.clone().multiplyScalar(height / 2);
  const corners = [
    center.clone().sub(r).sub(u),
    center.clone().add(r).sub(u),
    center.clone().add(r).add(u),
    center.clone().sub(r).add(u),
  ];
  return { corners, uvs: [u0, 0, u1, 0, u1, 1, u0, 1] };
}

function quadGeometry(quads: ReturnType<typeof texturedQuad>[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  quads.forEach((q, i) => {
    q.corners.forEach((c) => positions.push(c.x, c.y, c.z));
    uvs.push(...q.uvs);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export function shipScreenGeometry() {
  return quadGeometry([texturedQuad(SHIP_SCREEN_CENTER, SHIP_SCREEN_RIGHT, SHIP_SCREEN_UP, SHIP_SCREEN_WIDTH, SHIP_SCREEN_HEIGHT)]);
}

/** Radar on the left (left half of the texture), systems on the right. */
export function auxGeometry() {
  return quadGeometry(
    [-1, 1].map((side) =>
      texturedQuad(
        SHIP_SCREEN_CENTER.clone().addScaledVector(SHIP_SCREEN_RIGHT, side * SHIP_AUX_OFFSET).addScaledVector(SHIP_SCREEN_NORMAL, 0.001),
        SHIP_SCREEN_RIGHT,
        SHIP_SCREEN_UP,
        SHIP_AUX_WIDTH,
        SHIP_AUX_HEIGHT,
        side < 0 ? 0 : 0.5,
        side < 0 ? 0.5 : 1,
      ),
    ),
  );
}

/** The holographic head-up display, facing the pilot's eyes. */
export function shipHudGeometry() {
  const normal = SHIP_EYE.clone().sub(SHIP_HUD_CENTER).normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  return quadGeometry([texturedQuad(SHIP_HUD_CENTER, right, up, SHIP_HUD_WIDTH, SHIP_HUD_HEIGHT)]);
}

/** The canopy glass: u goes across (left sill to right sill), v from the front to the back. */
export function canopyGlassGeometry() {
  const across = 28;
  const along = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= along; j++) {
    const z = CANOPY_FRONT + (j / along) * (CANOPY_BACK - CANOPY_FRONT);
    for (let i = 0; i <= across; i++) {
      const a = -Math.PI / 2 + (i / across) * Math.PI;
      const p = canopyPoint(a, z);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / across, j / along);
    }
  }
  for (let j = 0; j < along; j++) {
    for (let i = 0; i < across; i++) {
      const k = j * (across + 1) + i;
      index.push(k, k + 1, k + across + 2, k, k + across + 2, k + across + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
