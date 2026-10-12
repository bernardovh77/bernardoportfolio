import { BufferAttribute, BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from "three";
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

/**
 * The inside of the car, built from simple pieces merged into one geometry.
 * Every vertex carries a color and a "kind" that the shader understands:
 * matte plastic, glowing neon, glossy trim, or the rear-view mirror.
 * Car space: x right, y up, z toward the back (see lib/car/cabin.ts).
 */

export const KIND = { matte: 0, neon: 1, gloss: 2, mirror: 3 } as const;

const _ab = new Vector3();
const _ac = new Vector3();
const _n = new Vector3();

class CabinBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private kinds: number[] = [];
  private indices: number[] = [];
  private color = new Color();
  private kind: number = KIND.matte;

  /** Color for the next pieces (hex in sRGB, `boost` above 1 makes neon bloom). */
  paint(hex: string, kind: number = KIND.matte, boost = 1) {
    this.color.set(hex).multiplyScalar(boost);
    this.kind = kind;
    return this;
  }

  private vertex(p: Vector3, n: Vector3) {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(this.color.r, this.color.g, this.color.b);
    this.kinds.push(this.kind);
    return this.positions.length / 3 - 1;
  }

  tri(a: Vector3, b: Vector3, c: Vector3) {
    _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(c, a));
    if (_n.lengthSq() < 1e-14) return this;
    _n.normalize();
    const i = this.vertex(a, _n);
    this.vertex(b, _n);
    this.vertex(c, _n);
    this.indices.push(i, i + 1, i + 2);
    return this;
  }

  /** A flat quad (normal follows the a→b→c winding). */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
    _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(c, a));
    if (_n.lengthSq() < 1e-14) _n.crossVectors(_ab.subVectors(c, a), _ac.subVectors(d, a));
    if (_n.lengthSq() < 1e-14) return this;
    _n.normalize();
    const i = this.vertex(a, _n);
    this.vertex(b, _n);
    this.vertex(c, _n);
    this.vertex(d, _n);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }

  /** A quad with its own normals per corner (smooth surfaces). */
  private smoothQuad(p: Vector3[], n: Vector3[]) {
    const i = this.vertex(p[0], n[0]);
    this.vertex(p[1], n[1]);
    this.vertex(p[2], n[2]);
    this.vertex(p[3], n[3]);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A box given its center, size and an optional rotation. */
  box(center: Vector3, sx: number, sy: number, sz: number, rotation?: Quaternion) {
    const corners = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map(([x, y, z]) => {
      const v = new Vector3((x * sx) / 2, (y * sy) / 2, (z * sz) / 2);
      if (rotation) v.applyQuaternion(rotation);
      return v.add(center);
    });
    const faces = [
      [4, 5, 6, 7],
      [1, 0, 3, 2],
      [5, 1, 2, 6],
      [0, 4, 7, 3],
      [7, 6, 2, 3],
      [0, 1, 5, 4],
    ];
    for (const [a, b, c, d] of faces) this.quad(corners[a], corners[b], corners[c], corners[d]);
    return this;
  }

  /** A box between two points (a beam), `width` across and `depth` deep. */
  beam(a: Vector3, b: Vector3, width: number, depth = width, upHint = new Vector3(0, 1, 0)) {
    const dir = new Vector3().subVectors(b, a);
    const length = dir.length();
    if (length < 1e-5) return this;
    dir.divideScalar(length);
    const side = new Vector3().crossVectors(dir, upHint);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new Vector3().crossVectors(side, dir).normalize();
    const hw = width / 2;
    const hd = depth / 2;
    const corner = (end: Vector3, s: number, u: number) =>
      end.clone().addScaledVector(side, s * hw).addScaledVector(up, u * hd);
    const c = [
      corner(a, -1, -1),
      corner(a, 1, -1),
      corner(a, 1, 1),
      corner(a, -1, 1),
      corner(b, -1, -1),
      corner(b, 1, -1),
      corner(b, 1, 1),
      corner(b, -1, 1),
    ];
    const faces = [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
      [3, 2, 1, 0],
      [4, 5, 6, 7],
    ];
    for (const [p, q2, r, s] of faces) this.quad(c[p], c[q2], c[r], c[s]);
    return this;
  }

  /**
   * Extrudes a profile drawn in the side view (pairs of [z, y]) across the car
   * from x0 to x1, with smooth shading along the profile.
   */
  extrude(profile: [number, number][], x0: number, x1: number, caps = true) {
    const pts = profile.map(([z, y]) => new Vector3(0, y, z));
    const normals = pts.map((_, i) => {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      // Perpendicular to the profile, in the y-z plane
      return new Vector3(0, -(next.z - prev.z), next.y - prev.y).normalize();
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      this.smoothQuad(
        [
          new Vector3(x0, a.y, a.z),
          new Vector3(x1, a.y, a.z),
          new Vector3(x1, b.y, b.z),
          new Vector3(x0, b.y, b.z),
        ],
        [normals[i], normals[i], normals[i + 1], normals[i + 1]],
      );
    }
    if (caps) {
      for (const x of [x0, x1]) {
        const ring = pts.map((p) => new Vector3(x, p.y, p.z));
        for (let i = 1; i < ring.length - 1; i++) this.tri(ring[0], ring[i], ring[i + 1]);
      }
    }
    return this;
  }

  /** A ring of tube (like a steering wheel rim) around `axis`. */
  ring(center: Vector3, axis: Vector3, radius: number, tube: number, segments = 32, sides = 8, from = 0, to = Math.PI * 2) {
    const u = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
    const v = new Vector3().crossVectors(axis, u).normalize();
    const point = (angle: number, around: number) => {
      const dir = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
      const normal = dir.clone().multiplyScalar(Math.cos(around)).addScaledVector(axis, Math.sin(around));
      return {
        p: center.clone().addScaledVector(dir, radius).addScaledVector(normal, tube),
        n: normal,
      };
    };
    for (let i = 0; i < segments; i++) {
      const a0 = from + ((to - from) * i) / segments;
      const a1 = from + ((to - from) * (i + 1)) / segments;
      for (let j = 0; j < sides; j++) {
        const s0 = (j / sides) * Math.PI * 2;
        const s1 = ((j + 1) / sides) * Math.PI * 2;
        const p00 = point(a0, s0);
        const p10 = point(a1, s0);
        const p11 = point(a1, s1);
        const p01 = point(a0, s1);
        this.smoothQuad([p00.p, p10.p, p11.p, p01.p], [p00.n, p10.n, p11.n, p01.n]);
      }
    }
    return this;
  }

  /** A cylinder from a to b. */
  cylinder(a: Vector3, b: Vector3, radius: number, sides = 10) {
    const axis = new Vector3().subVectors(b, a).normalize();
    const u = new Vector3(0, 0, 1).cross(axis);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const v = new Vector3().crossVectors(axis, u).normalize();
    for (let i = 0; i < sides; i++) {
      const t0 = (i / sides) * Math.PI * 2;
      const t1 = ((i + 1) / sides) * Math.PI * 2;
      const n0 = u.clone().multiplyScalar(Math.cos(t0)).addScaledVector(v, Math.sin(t0));
      const n1 = u.clone().multiplyScalar(Math.cos(t1)).addScaledVector(v, Math.sin(t1));
      this.smoothQuad(
        [
          a.clone().addScaledVector(n0, radius),
          a.clone().addScaledVector(n1, radius),
          b.clone().addScaledVector(n1, radius),
          b.clone().addScaledVector(n0, radius),
        ],
        [n0, n1, n1, n0],
      );
    }
    return this;
  }

  /** A flat rectangle centered at `center`, spanned by `right` and `up`. */
  panel(center: Vector3, right: Vector3, up: Vector3, width: number, height: number) {
    const r = right.clone().multiplyScalar(width / 2);
    const u = up.clone().multiplyScalar(height / 2);
    return this.quad(
      center.clone().sub(r).sub(u),
      center.clone().add(r).sub(u),
      center.clone().add(r).add(u),
      center.clone().sub(r).add(u),
    );
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.normals), 3));
    g.setAttribute("aColor", new BufferAttribute(new Float32Array(this.colors), 3));
    g.setAttribute("aKind", new BufferAttribute(new Float32Array(this.kinds), 1));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

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

