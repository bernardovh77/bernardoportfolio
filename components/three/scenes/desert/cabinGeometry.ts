import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from "three";
import {
  EYE,
  HUD_CENTER,
  HUD_HEIGHT,
  HUD_WIDTH,
  SCREEN_CENTER,
  SCREEN_HEIGHT,
  SCREEN_NORMAL,
  SCREEN_RIGHT,
  SCREEN_UP,
  SCREEN_WIDTH,
  STEERING_AXIS,
  STEERING_CENTER,
  STEERING_RADIUS,
} from "@/lib/car/cabin";
import { KIND, PartBuilder } from "./builder";
import { addMirrorHousings } from "./mirrors";

/**
 * The inside of the car, built from simple pieces merged into one geometry.
 * Every vertex carries a color and a "kind" that the shader understands:
 * matte plastic, glowing neon or glossy trim. The mirror glass is its own mesh (mirrors.ts).
 * Car space: x right, y up, z toward the back (see lib/car/cabin.ts).
 */

/* ------------------------------------------------------------------ */
/* The cabin                                                           */
/* ------------------------------------------------------------------ */

const PLASTIC = "#1b1428";
const SOFT = "#251a36";
const DARK = "#0d0a15";
const LEATHER = "#2b1a30";
const TRIM = "#5c4d78";
const PINK = "#ff3f8e";
const CYAN = "#19f3ff";
const ORANGE = "#ffa62b";
const VIOLET = "#9a5cff";

