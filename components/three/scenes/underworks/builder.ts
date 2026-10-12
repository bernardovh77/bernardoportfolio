import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from "three";

/**
 * Builds the whole Underworks out of simple pieces (boxes, cylinders, gears...)
 * merged into a single geometry, so the GPU draws everything in one call.
 *
 * Every vertex remembers how its piece moves (spin, sway, crusher...), and the
 * vertex shader animates it, so nothing is updated from JavaScript per frame.
 */

/** Surface treatments, decoded in the fragment shader. */
export const PATTERN = {
  plain: 0,
  hazard: 1,
  brick: 2,
  plate: 3,
  molten: 5,
  crust: 6,
  hot: 7,
} as const;

/** How a piece moves, decoded in the vertex shader. */
export const MOTION = {
  none: 0,
  /** Turns around the pivot (z axis) at `speed` rad/s */
  spin: 1,
  /** Turns one notch of `amp` rad per cycle, then jams */
  stutter: 2,
  /** Swings like a pendulum, `amp` rad either way */
  sway: 3,
  /** Rises slowly and slams down by `amp` units */
  crusher: 4,
  /** A broken lift: parked, then lurches down by up to `amp` and winches back */
  lift: 5,
  /** Moves down (positive amp) or up (negative amp) and wraps over `speed` */
  conveyor: 6,
} as const;

export type MotionSpec = {
  type: number;
  speed?: number;
  phase?: number;
  amp?: number;
  pivot?: Vector3;
};

class FloatBuffer {
  data: Float32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }
  push4(a: number, b: number, c: number, d: number) {
    if (this.length + 4 > this.data.length) this.grow();
    const i = this.length;
    this.data[i] = a;
    this.data[i + 1] = b;
    this.data[i + 2] = c;
    this.data[i + 3] = d;
    this.length += 4;
  }
  push3(a: number, b: number, c: number) {
    if (this.length + 3 > this.data.length) this.grow();
    const i = this.length;
    this.data[i] = a;
    this.data[i + 1] = b;
    this.data[i + 2] = c;
    this.length += 3;
  }
  private grow() {
    const next = new Float32Array(this.data.length * 2);
    next.set(this.data);
    this.data = next;
  }
  trimmed() {
    return this.data.slice(0, this.length);
  }
}

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();
const CORNERS = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
].map(([x, y, z]) => new Vector3(x, y, z));
// Box faces as corner indices, counter-clockwise seen from outside
const BOX_FACES = [
  [4, 5, 6, 7], // +z
  [1, 0, 3, 2], // -z
  [5, 1, 2, 6], // +x
  [0, 4, 7, 3], // -x
  [7, 6, 2, 3], // +y
  [0, 1, 5, 4], // -y
];

export class MeshBuilder {
  private positions = new FloatBuffer(1 << 16);
  private normals = new FloatBuffer(1 << 16);
  private pivots = new FloatBuffer(1 << 16);
  private motions = new FloatBuffer(1 << 16);
  private tints = new FloatBuffer(1 << 16);
  private indices: number[] = [];
  private vertexCount = 0;

  private tint: [number, number, number, number] = [0.1, 0.1, 0.1, 0];
  private motion: [number, number, number, number] = [0, 0, 0, 0];
  private pivot: [number, number, number] = [0, 0, 0];
  private corners = CORNERS.map(() => new Vector3());

  /** Sets the color (linear) and surface pattern of the next pieces. */
  paint(color: Color, pattern: number = PATTERN.plain) {
    this.tint = [color.r, color.g, color.b, pattern];
    return this;
  }

  /** Sets how the next pieces move (until `still()` is called). */
  move(spec: MotionSpec) {
    this.motion = [spec.type, spec.speed ?? 0, spec.phase ?? 0, spec.amp ?? 0];
    const p = spec.pivot;
    this.pivot = p ? [p.x, p.y, p.z] : [0, 0, 0];
    return this;
  }

  still() {
    this.motion = [0, 0, 0, 0];
    this.pivot = [0, 0, 0];
    return this;
  }

  get vertices() {
    return this.vertexCount;
  }