/** A mirror at `center` turned so the driver sees straight back down the road in it. */
function mirrorFrame(center: Vector3) {
  const toEye = EYE.clone().sub(center).normalize();
  const normal = toEye.add(new Vector3(0, 0, 1)).normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal));
  return { center, normal, up, right, rotation };
}

export function buildCabin() {
  const b = new CabinBuilder();
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

    // Side mirror outside, angled so the driver sees the road behind
    const sideMirror = mirrorFrame(v(side * 1.0, 0.98, -0.5));
    b.paint(DARK, KIND.gloss).box(
      sideMirror.center.clone().addScaledVector(sideMirror.normal, -0.036),
      0.2,
      0.11,
      0.07,
      sideMirror.rotation,
    );
    b.paint("#3a2350", KIND.mirror).panel(sideMirror.center, sideMirror.right, sideMirror.up, 0.17, 0.085);
    b.paint(DARK).beam(v(side * 0.79, 0.95, -0.55), v(side * 0.92, 0.97, -0.52), 0.03, 0.02);
  }

  /* ----------------------------- Roof ------------------------------ */
  b.paint(DARK).quad(v(-0.68, 1.41, -0.12), v(0.68, 1.41, -0.12), v(0.68, 1.43, 0.9), v(-0.68, 1.43, 0.9));
  b.paint(PLASTIC).box(v(0, 1.392, -0.08), 1.34, 0.04, 0.12);
  b.paint(PINK, KIND.neon, 2).box(v(0, 1.37, -0.135), 1.2, 0.005, 0.006);
  // Sun visors folded up
  b.paint(SOFT).box(v(-0.36, 1.38, -0.02), 0.42, 0.02, 0.16);
  b.paint(SOFT).box(v(0.36, 1.38, -0.02), 0.42, 0.02, 0.16);

  // Rear-view mirror, tilted toward the driver
  b.paint(DARK).beam(v(0, 1.4, -0.16), v(0, 1.33, -0.2), 0.02, 0.02);
  {
    const mirror = mirrorFrame(v(0, 1.3, -0.2));
    b.paint(DARK, KIND.gloss).box(
      mirror.center.clone().addScaledVector(mirror.normal, -0.016),
      0.26,
      0.07,
      0.03,
      mirror.rotation,
    );
    b.paint("#2a1840", KIND.mirror).panel(mirror.center, mirror.right, mirror.up, 0.24, 0.055);
  }

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