/** Side view of the dashboard, front (under the windshield) to the driver's knees: [z, y]. */
const DASH: [number, number][] = [
  [-0.86, 0.9],
  [-0.74, 0.958],
  [-0.58, 0.985],
  [-0.42, 0.995],
  [-0.31, 0.985],
  [-0.245, 0.962],
  [-0.212, 0.928],
  [-0.204, 0.885],
  [-0.214, 0.8],
  [-0.245, 0.7],
  [-0.3, 0.62],
  [-0.42, 0.56],
];

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export function buildCabin() {
  const b = new PartBuilder();
  const halfWidth = 0.78;

  // Dashboard, door to door
  b.paint(PLASTIC).extrude(DASH, -halfWidth, halfWidth);
  // Soft top pad (slightly lighter, catches the sky)
  b.paint(SOFT).extrude(
    [
      [-0.7, 0.962],
      [-0.58, 0.989],
      [-0.42, 0.999],
      [-0.31, 0.989],
      [-0.25, 0.968],
    ],
    -halfWidth + 0.02,
    halfWidth - 0.02,
    false,
  );

  // Ambient light strip along the dashboard face (split by the console screen)
  b.paint(CYAN, KIND.neon, 2.4);
  b.box(v(-0.48, 0.903, -0.2), 0.56, 0.008, 0.012);
  b.box(v(0.5, 0.903, -0.2), 0.52, 0.008, 0.012);
  // A thin pink line under the windshield
  b.paint(PINK, KIND.neon, 2.2);
  b.box(v(0, 0.962, -0.735), 1.44, 0.006, 0.01);

  // Air vents: dark slots with glowing slats
  for (const x of [-0.66, 0.66]) {
    b.paint(DARK).box(v(x, 0.84, -0.205), 0.12, 0.06, 0.02);
    b.paint(VIOLET, KIND.neon, 1.4);
    for (let i = 0; i < 3; i++) b.box(v(x, 0.822 + i * 0.018, -0.196), 0.1, 0.003, 0.004);
  }

  // Glovebox seam on the passenger side
  b.paint(DARK).box(v(0.5, 0.74, -0.232), 0.4, 0.004, 0.006);

  /* ------------------- Driver's side: a slim gauge pod ---------------- */
  // Most of the readout is on the windshield (head-up display); this is just the housing
  b.paint(PLASTIC).extrude(
    [
      [-0.5, 0.99],
      [-0.42, 1.012],
      [-0.33, 1.014],
      [-0.27, 1.0],
      [-0.255, 0.985],
    ],
    -0.56,
    -0.2,
  );
  b.paint(PINK, KIND.neon, 1.8).box(v(-0.38, 0.998, -0.258), 0.34, 0.004, 0.006);
  // The HUD projector slot
  b.paint(DARK).box(v(-0.36, 0.996, -0.62), 0.3, 0.004, 0.09);
  b.paint(CYAN, KIND.neon, 0.25).box(v(-0.36, 0.999, -0.62), 0.24, 0.002, 0.012);

  /* ------------------------ Steering wheel ------------------------ */
  const axis = STEERING_AXIS;
  b.paint(LEATHER, KIND.gloss).ring(STEERING_CENTER, axis, STEERING_RADIUS, 0.017, 40, 8);
  // Neon marker at 12 o'clock
  {
    const u = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
    const w = new Vector3().crossVectors(axis, u).normalize();
    b.paint(PINK, KIND.neon, 2.6).ring(STEERING_CENTER, axis, STEERING_RADIUS, 0.0185, 6, 6, Math.PI / 2 - 0.09, Math.PI / 2 + 0.09);
    // Spokes: left, right and bottom
    b.paint(TRIM, KIND.gloss);
    for (const angle of [Math.PI, 0, -Math.PI / 2]) {
      const dir = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(w, Math.sin(angle));
      b.beam(
        STEERING_CENTER.clone().addScaledVector(dir, 0.045),
        STEERING_CENTER.clone().addScaledVector(dir, STEERING_RADIUS - 0.01),
        0.03,
        0.014,
        axis,
      );
    }
    // Hub with a glowing badge
    b.paint(SOFT).cylinder(
      STEERING_CENTER.clone().addScaledVector(axis, -0.03),
      STEERING_CENTER.clone().addScaledVector(axis, 0.012),
      0.055,
      14,
    );
    b.paint(PINK, KIND.neon, 2).cylinder(
      STEERING_CENTER.clone().addScaledVector(axis, 0.012),
      STEERING_CENTER.clone().addScaledVector(axis, 0.0135),
      0.022,
      12,
    );
    // Column into the dashboard
    b.paint(DARK).cylinder(
      STEERING_CENTER.clone().addScaledVector(axis, -0.03),
      STEERING_CENTER.clone().addScaledVector(axis, -0.26),
      0.035,
      10,
    );
  }

  /* ------------------------- Console screen ------------------------ */
  const N = SCREEN_NORMAL;
  const R = SCREEN_RIGHT;
  const U = SCREEN_UP;
  const bezelW = SCREEN_WIDTH + 0.04;
  const bezelH = SCREEN_HEIGHT + 0.046;
  const bezelDepth = 0.032;
  {
    const center = SCREEN_CENTER.clone().addScaledVector(N, -bezelDepth / 2 - 0.002);
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(R, U, N));
    b.paint(DARK, KIND.gloss).box(center, bezelW, bezelH, bezelDepth, q);
    // Glowing edge around the glass
    b.paint(PINK, KIND.neon, 2.2);
    const edge = SCREEN_CENTER.clone().addScaledVector(N, 0.0008);
    const top = edge.clone().addScaledVector(U, SCREEN_HEIGHT / 2 + 0.011);
    const bottom = edge.clone().addScaledVector(U, -SCREEN_HEIGHT / 2 - 0.011);
    b.panel(top, R, U, SCREEN_WIDTH + 0.02, 0.0035);
    b.paint(VIOLET, KIND.neon, 1.6).panel(bottom, R, U, SCREEN_WIDTH + 0.02, 0.0035);
    // Touch buttons under the screen
    for (let i = 0; i < 5; i++) {
      const at = SCREEN_CENTER.clone()
        .addScaledVector(U, -SCREEN_HEIGHT / 2 - 0.042)
        .addScaledVector(R, (i - 2) * 0.062)
        .addScaledVector(N, -0.004);
      b.paint(SOFT, KIND.gloss).panel(at, R, U, 0.048, 0.02);
      b.paint(i === 2 ? PINK : CYAN, KIND.neon, 1.4).panel(at.clone().addScaledVector(N, 0.001), R, U, 0.016, 0.003);
    }
    // Housing that carries the screen, down into the center console
    b.paint(PLASTIC);
    const lowerLeft = SCREEN_CENTER.clone().addScaledVector(U, -bezelH / 2 - 0.06).addScaledVector(R, -bezelW / 2).addScaledVector(N, -0.03);
    const lowerRight = lowerLeft.clone().addScaledVector(R, bezelW);
    const backLeft = lowerLeft.clone().addScaledVector(N, -0.14);
    const backRight = lowerRight.clone().addScaledVector(N, -0.14);
    const footLeft = v(lowerLeft.x, 0.6, -0.02);
    const footRight = v(lowerRight.x, 0.6, 0.06);
    // Front face of the housing under the screen (holds the buttons)
    const shelfTopLeft = SCREEN_CENTER.clone().addScaledVector(U, -bezelH / 2).addScaledVector(R, -bezelW / 2).addScaledVector(N, -0.03);
    const shelfTopRight = shelfTopLeft.clone().addScaledVector(R, bezelW);
    b.quad(lowerLeft, lowerRight, shelfTopRight, shelfTopLeft);
    b.quad(footLeft, footRight, lowerRight, lowerLeft);
    b.quad(backLeft, lowerLeft, footLeft, v(backLeft.x, 0.6, footLeft.z - 0.2));
    b.quad(lowerRight, backRight, v(backRight.x, 0.6, footRight.z - 0.2), footRight);
    // Back of the screen up to the dashboard
    b.quad(
      shelfTopLeft.clone().addScaledVector(N, -0.01),
      shelfTopRight.clone().addScaledVector(N, -0.01),
      backRight,
      backLeft,
    );
  }

  /* ------------------------ Center console ------------------------ */
  b.paint(PLASTIC).box(v(0.02, 0.5, 0.3), 0.26, 0.2, 0.7);
  b.paint(SOFT).box(v(0.02, 0.606, 0.36), 0.24, 0.012, 0.56);
  b.paint(PINK, KIND.neon, 2).box(v(-0.112, 0.6, 0.3), 0.004, 0.006, 0.64);
  b.paint(PINK, KIND.neon, 2).box(v(0.152, 0.6, 0.3), 0.004, 0.006, 0.64);
  // Gear selector
  b.paint(DARK, KIND.gloss).box(v(0.02, 0.63, 0.12), 0.07, 0.04, 0.1);
  b.paint(CYAN, KIND.neon, 2.2).box(v(0.02, 0.652, 0.12), 0.05, 0.004, 0.06);
  b.paint(TRIM, KIND.gloss).cylinder(v(0.02, 0.65, 0.13), v(0.02, 0.7, 0.14), 0.012, 8);
  b.paint(PINK, KIND.neon, 2.4).cylinder(v(0.02, 0.7, 0.14), v(0.02, 0.712, 0.142), 0.018, 10);

  /* ----------------------------- Doors ----------------------------- */
  for (const side of [-1, 1]) {
    const x = side * halfWidth;
    // Door card
    b.paint(PLASTIC).quad(v(x, 0.42, -0.75), v(x, 0.42, 0.9), v(x, 0.98, 0.9), v(x, 0.98, -0.75));
    // Window sill
    b.paint(SOFT).quad(v(x, 0.98, -0.75), v(x, 0.98, 0.9), v(x - side * 0.07, 0.99, 0.9), v(x - side * 0.07, 0.99, -0.75));
    // Armrest
    b.paint(LEATHER, KIND.gloss).box(v(x - side * 0.05, 0.72, 0.38), 0.1, 0.05, 0.6);
    // Neon line along the door
    b.paint(side < 0 ? PINK : CYAN, KIND.neon, 2.2).box(v(x - side * 0.004, 0.9, 0.05), 0.006, 0.006, 1.3);
    // Door handle glint
    b.paint(TRIM, KIND.gloss).box(v(x - side * 0.01, 0.83, -0.05), 0.012, 0.025, 0.12);

    // A-pillar from the cowl to the roof
    const bottom = v(side * 0.76, 0.97, -0.7);
    const top = v(side * 0.66, 1.4, -0.12);
    b.paint(DARK).beam(bottom, top, 0.085, 0.06, new Vector3(-side, 0, 0));
    b.paint(side < 0 ? PINK : CYAN, KIND.neon, 1.6).beam(
      bottom.clone().add(v(-side * 0.04, 0.01, 0.02)),
      top.clone().add(v(-side * 0.04, -0.01, 0.02)),
      0.005,
      0.005,
    );
    // Side window frame (top edge)
    b.paint(DARK).beam(top, v(side * 0.68, 1.38, 0.9), 0.05, 0.05);

  }

  /* ----------------------------- Roof ------------------------------ */
  b.paint(DARK).quad(v(-0.68, 1.41, -0.12), v(0.68, 1.41, -0.12), v(0.68, 1.43, 0.9), v(-0.68, 1.43, 0.9));
  b.paint(PLASTIC).box(v(0, 1.392, -0.08), 1.34, 0.04, 0.12);
  b.paint(PINK, KIND.neon, 2).box(v(0, 1.37, -0.135), 1.2, 0.005, 0.006);
  // Sun visors folded up
  b.paint(SOFT).box(v(-0.36, 1.38, -0.02), 0.42, 0.02, 0.16);
  b.paint(SOFT).box(v(0.36, 1.38, -0.02), 0.42, 0.02, 0.16);

  // Rear-view and side mirrors (the glass is drawn by mirrors.ts)
  addMirrorHousings(b);

  /* -------------------------- Passenger seat ------------------------- */
  b.paint(LEATHER, KIND.gloss).box(v(0.4, 0.52, 0.52), 0.5, 0.12, 0.5);
  b.paint(LEATHER, KIND.gloss).box(v(0.4, 0.88, 0.8), 0.5, 0.62, 0.12, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.22));
  b.paint(CYAN, KIND.neon, 1.4).box(v(0.4, 0.585, 0.28), 0.46, 0.004, 0.006);

  /* -------------------- Outside: hood and wipers ------------------- */
  const hood: [number, number][] = [
    [-2.35, 0.76],
    [-1.6, 0.84],
    [-1.05, 0.9],
    [-0.74, 0.935],
  ];
  b.paint("#120a1c", KIND.gloss).extrude(hood, -0.86, 0.86, false);
  // Neon edges and a center stripe on the hood
  for (const x of [-0.84, 0.84]) {
    b.paint(PINK, KIND.neon, 2.4);
    for (let i = 0; i < hood.length - 1; i++) {
      b.beam(v(x, hood[i][1] + 0.004, hood[i][0]), v(x, hood[i + 1][1] + 0.004, hood[i + 1][0]), 0.012, 0.006);
    }
  }
  b.paint(ORANGE, KIND.neon, 1.6);
  for (let i = 0; i < hood.length - 1; i++) {
    b.beam(v(0, hood[i][1] + 0.003, hood[i][0]), v(0, hood[i + 1][1] + 0.003, hood[i + 1][0]), 0.05, 0.004);
  }
  // Wipers resting on the cowl
  b.paint(DARK).beam(v(-0.62, 0.945, -0.8), v(-0.05, 0.952, -0.83), 0.014, 0.01);
  b.paint(DARK).beam(v(0.08, 0.945, -0.8), v(0.62, 0.952, -0.83), 0.014, 0.01);

  return b.build();
}