  private vertex(v: Vector3, n: Vector3) {
    this.positions.push3(v.x, v.y, v.z);
    this.normals.push3(n.x, n.y, n.z);
    this.pivots.push3(this.pivot[0], this.pivot[1], this.pivot[2]);
    this.motions.push4(this.motion[0], this.motion[1], this.motion[2], this.motion[3]);
    this.tints.push4(this.tint[0], this.tint[1], this.tint[2], this.tint[3]);
    return this.vertexCount++;
  }

  /** Faces pointing away from the camera are never seen (it always looks down -z), so skip them. */
  private hidden(n: Vector3) {
    return n.z < -0.6;
  }

  tri(a: Vector3, b: Vector3, c: Vector3) {
    _n.subVectors(b, a).cross(_b.subVectors(c, a));
    if (_n.lengthSq() < 1e-12) return;
    _n.normalize();
    if (this.hidden(_n)) return;
    const i = this.vertex(a, _n);
    this.vertex(b, _n);
    this.vertex(c, _n);
    this.indices.push(i, i + 1, i + 2);
  }

  /** A flat quad, corners counter-clockwise seen from the front. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
    _n.subVectors(b, a).cross(_b.subVectors(c, a));
    if (_n.lengthSq() < 1e-12) _n.subVectors(c, a).cross(_b.subVectors(d, a));
    if (_n.lengthSq() < 1e-12) return;
    _n.normalize();
    if (this.hidden(_n)) return;
    const i = this.vertex(a, _n);
    this.vertex(b, _n);
    this.vertex(c, _n);
    this.vertex(d, _n);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A quad whose front is turned toward `dir` (whatever order the corners come in). */
  quadToward(a: Vector3, b: Vector3, c: Vector3, d: Vector3, dir: Vector3) {
    _n.subVectors(b, a).cross(_b.subVectors(c, a));
    if (_n.dot(dir) < 0) return this.quad(d, c, b, a);
    return this.quad(a, b, c, d);
  }

  /** A box from a transform matrix (unit cube from -1 to 1 in local space). */
  boxMatrix(matrix: Matrix4) {
    const c = this.corners;
    for (let i = 0; i < 8; i++) c[i].copy(CORNERS[i]).applyMatrix4(matrix);
    for (const [a, b, d, e] of BOX_FACES) this.quad(c[a], c[b], c[d], c[e]);
    return this;
  }

  /** An axis-aligned box (optionally turned around z by `rotZ`). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotZ = 0) {
    _m.makeRotationZ(rotZ);
    _m.scale(_a.set(sx / 2, sy / 2, sz / 2));
    _m.setPosition(x, y, z);
    return this.boxMatrix(_m);
  }

  /** A square-section beam from a to b. Its front face stays turned toward the camera. */
  beam(a: Vector3, b: Vector3, width: number, depth = width) {
    _x.subVectors(b, a);
    const length = _x.length();
    if (length < 1e-4) return this;
    _x.divideScalar(length);
    _z.set(0, 0, 1).addScaledVector(_x, -_x.z);
    if (_z.lengthSq() < 1e-6) _z.set(0, 1, 0).addScaledVector(_x, -_x.y);
    _z.normalize();
    _y.crossVectors(_z, _x);
    _m.makeBasis(
      _x.multiplyScalar(length / 2),
      _y.multiplyScalar(width / 2),
      _z.multiplyScalar(depth / 2),
    );
    _m.setPosition(_a.addVectors(a, b).multiplyScalar(0.5));
    return this.boxMatrix(_m);
  }

