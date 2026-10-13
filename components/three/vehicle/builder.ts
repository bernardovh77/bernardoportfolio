import { BufferAttribute, BufferGeometry, Color, Quaternion, Vector3 } from "three";

/**
 * Builds a mesh out of simple pieces (boxes, beams, profiles pulled across, rings,
 * cylinders, lofted hulls) merged into one geometry. Every vertex carries a color
 * (`aColor`, linear) and a "kind" (`aKind`) that the material's shader decodes:
 * the cabins use it for matte / neon / glossy surfaces and blinking lights,
 * the traffic for body / glass / lights.
 */

export const KIND = { matte: 0, neon: 1, gloss: 2, blink: 3 } as const;

/** Kind for a blinking light with its own phase (0..1): the phase rides along in the kind value. */
export function blinking(phase: number) {
  return KIND.blink + 0.4 * (phase - Math.floor(phase));
}

const _ab = new Vector3();
const _ac = new Vector3();
const _n = new Vector3();

export class PartBuilder {
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

  /** A flat disc (the end of a cylinder, a nozzle) facing `axis`. */
  disc(center: Vector3, axis: Vector3, radius: number, sides = 12) {
    const n = axis.clone().normalize();
    const u = new Vector3(0, 0, 1).cross(n);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const v = new Vector3().crossVectors(n, u).normalize();
    const rim = (i: number) => {
      const t = (i / sides) * Math.PI * 2;
      return center.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius);
    };
    for (let i = 0; i < sides; i++) this.tri(center, rim(i), rim(i + 1));
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

  /**
   * A slab with rounded corners: a rounded rectangle in the plane of `right` and `up`,
   * pushed `depth` back along its normal (the front face stays at `center`).
   */
  roundedSlab(
    center: Vector3,
    right: Vector3,
    up: Vector3,
    width: number,
    height: number,
    depth: number,
    radius: number,
    segments = 5,
  ) {
    const normal = new Vector3().crossVectors(right, up).normalize();
    const r = Math.min(radius, width / 2, height / 2);
    const hw = width / 2 - r;
    const hh = height / 2 - r;
    const outline: [number, number][] = [];
    const corners: [number, number, number][] = [
      [hw, hh, 0],
      [-hw, hh, Math.PI / 2],
      [-hw, -hh, Math.PI],
      [hw, -hh, Math.PI * 1.5],
    ];
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= segments; i++) {
        const a = start + (i / segments) * (Math.PI / 2);
        outline.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    const at = (u: number, w: number, push: number) =>
      center.clone().addScaledVector(right, u).addScaledVector(up, w).addScaledVector(normal, push);
    const front = outline.map(([u, w]) => at(u, w, 0));
    const back = outline.map(([u, w]) => at(u, w, -depth));
    const frontCenter = at(0, 0, 0);
    const backCenter = at(0, 0, -depth);
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      this.tri(frontCenter, front[i], front[j]);
      this.tri(backCenter, back[j], back[i]);
      this.quad(back[i], back[j], front[j], front[i]);
    }
    return this;
  }

  /**
   * A skin stretched over cross-sections (each a row of points, all rows the same
   * length), like the hull of a ship: flat facets between neighboring rows.
   */
  loft(sections: Vector3[][]) {
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i];
      const b = sections[i + 1];
      for (let j = 0; j < a.length - 1; j++) this.quad(a[j], a[j + 1], b[j + 1], b[j]);
    }
    return this;
  }

  /** Beams along a polyline (struts that follow a curve). */
  polyBeam(points: Vector3[], width: number, depth = width, upHint?: (index: number) => Vector3) {
    for (let i = 0; i < points.length - 1; i++) {
      this.beam(points[i], points[i + 1], width, depth, upHint?.(i));
    }
    return this;
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