/* ------------------------------------------------------------------ */
/* Screen, cluster and windshield surfaces                             */
/* ------------------------------------------------------------------ */

/** A flat rectangle with UVs, facing `normal` (for the textured screens). */
export function texturedPanel(center: Vector3, right: Vector3, up: Vector3, width: number, height: number) {
  const r = right.clone().multiplyScalar(width / 2);
  const u = up.clone().multiplyScalar(height / 2);
  const corners = [
    center.clone().sub(r).sub(u),
    center.clone().add(r).sub(u),
    center.clone().add(r).add(u),
    center.clone().sub(r).add(u),
  ];
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(corners.flatMap((c) => [c.x, c.y, c.z])), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return g;
}

export function screenGeometry() {
  return texturedPanel(SCREEN_CENTER, SCREEN_RIGHT, SCREEN_UP, SCREEN_WIDTH, SCREEN_HEIGHT);
}

/** The head-up display, facing the driver's eyes. */
export function hudGeometry() {
  const normal = EYE.clone().sub(HUD_CENTER).normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  return texturedPanel(HUD_CENTER, right, up, HUD_WIDTH, HUD_HEIGHT);
}

/** The windshield glass (for the tinted band and faint reflections). */
export function windshieldGeometry() {
  return texturedPanel(
    new Vector3(0, 1.18, -0.42),
    new Vector3(1, 0, 0),
    new Vector3(0, 0.6, 0.8).normalize(),
    1.46,
    0.76,
  );
}