  /** A cylinder (or cone) from a to b with `segments` sides. */
  cylinder(a: Vector3, b: Vector3, radiusA: number, radiusB = radiusA, segments = 8, caps = true) {
    _y.subVectors(b, a);
    if (_y.lengthSq() < 1e-8) return this;
    _y.normalize();
    _x.set(0, 0, 1).cross(_y);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize();
    _z.crossVectors(_x, _y);
    const ringA: Vector3[] = [];
    const ringB: Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cx = Math.cos(angle);
      const cz = Math.sin(angle);
      ringA.push(
        a
          .clone()
          .addScaledVector(_x, cx * radiusA)
          .addScaledVector(_z, cz * radiusA),
      );
      ringB.push(
        b
          .clone()
          .addScaledVector(_x, cx * radiusB)
          .addScaledVector(_z, cz * radiusB),
      );
    }
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      this.quad(ringA[j], ringA[i], ringB[i], ringB[j]);
    }
    if (caps) {
      for (let i = 1; i < segments - 1; i++) {
        this.tri(ringB[0], ringB[i + 1], ringB[i]);
        this.tri(ringA[0], ringA[i], ringA[i + 1]);
      }
    }
    return this;
  }

  /**
   * A gear facing the camera. `missing` teeth are left out (unfinished gears),
   * `sharp` makes saw-blade teeth.
   */
  gear(
    center: Vector3,
    opts: {
      teeth: number;
      tip: number;
      root: number;
      rim: number;
      thickness: number;
      hub?: number;
      spokes?: number;
      missing?: (index: number) => boolean;
      sharp?: boolean;
    },
  ) {
    const { teeth, tip, root, rim, thickness } = opts;
    const front = center.z + thickness / 2;
    const back = center.z - thickness / 2;
    const outline: [number, number][] = [];
    const w = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a0 = i * w;
      const gone = opts.missing?.(i) ?? false;
      const r = gone ? root : tip;
      if (opts.sharp) {
        outline.push([a0, root], [a0 + w * 0.82, r]);
      } else {
        outline.push([a0, root], [a0 + w * 0.16, r], [a0 + w * 0.48, r], [a0 + w * 0.64, root]);
        outline.push([a0 + w * 0.82, root]);
      }
    }
    const point = (angle: number, radius: number, z: number) =>
      new Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, z);
    const count = outline.length;
    for (let k = 0; k < count; k++) {
      const [a1, r1] = outline[k];
      const [a2raw, r2] = outline[(k + 1) % count];
      const a2 = k + 1 === count ? a2raw + Math.PI * 2 : a2raw;
      // Face of the rim
      this.quad(
        point(a1, rim, front),
        point(a1, r1, front),
        point(a2, r2, front),
        point(a2, rim, front),
      );
      // Outer wall
      this.quad(
        point(a1, r1, back),
        point(a2, r2, back),
        point(a2, r2, front),
        point(a1, r1, front),
      );
      // Inner wall of the rim (faces the hole)
      if (opts.spokes !== 0) {
        this.quad(
          point(a2, rim, back),
          point(a1, rim, back),
          point(a1, rim, front),
          point(a2, rim, front),
        );
      }
    }
    const hub = opts.hub ?? rim * 0.28;
    const spokes = opts.spokes ?? 5;
    if (spokes === 0) {
      // Solid disc instead of spokes
      for (let k = 0; k < count; k++) {
        const a1 = outline[k][0];
        const a2 = k + 1 === count ? outline[0][0] + Math.PI * 2 : outline[k + 1][0];
        this.tri(
          new Vector3(center.x, center.y, front),
          point(a1, rim, front),
          point(a2, rim, front),
        );
      }
      return this;
    }
    this.cylinder(
      new Vector3(center.x, center.y, back),
      new Vector3(center.x, center.y, front + thickness * 0.3),
      hub,
      hub,
      10,
    );
    for (let s = 0; s < spokes; s++) {
      const angle = (s / spokes) * Math.PI * 2 + 0.3;
      const from = point(angle, hub * 0.8, center.z);
      const to = point(angle, rim * 1.02, center.z);
      this.beam(from, to, Math.max(0.35, rim * 0.16), thickness * 0.7);
    }
    return this;
  }

  /** A chain hanging straight down from `top`. */
  chain(top: Vector3, length: number, link = 0.9, width = 0.32) {
    const count = Math.max(1, Math.round(length / (link * 0.78)));
    for (let i = 0; i < count; i++) {
      const y = top.y - i * link * 0.78 - link / 2;
      if (i % 2 === 0) this.box(top.x, y, top.z, width, link, width * 0.35);
      else this.box(top.x, y, top.z, width * 0.35, link, width);
    }
    return this;
  }

  /** A lattice girder between two points (two chords and zig-zag diagonals). */
  truss(a: Vector3, b: Vector3, height: number, chord = 0.45, panels = 0) {
    _x.subVectors(b, a);
    const length = _x.length();
    const dir = _x.clone().divideScalar(length);
    // "Up" of the truss: perpendicular to it, in the plane facing the camera
    const up = new Vector3(-dir.y, dir.x, 0);
    if (up.lengthSq() < 1e-6) up.set(1, 0, 0);
    up.normalize().multiplyScalar(height / 2);
    const n = panels || Math.max(1, Math.round(length / height));
    const top0 = a.clone().add(up);
    const top1 = b.clone().add(up);
    const bot0 = a.clone().sub(up);
    const bot1 = b.clone().sub(up);
    this.beam(top0, top1, chord);
    this.beam(bot0, bot1, chord);
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const p0 = (i % 2 === 0 ? bot0 : top0).clone().lerp(i % 2 === 0 ? bot1 : top1, t0);
      const p1 = (i % 2 === 0 ? top0 : bot0).clone().lerp(i % 2 === 0 ? top1 : bot1, t1);
      this.beam(p0, p1, chord * 0.6);
    }
    return this;
  }

  /** A surface of revolution around the vertical axis (profile is [radius, height] pairs). */
  lathe(center: Vector3, profile: [number, number][], segments = 16) {
    for (let p = 0; p < profile.length - 1; p++) {
      const [r1, y1] = profile[p];
      const [r2, y2] = profile[p + 1];
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        const at = (r: number, y: number, a: number) =>
          new Vector3(center.x + Math.cos(a) * r, center.y + y, center.z + Math.sin(a) * r);
        this.quad(at(r1, y1, a2), at(r1, y1, a1), at(r2, y2, a1), at(r2, y2, a2));
      }
    }
    return this;
  }

  /** A flat polygon facing the camera (points must be star-shaped around their average). */
  polygon(input: [number, number][], z: number) {
    // Counter-clockwise, so the face points at the camera
    let area = 0;
    for (let i = 0; i < input.length; i++) {
      const [x1, y1] = input[i];
      const [x2, y2] = input[(i + 1) % input.length];
      area += x1 * y2 - x2 * y1;
    }
    const points = area < 0 ? [...input].reverse() : input;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of points) {
      cx += x;
      cy += y;
    }
    cx /= points.length;
    cy /= points.length;
    const c = new Vector3(cx, cy, z);
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      this.tri(c, new Vector3(x1, y1, z), new Vector3(x2, y2, z));
    }
    return this;
  }

  /**
   * A wall seen face on: everything between a jagged edge (x for each y) and
   * `outerX`, with a thin side face along the edge that catches the light.
   */
  wall(edge: [number, number][], outerX: number, z: number, depth: number) {
    const front = new Vector3(0, 0, 1);
    const inward = new Vector3(-Math.sign(outerX), 0, 0);
    for (let i = 0; i < edge.length - 1; i++) {
      const [x1, y1] = edge[i];
      const [x2, y2] = edge[i + 1];
      this.quadToward(
        new Vector3(x1, y1, z),
        new Vector3(x2, y2, z),
        new Vector3(outerX, y2, z),
        new Vector3(outerX, y1, z),
        front,
      );
      this.quadToward(
        new Vector3(x1, y1, z - depth),
        new Vector3(x2, y2, z - depth),
        new Vector3(x2, y2, z),
        new Vector3(x1, y1, z),
        inward,
      );
    }
    return this;
  }

  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions.trimmed(), 3));
    geometry.setAttribute("normal", new BufferAttribute(this.normals.trimmed(), 3));
    geometry.setAttribute("aPivot", new BufferAttribute(this.pivots.trimmed(), 3));
    geometry.setAttribute("aMotion", new BufferAttribute(this.motions.trimmed(), 4));
    geometry.setAttribute("aTint", new BufferAttribute(this.tints.trimmed(), 4));
    const IndexArray = this.vertexCount > 65535 ? Uint32Array : Uint16Array;
    geometry.setIndex(new BufferAttribute(new IndexArray(this.indices), 1));
    return geometry;
  }
}
