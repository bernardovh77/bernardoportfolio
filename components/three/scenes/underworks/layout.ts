import { Color, Vector3 } from "three";
import type { WipProject } from "@/lib/content";
import { createRandom, type Random } from "@/lib/random";
import { SHAFT_DEPTH, SITE_SPACING, siteSide, siteY } from "@/lib/underworks";
import { MeshBuilder, MOTION, type MotionSpec, PATTERN } from "./builder";
import type { BurstSpec, Profile } from "./power";
import { SIGN_CELLS } from "./textures";

/*
 * The Underworks: a foundry shaft sinking under the city. Built as flat-ish
 * layers at fixed depths, like a painted backdrop with real parallax:
 *
 *   near  (z  +5)  dark girders and chains sliding past the camera
 *   mid   (z -30)  brick walls, catwalks, the construction sites, sparks
 *   back  (z -85)  the broken lift, scaffolding, a bucket elevator, pipes
 *   far   (z-150)  smokestacks and colossal gears fading into the smog
 *
 * and at the bottom, a pool of molten metal under a hanging crucible.
 */

export const Z_NEAR = 5;
export const Z_MID = -30;
export const Z_BACK = -85;
export const Z_FAR = -150;
export const TOP_Y = 24;
export const WALL_X = 50;
export const POOL_Y = -SHAFT_DEPTH - 20;
const BOTTOM_Y = POOL_Y - 40;

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

const C = {
  soot: new Color("#100d0b"),
  iron: new Color("#2d2621"),
  rust: new Color("#4d2c1c"),
  steel: new Color("#3a393a"),
  brick: new Color("#4d281a"),
  rock: new Color("#29221d"),
  concrete: new Color("#433d37"),
  bronze: new Color("#4a3522"),
  copper: new Color("#523424"),
  wood: new Color("#3e2c1c"),
  pale: new Color("#655a50"),
  paleDark: new Color("#4d443c"),
};

const BULB_COLORS = {
  tungsten: new Color("#ffb066"),
  amber: new Color("#ff9238"),
  red: new Color("#ff4a26"),
  cold: new Color("#bcd6ff"),
  molten: new Color("#ff6a1a"),
};

export type Sway = { pivot: Vector3; speed: number; phase: number; amp: number };

export type Bulb = {
  pos: Vector3;
  sway: Sway | null;
  color: Color;
  profile: Profile;
  seed: number;
  /** Glow size (world units) */
  size: number;
  /** How strongly it lights its surroundings */
  strength: number;
  radius: number;
  /** Bulbs on the mains dim during brownouts */
  mains: boolean;
};

export type EmitterKind = "weld" | "arc" | "impact" | "spatter";
export const EMITTER_KIND: Record<EmitterKind, number> = { weld: 0, arc: 1, impact: 2, spatter: 3 };

export type Emitter = {
  kind: EmitterKind;
  pos: Vector3;
  /** Where the arc lands (arcs only) */
  target: Vector3 | null;
  spec: BurstSpec | null;
  /** The crusher's cycle (impacts only) */
  cycle: { speed: number; phase: number } | null;
  sway: Sway | null;
  color: Color;
  light: number;
  /** Mirrors the spark spray left or right */
  direction: number;
};

export type Sign = {
  center: Vector3;
  width: number;
  height: number;
  cell: [number, number, number, number];
  motion?: MotionSpec;
};

export type Shaft = {
  top: Vector3;
  dx: number;
  width: number;
  length: number;
  phase: number;
  strength: number;
};

type Out = { bulbs: Bulb[]; emitters: Emitter[]; signs: Sign[]; shafts: Shaft[] };

/* ------------------------------------------------------------------ */
/* Small reusable pieces                                               */
/* ------------------------------------------------------------------ */

function hook(b: MeshBuilder, top: Vector3, size: number) {
  b.box(top.x, top.y - size * 0.4, top.z, size * 0.18, size * 0.8, size * 0.18);
  b.beam(
    v(top.x, top.y - size * 0.8, top.z),
    v(top.x + size * 0.45, top.y - size * 1.05, top.z),
    size * 0.18,
  );
  b.beam(
    v(top.x + size * 0.45, top.y - size * 1.05, top.z),
    v(top.x + size * 0.6, top.y - size * 0.7, top.z),
    size * 0.16,
  );
}

const PROFILES: [Profile, number][] = [
  ["steady", 0.3],
  ["buzz", 0.24],
  ["stutter", 0.2],
  ["failing", 0.13],
  ["dying", 0.08],
  ["dead", 0.05],
];

function pickProfile(rnd: Random): Profile {
  let x = rnd.next();
  for (const [profile, weight] of PROFILES) {
    if (x < weight) return profile;
    x -= weight;
  }
  return "steady";
}

/** A caged work lamp hanging from `top` on a cable. Returns the bulb. */
function hangingLamp(
  b: MeshBuilder,
  rnd: Random,
  out: Out,
  top: Vector3,
  drop: number,
  opts: { profile?: Profile; color?: Color; strength?: number; swing?: number } = {},
) {
  const sway: Sway = {
    pivot: top.clone(),
    speed: rnd.range(0.7, 1.2),
    phase: rnd.range(0, Math.PI * 2),
    amp: opts.swing ?? rnd.range(0.02, 0.07),
  };
  const pos = v(top.x, top.y - drop, top.z);
  b.move({
    type: MOTION.sway,
    speed: sway.speed,
    phase: sway.phase,
    amp: sway.amp,
    pivot: sway.pivot,
  });
  b.paint(C.soot).box(top.x, top.y - (drop - 0.6) / 2, top.z, 0.09, drop - 0.6, 0.09);
  // Shade and cage
  b.paint(C.iron);
  b.cylinder(v(pos.x, pos.y + 0.75, pos.z), v(pos.x, pos.y + 0.25, pos.z), 0.2, 0.75, 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const x = pos.x + Math.cos(a) * 0.42;
    const z = pos.z + Math.sin(a) * 0.42;
    b.beam(
      v(x, pos.y + 0.3, z),
      v(x * 0.6 + pos.x * 0.4, pos.y - 0.55, z * 0.6 + pos.z * 0.4),
      0.06,
    );
  }
  b.still();
  const profile = opts.profile ?? pickProfile(rnd);
  const bulb: Bulb = {
    pos,
    sway,
    color: opts.color ?? (rnd.chance(0.75) ? BULB_COLORS.tungsten : BULB_COLORS.amber),
    profile,
    seed: rnd.range(0, 100),
    size: 2.2,
    strength: opts.strength ?? 1,
    radius: 15,
    mains: true,
  };
  out.bulbs.push(bulb);
  return bulb;
}

/** A sagging cable between two points. */
function cable(b: MeshBuilder, a: Vector3, c: Vector3, sag: number, segments = 10, width = 0.14) {
  let prev = a.clone();
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const p = a.clone().lerp(c, t);
    p.y -= sag * 4 * t * (1 - t);
    b.beam(prev, p, width);
    prev = p;
  }
}

/* ------------------------------------------------------------------ */
/* Near layer                                                          */
/* ------------------------------------------------------------------ */

function nearLayer(b: MeshBuilder, rnd: Random, high: boolean) {
  const z = Z_NEAR;
  b.paint(C.soot);
  let side = 1;
  for (let y = TOP_Y + 6; y > BOTTOM_Y + 20; y -= rnd.range(16, 30)) {
    side = rnd.chance(0.7) ? -side : side;
    const x = side * rnd.range(19, 25);
    const h = rnd.range(16, 34);
    // An I-beam: web and two flanges
    b.box(x, y - h / 2, z, 0.5, h, 1.6);
    b.box(x - 0.8, y - h / 2, z, 0.35, h, 2.4);
    b.box(x + 0.8, y - h / 2, z, 0.35, h, 2.4);
    // Bolted plates
    for (let p = y - 3; p > y - h + 2; p -= rnd.range(5, 9))
      b.paint(C.iron, PATTERN.plate).box(x, p, z + 1.25, 2.6, 2.2, 0.2);
    b.paint(C.soot);
    if (rnd.chance(0.55)) {
      const from = v(x, y - h * rnd.range(0.2, 0.5), z);
      const to = v(x + side * 14, from.y - rnd.range(5, 12), z - 1);
      b.beam(from, to, 0.9, 1.1);
    }
  }
  // Chains close to the camera
  for (let i = 0; i < (high ? 5 : 3); i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const pivot = v(
      s * rnd.range(13, 18),
      rnd.range(-SHAFT_DEPTH, TOP_Y) + 30,
      z + rnd.range(-2, 2),
    );
    b.move({
      type: MOTION.sway,
      speed: rnd.range(0.35, 0.6),
      phase: rnd.range(0, 6),
      amp: 0.025,
      pivot,
    });
    b.paint(C.soot).chain(pivot, rnd.range(18, 34), 1.3, 0.42);
    b.still();
  }
}

/* ------------------------------------------------------------------ */
/* Construction sites, one per project                                 */
/* ------------------------------------------------------------------ */

type SiteContext = {
  b: MeshBuilder;
  rnd: Random;
  out: Out;
  high: boolean;
  /** Center of the platform's top surface */
  base: Vector3;
  /** +1 if the site is on the right of the shaft, -1 on the left */
  side: number;
  progress: number;
  index: number;
};

function welder(ctx: SiteContext, pos: Vector3) {
  ctx.out.emitters.push({
    kind: "weld",
    pos,
    target: null,
    spec: { slot: 4.4, minDuration: 0.5, maxDuration: 1.5, quiet: 0.12, seed: 11 + ctx.index * 7 },
    cycle: null,
    sway: null,
    color: new Color("#c8d4ff"),
    light: 2.2,
    direction: -ctx.side,
  });
}

function scaffold(ctx: SiteContext, x0: number, x1: number, y0: number, y1: number, z: number) {
  const { b, rnd } = ctx;
  b.paint(C.rust);
  const bays = Math.max(1, Math.round(Math.abs(x1 - x0) / 3.2));
  const levels = Math.max(1, Math.round((y1 - y0) / 3));
  for (let i = 0; i <= bays; i++) {
    const x = x0 + ((x1 - x0) * i) / bays;
    b.box(x, (y0 + y1) / 2, z, 0.18, y1 - y0, 0.18);
  }
  for (let l = 1; l <= levels; l++) {
    const y = y0 + ((y1 - y0) * l) / levels;
    for (let i = 0; i < bays; i++) {
      if (rnd.chance(0.15)) continue;
      const xa = x0 + ((x1 - x0) * i) / bays;
      const xb = x0 + ((x1 - x0) * (i + 1)) / bays;
      b.beam(v(xa, y, z), v(xb, y, z), 0.14);
      if (rnd.chance(0.35)) b.beam(v(xa, y - (y1 - y0) / levels, z), v(xb, y, z), 0.1);
      if (rnd.chance(0.5))
        b.paint(C.wood)
          .box((xa + xb) / 2, y + 0.12, z - 0.6, Math.abs(xb - xa) * 0.95, 0.16, 1.2)
          .paint(C.rust);
    }
  }
}

function towerSite(ctx: SiteContext) {
  const { b, rnd, base, side, progress } = ctx;
  const floors = 7;
  const fh = 2.8;
  const w = 11;
  const d = 7;
  const built = Math.max(1, Math.round((progress / 100) * floors));
  const columns = [-w / 2, -w / 6, w / 6, w / 2];
  const cx = base.x;
  const zf = base.z + d / 2;
  const zb = base.z - d / 2;
  for (let f = 0; f < built; f++) {
    const y = base.y + f * fh;
    b.paint(C.concrete).box(cx, y + fh - 0.22, base.z, w + 0.5, 0.44, d + 0.5);
    for (const ox of columns) {
      b.box(cx + ox, y + fh / 2, zf, 0.5, fh, 0.5);
      b.box(cx + ox, y + fh / 2, zb, 0.5, fh, 0.5);
    }
    // Some floors already clad, with gaps where panels are missing
    if (f < built - 1 || rnd.chance(0.4)) {
      for (let k = 0; k < columns.length - 1; k++) {
        if (rnd.chance(0.3)) continue;
        const x = cx + (columns[k] + columns[k + 1]) / 2;
        b.paint(C.steel, PATTERN.plate).box(
          x,
          y + fh * 0.5,
          zf + 0.1,
          (w / 3) * 0.92,
          fh * 0.78,
          0.18,
        );
      }
    }
  }
  // The floor being built: unfinished columns with rebar sticking out
  const top = base.y + built * fh;
  b.paint(C.concrete);
  const front: Vector3[] = [];
  for (const ox of columns) {
    for (const z of [zf, zb]) {
      const h = fh * rnd.range(0.25, 0.95);
      b.box(cx + ox, top + h / 2, z, 0.5, h, 0.5);
      if (z === zf) front.push(v(cx + ox, top + h, z));
      b.paint(C.rust);
      for (let r = 0; r < 2; r++) {
        const from = v(cx + ox + (r - 0.5) * 0.25, top + h, z);
        b.beam(from, from.clone().add(v(rnd.range(-0.4, 0.4), rnd.range(0.8, 1.8), 0)), 0.07);
      }
      b.paint(C.concrete);
    }
  }
  // Scaffolding around the build front
  scaffold(ctx, cx - w / 2 - 1.2, cx + w / 2 + 1.2, top - fh, top + fh * 1.4, zf + 1.4);
  // A tower crane: mast beside the tower, jib reaching over the shaft
  const mastX = cx + side * (w / 2 + 2.6);
  const mastTop = top + fh * 2.4;
  b.paint(C.rust, PATTERN.hazard);
  b.truss(v(mastX, base.y, base.z), v(mastX, mastTop, base.z), 1.6, 0.22);
  const jibEnd = v(mastX - side * 19, mastTop + 0.8, base.z);
  b.truss(v(mastX + side * 4, mastTop + 0.8, base.z), jibEnd, 1.2, 0.18);
  b.paint(C.iron).box(mastX + side * 3.6, mastTop - 0.4, base.z, 2.4, 1.8, 1.6);
  // Load swinging from the hook
  const hookTop = v(mastX - side * 14, mastTop, base.z);
  const sway = { pivot: hookTop, speed: 0.55, phase: ctx.index * 1.7, amp: 0.05 };
  b.move({ type: MOTION.sway, ...sway });
  b.paint(C.soot).box(hookTop.x, hookTop.y - 4, hookTop.z, 0.08, 8, 0.08);
  hook(b, v(hookTop.x, hookTop.y - 8, hookTop.z), 1.1);
  b.paint(C.rust, PATTERN.hazard).box(hookTop.x, hookTop.y - 9.6, hookTop.z, 6, 0.55, 0.6);
  b.still();
  welder(ctx, front[1 + (rnd.chance(0.5) ? 1 : 0)].clone().add(v(0, 0, 0.4)));
}

function domeSite(ctx: SiteContext) {
  const { b, rnd, base, side, progress } = ctx;
  const R = 9.5;
  const meridians = ctx.high ? 14 : 10;
  const rings = 6;
  const limit = Math.max(0.12, progress / 100);
  const center = v(base.x, base.y, base.z);
  const point = (theta: number, phi: number) =>
    v(
      center.x + R * Math.cos(theta) * Math.cos(phi),
      center.y + R * Math.sin(theta),
      center.z + R * Math.cos(theta) * Math.sin(phi) * 0.75,
    );
  b.paint(C.bronze);
  // Base ring
  for (let m = 0; m < meridians * 2; m++) {
    const a1 = (m / (meridians * 2)) * Math.PI * 2;
    const a2 = ((m + 1) / (meridians * 2)) * Math.PI * 2;
    b.beam(point(0, a1), point(0, a2), 0.45);
  }
  let front = point(0, Math.PI / 2);
  // Ribs climb from the base; only `progress` of the height is built
  for (let m = 0; m < meridians; m++) {
    const phi = (m / meridians) * Math.PI * 2;
    const reach = limit * (0.75 + 0.5 * rnd.next());
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings;
      const t1 = (r + 1) / rings;
      if (t1 > reach) break;
      const p0 = point((t0 * Math.PI) / 2, phi);
      const p1 = point((t1 * Math.PI) / 2, phi);
      b.beam(p0, p1, 0.3);
      if (Math.sin(phi) > 0.6 && p1.y > front.y - 0.1) front = p1;
    }
  }
  for (let r = 1; r < rings; r++) {
    const t = r / rings;
    if (t > limit) break;
    for (let m = 0; m < meridians; m++) {
      if (rnd.chance(0.12)) continue;
      const a1 = (m / meridians) * Math.PI * 2;
      const a2 = ((m + 1) / meridians) * Math.PI * 2;
      b.beam(point((t * Math.PI) / 2, a1), point((t * Math.PI) / 2, a2), 0.22);
    }
  }
  // A temporary support tower in the middle and a jib crane
  b.paint(C.rust, PATTERN.hazard);
  const mastTop = base.y + R * 1.25;
  b.truss(v(center.x, base.y, center.z), v(center.x, mastTop, center.z), 1.2, 0.18);
  const jibEnd = v(center.x - side * 13, mastTop + 1, center.z);
  b.truss(v(center.x + side * 3, mastTop + 1, center.z), jibEnd, 1, 0.16);
  const hookTop = jibEnd.clone().add(v(side * 2, -0.5, 0));
  b.move({ type: MOTION.sway, pivot: hookTop, speed: 0.6, phase: ctx.index, amp: 0.06 });
  b.paint(C.soot).box(hookTop.x, hookTop.y - 3.5, hookTop.z, 0.08, 7, 0.08);
  b.paint(C.bronze).beam(
    v(hookTop.x - 2.5, hookTop.y - 7.2, hookTop.z),
    v(hookTop.x + 2.5, hookTop.y - 7.8, hookTop.z),
    0.3,
  );
  b.still();
  welder(ctx, front.clone().add(v(0, 0.2, 0.5)));
}

function gearSite(ctx: SiteContext) {
  const { b, base, side, progress } = ctx;
  const r = 9;
  const teeth = 18;
  const built = Math.max(1, Math.round((progress / 100) * teeth));
  const center = v(base.x, base.y + r + 1.6, base.z);
  // Cradle
  b.paint(C.iron);
  for (const s of [-1, 1]) {
    b.beam(v(center.x + s * 7, base.y, base.z + 1.8), v(center.x, center.y, base.z + 1.8), 0.6);
    b.beam(v(center.x + s * 7, base.y, base.z - 1.8), v(center.x, center.y, base.z - 1.8), 0.6);
  }
  b.cylinder(
    v(center.x, center.y, base.z - 2.4),
    v(center.x, center.y, base.z + 2.4),
    0.7,
    0.7,
    10,
  );
  // Teeth are fitted from the bottom up, both ways around
  const step = (Math.PI * 2) / teeth;
  const startTooth = Math.round(-Math.PI / 2 / step - 0.32 + teeth) % teeth;
  const distance = (i: number) => {
    const k = (i - startTooth + teeth) % teeth;
    return [Math.min(k, teeth - k), k] as const;
  };
  const ranked = [...Array(teeth).keys()].sort((a, c) => {
    const [da, ka] = distance(a);
    const [dc, kc] = distance(c);
    return da - dc || ka - kc;
  });
  const fitted = new Set(ranked.slice(0, built));
  b.paint(C.bronze);
  b.gear(center, {
    teeth,
    tip: r,
    root: r - 1.6,
    rim: r - 3,
    thickness: 1.6,
    spokes: 6,
    hub: 1.6,
    missing: (i) => !fitted.has(i),
  });
  // The next tooth, hanging from a chain hoist
  const gap = ranked[Math.min(built, teeth - 1)];
  const angle = gap * step + step * 0.32;
  const toothAt = v(
    center.x + Math.cos(angle) * (r + 3.5),
    center.y + Math.sin(angle) * (r + 3.5),
    center.z + 1,
  );
  const hoistTop = v(toothAt.x, base.y + r * 2 + 9, toothAt.z);
  b.paint(C.iron).truss(
    v(center.x + side * 9, hoistTop.y, base.z),
    v(center.x - side * 9, hoistTop.y, base.z),
    1,
    0.2,
  );
  for (const s of [-1, 1])
    b.box(center.x + s * 9, (base.y + hoistTop.y) / 2, base.z - 1, 0.6, hoistTop.y - base.y, 0.6);
  b.move({ type: MOTION.sway, pivot: hoistTop, speed: 0.7, phase: ctx.index * 2.1, amp: 0.04 });
  b.paint(C.soot).chain(hoistTop, hoistTop.y - toothAt.y - 1.2, 0.6, 0.22);
  b.paint(C.bronze).box(toothAt.x, toothAt.y, toothAt.z, 1.4, 2, 1.4);
  b.still();
  const last = ranked[built - 1];
  const lastAngle = last * step + step * 0.32;
  welder(
    ctx,
    v(center.x + Math.cos(lastAngle) * r, center.y + Math.sin(lastAngle) * r, center.z + 1.2),
  );
}

function site(ctx: SiteContext, art: WipProject["art"]) {
  const { b, rnd, out, base, side } = ctx;
  const inner = base.x - side * 17;
  const outer = side * (WALL_X + 2);
  const width = Math.abs(outer - inner);
  const mid = (inner + outer) / 2;
  // Platform slab with a worn hazard edge
  b.paint(C.concrete).box(mid, base.y - 0.7, base.z, width, 1.4, 13);
  b.paint(C.iron, PATTERN.hazard).box(mid, base.y - 0.7, base.z + 6.6, width, 1.5, 0.3);
  // Struts down to the wall, and broken railing along the edges
  b.paint(C.iron);
  for (const dz of [-4, 4]) {
    b.beam(
      v(side * WALL_X, base.y - 11, base.z + dz),
      v(base.x - side * 6, base.y - 1.3, base.z + dz),
      0.7,
    );
  }
  b.box(mid, base.y - 1.9, base.z, width, 0.6, 0.6);
  for (let x = inner; side > 0 ? x < outer - 3 : x > outer + 3; x += side * 2.2) {
    if (rnd.chance(0.2)) continue;
    b.box(x, base.y + 0.6, base.z + 6, 0.14, 1.2, 0.14);
  }
  const railBreak = inner + side * rnd.range(4, 9);
  b.beam(
    v(railBreak + side * 2, base.y + 1.2, base.z + 6),
    v(outer - side * 3, base.y + 1.2, base.z + 6),
    0.12,
  );
  // The broken piece of railing hangs off the edge
  const hang = v(railBreak + side * 2, base.y + 1.2, base.z + 6.1);
  b.move({ type: MOTION.sway, pivot: hang, speed: 0.9, phase: ctx.index * 3.1, amp: 0.08 });
  b.beam(hang, hang.clone().add(v(-side * 1.2, -3.5, 0)), 0.12);
  b.still();
  // Crates, a cable drum, a toolbox
  b.paint(C.wood);
  for (let k = 0; k < 3; k++) {
    const x = outer - side * rnd.range(4, 9);
    const s = rnd.range(1.1, 2);
    b.box(x, base.y + s / 2, base.z + rnd.range(-4, 2), s, s, s, rnd.range(-0.06, 0.06));
  }
  b.paint(C.rust).cylinder(
    v(outer - side * 10, base.y + 1.1, base.z - 3),
    v(outer - side * 10, base.y + 1.1, base.z - 1.4),
    1.1,
    1.1,
    10,
  );
  // Work lamp on a pole at the open end
  const poleX = inner + side * 1.2;
  b.paint(C.iron).box(poleX, base.y + 5, base.z + 4.8, 0.3, 10, 0.3);
  b.beam(v(poleX, base.y + 10, base.z + 4.8), v(poleX + side * 4, base.y + 10, base.z + 4.8), 0.22);
  const lamp = hangingLamp(b, rnd, out, v(poleX + side * 3.6, base.y + 10, base.z + 4.8), 2.2, {
    profile: ctx.index % 2 === 0 ? "buzz" : "stutter",
    strength: 1.8,
    swing: 0.03,
  });
  lamp.radius = 22;
  // A floodlight bolted to the wall, aimed at the work
  const flood = v(outer - side * 2.5, base.y + 13, base.z + 4);
  b.paint(C.iron).box(flood.x + side * 1.2, flood.y, flood.z - 1, 2.6, 0.4, 0.4);
  b.box(flood.x, flood.y, flood.z, 1.6, 1.2, 1.2, side * 0.5);
  out.bulbs.push({
    pos: flood.clone().add(v(-side * 0.7, -0.4, 0.7)),
    sway: null,
    color: BULB_COLORS.tungsten,
    profile: ctx.index % 3 === 2 ? "failing" : "steady",
    seed: 200 + ctx.index,
    size: 1.6,
    strength: 1.3,
    radius: 24,
    mains: true,
  });
  // Site number plate
  out.signs.push({
    center: v(mid + side * 4, base.y - 0.7, base.z + 6.8),
    width: 2.4,
    height: 2.4,
    cell: SIGN_CELLS.site(ctx.index),
  });

  if (art === "tower") towerSite(ctx);
  else if (art === "dome") domeSite(ctx);
  else gearSite(ctx);
}

/* ------------------------------------------------------------------ */
/* Mid layer                                                           */
/* ------------------------------------------------------------------ */

function midLayer(b: MeshBuilder, rnd: Random, high: boolean, out: Out, projects: WipProject[]) {
  const z = Z_MID;
  const count = projects.length;
  // Areas already taken, so girders and machines never run into each other
  const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const take = (xa: number, xb: number, ya: number, yb: number) =>
    taken.push({
      x0: Math.min(xa, xb),
      x1: Math.max(xa, xb),
      y0: Math.min(ya, yb),
      y1: Math.max(ya, yb),
    });
  const free = (xa: number, xb: number, ya: number, yb: number) => {
    const x0 = Math.min(xa, xb);
    const x1 = Math.max(xa, xb);
    const y0 = Math.min(ya, yb);
    const y1 = Math.max(ya, yb);
    return taken.every((r) => r.x1 < x0 || r.x0 > x1 || r.y1 < y0 || r.y0 > y1);
  };

  // The entrance sign and ledge
  take(29, 46, 7, 24);
  take(-52, -24, -7, 0);

  // Sites first: they are the closest big shapes, which helps the GPU skip hidden pixels
  projects.forEach((project, index) => {
    const side = siteSide(index);
    const base = v(side * (WALL_X - 20), siteY(index) - 7, z + 1);
    site({ b, rnd, out, high, base, side, progress: project.progress, index }, project.art);
    take(base.x - side * 18, side * (WALL_X + 2), base.y - 12, base.y + 27);
  });

  // The gaps between stops (entrance, sites, bottom) each get some machinery
  for (let g = 0; g <= count; g++) {
    const yg = -SITE_SPACING * (g + 0.5);
    const below = g < count ? siteSide(g) : -siteSide(g - 1);
    const above = -below;

    // Junction box with a live arc, high on the "below" side
    {
      const y = yg + 7;
      const s = below;
      const x = s * (WALL_X - 2.2);
      b.paint(C.steel, PATTERN.plate).box(x, y, z + 0.5, 3.2, 4.2, 1.4);
      b.paint(C.iron).box(x - s * 2.1, y - 0.3, z + 1.6, 0.25, 3.8, 2.2, s * 0.18);
      b.paint(C.soot);
      for (let w = 0; w < 4; w++) {
        cable(
          b,
          v(x + (w - 1.5) * 0.5, y - 2.1, z + 0.6),
          v(x + (w - 1.5) * 0.9 + s * 1.5, y - 4.5 - w * 0.7, z + 1),
          0.8,
          4,
          0.08,
        );
      }
      out.signs.push({
        center: v(x, y + 3.2, z + 1.25),
        width: 1.8,
        height: 1.8,
        cell: SIGN_CELLS.voltage,
      });
      const from = v(x - s * 1.7, y - 0.8, z + 1.3);
      const to = v(x - s * rnd.range(4.8, 6.4), y + rnd.range(-3, 1.2), z + 1.2);
      // The arc lands on a bent pipe sticking out of the wall
      b.paint(C.copper).beam(
        v(s * (WALL_X + 1), to.y - 2.5, to.z),
        v(s * (WALL_X - 2.5), to.y - 2.5, to.z),
        0.45,
      );
      b.beam(v(s * (WALL_X - 2.5), to.y - 2.5, to.z), to.clone().add(v(-s * 0.3, 0.2, 0)), 0.45);
      take(s * (WALL_X + 1), to.x - s * 1, y - 5, y + 4.5);
      out.emitters.push({
        kind: "arc",
        pos: from,
        target: to,
        spec: {
          slot: 5.2 + g * 0.7,
          minDuration: 0.15,
          maxDuration: 0.5,
          quiet: 0.2,
          seed: 31 + g * 13,
        },
        cycle: null,
        sway: null,
        color: new Color("#9ccaff"),
        light: 3,
        direction: -s,
      });
    }

    // A catwalk on the "below" side, sometimes snapped in half
    {
      const y = yg + 0.5;
      const s = below;
      const from = s * (WALL_X + 1);
      const length = rnd.range(26, 38);
      const broken = g === 1 || rnd.chance(0.3);
      const end = broken ? s * (WALL_X - length * 0.55) : s * (WALL_X - length);
      b.paint(C.iron, PATTERN.plate).box(
        (from + end) / 2,
        y,
        z + 2.5,
        Math.abs(end - from),
        0.35,
        2.2,
      );
      b.paint(C.iron);
      for (let x = from; s > 0 ? x > end : x < end; x -= s * 2.4) {
        if (!rnd.chance(0.15)) b.box(x, y + 0.65, z + 3.5, 0.12, 1.3, 0.12);
      }
      b.beam(v(from, y + 1.3, z + 3.5), v(end, y + 1.3, z + 3.5), 0.1);
      b.beam(v(s * WALL_X, y - 6, z + 1.5), v((from + end) / 2, y - 0.2, z + 1.5), 0.3);
      take(from, end - s * 3, y - 6, y + 1.5);
      if (broken) {
        // The other half hangs from its last bolt
        const pivot = v(end, y, z + 2.5);
        b.move({ type: MOTION.sway, pivot, speed: 0.45, phase: g * 2, amp: 0.035 });
        b.paint(C.iron, PATTERN.plate).beam(pivot, pivot.clone().add(v(-s * 2, -6, 0)), 0.35, 2.2);
        b.still();
      }
      // Cables drooping across the whole shaft above it
      if (high || g % 2 === 0) {
        b.paint(C.soot);
        cable(
          b,
          v(-WALL_X, y + rnd.range(6, 9), z - 3),
          v(WALL_X, y + rnd.range(6, 9), z - 3),
          rnd.range(4, 8),
          12,
          0.13,
        );
      }
    }

    // A cut cable dangling over the catwalk, spitting sparks
    if (g < 2 || high) {
      const s = below;
      const pivot = v(s * (WALL_X - 15 - g * 2), yg + 15, z + 2.6);
      const length = rnd.range(6.5, 8.5);
      if (free(pivot.x - 1, pivot.x + 1, pivot.y - length - 1, pivot.y)) {
        const sway: Sway = { pivot, speed: 0.8, phase: g * 2.4, amp: 0.09 };
        b.move({ type: MOTION.sway, ...sway });
        b.paint(C.soot).box(pivot.x, pivot.y - length / 2, pivot.z, 0.14, length, 0.14);
        b.paint(C.copper).box(pivot.x, pivot.y - length - 0.15, pivot.z, 0.22, 0.4, 0.22);
        b.still();
        b.paint(C.iron).box(pivot.x, pivot.y + 0.3, z + 1, 6, 0.6, 3.6);
        take(pivot.x - 3, pivot.x + 3, pivot.y - length - 1, pivot.y + 1);
        out.emitters.push({
          kind: "spatter",
          pos: v(pivot.x, pivot.y - length - 0.3, pivot.z),
          target: null,
          spec: { slot: 3.4, minDuration: 0.08, maxDuration: 0.3, quiet: 0.3, seed: 57 + g * 5 },
          cycle: null,
          sway,
          color: new Color("#ffd2a0"),
          light: 0.8,
          direction: 1,
        });
      }
    }

    // On the "above" side, under the struts of the site above: the crusher, or a saw blade
    if (g === 1) {
      const y = yg - 9;
      const s = above;
      const x = s * (WALL_X - 13);
      const cz = z - 2;
      b.paint(C.iron);
      b.box(x - 4, y + 4, cz, 1.2, 12, 1.4);
      b.box(x + 4, y + 4, cz, 1.2, 12, 1.4);
      b.paint(C.iron, PATTERN.hazard).box(x, y + 10.4, cz, 10.4, 1.4, 1.8);
      b.paint(C.steel).box(x, y - 1.2, cz, 6, 2.4, 3);
      b.paint(C.iron).box(x, y - 3, cz, 9, 1.4, 3.4);
      b.beam(v(s * (WALL_X + 1), y + 10.4, cz), v(x + s * 5, y + 10.4, cz), 1);
      const cycle = { speed: 1 / 5.6, phase: 0.2 };
      b.move({ type: MOTION.crusher, speed: cycle.speed, phase: cycle.phase, amp: 5.5 });
      b.paint(C.steel).box(x, y + 7, cz, 0.9, 6, 0.9);
      b.paint(C.iron, PATTERN.hazard).box(x, y + 1.6, cz, 6.4, 3.2, 3.2);
      b.still();
      take(x - 6, s * (WALL_X + 1), y - 4, y + 11.5);
      out.emitters.push({
        kind: "impact",
        pos: v(x, y + 0.1, cz + 1.5),
        target: null,
        spec: null,
        cycle,
        sway: null,
        color: new Color("#ffb070"),
        light: 1.6,
        direction: 1,
      });
    } else if (g >= 2 && (high || g === 2)) {
      const s = above;
      const y = yg - 1;
      const center = v(s * (WALL_X - 4.5), y, z + 1);
      if (free(center.x - 5, center.x + 5, y - 5, y + 5)) {
        b.paint(C.iron, PATTERN.hazard).box(s * (WALL_X - 1), y, z, 3, 3, 2.4);
        b.move({ type: MOTION.spin, pivot: center, speed: -s * 3.2 });
        b.paint(C.steel).gear(center, {
          teeth: 26,
          tip: 4.4,
          root: 3.7,
          rim: 3.7,
          thickness: 0.25,
          spokes: 0,
          sharp: true,
        });
        b.still();
        take(center.x - 5, s * WALL_X, y - 5, y + 5);
      }
    }
  }

  // Girders sticking out of the walls wherever there is room; some snapped off
  let side = 1;
  for (let y = TOP_Y - 8; y > -SHAFT_DEPTH - 6; y -= rnd.range(9, 15)) {
    side = rnd.chance(0.7) ? -side : side;
    const broken = rnd.chance(0.35);
    const length = broken ? rnd.range(6, 13) : rnd.range(12, 26);
    const withLamp = !broken && rnd.chance(0.6);
    const reach = withLamp ? 8 : 12;
    if (!free(side * (WALL_X + 1), side * (WALL_X - length - 2), y - reach, y + 1.5)) continue;
    take(side * (WALL_X + 1), side * (WALL_X - length - 2), y - reach, y + 1.5);
    const start = v(side * (WALL_X + 1), y, z - 1);
    const end = v(side * (WALL_X - length), y - (broken ? rnd.range(0, 1.6) : 0), z - 1);
    b.paint(C.iron);
    b.beam(start, end, 0.7, 0.5);
    b.beam(start.clone().add(v(0, 0.55, 0)), end.clone().add(v(0, 0.55, 0)), 0.22, 1.5);
    b.beam(start.clone().add(v(0, -0.55, 0)), end.clone().add(v(0, -0.55, 0)), 0.22, 1.5);
    if (withLamp) {
      hangingLamp(b, rnd, out, end.clone().add(v(side * 1.5, -0.6, 0.4)), rnd.range(2.5, 6));
    } else if (rnd.chance(0.6)) {
      const pivot = end.clone().add(v(side * 0.8, -0.6, 0.3));
      const length2 = rnd.range(4, 9);
      b.move({
        type: MOTION.sway,
        pivot,
        speed: rnd.range(0.4, 0.8),
        phase: rnd.range(0, 6),
        amp: 0.05,
      });
      b.paint(C.soot).chain(pivot, length2, 0.7, 0.26);
      hook(b, v(pivot.x, pivot.y - length2, pivot.z), 1.2);
      b.still();
    }
  }

  // Brick walls of the shaft, stepped and patched
  for (const s of [-1, 1]) {
    const edge: [number, number][] = [];
    let x = s * WALL_X;
    for (let y = TOP_Y + 40; y > BOTTOM_Y; y -= rnd.range(7, 15)) {
      edge.push([x, y]);
      x = s * (WALL_X + rnd.pick([0, 0, 2.5, 1.5, 4]));
      edge.push([x, y - 0.01]);
    }
    edge.push([x, BOTTOM_Y]);
    b.paint(C.brick, PATTERN.brick).wall(edge, s * 240, z - 6, 4);
    // Buttresses
    b.paint(C.concrete);
    for (let y = TOP_Y; y > BOTTOM_Y + 20; y -= rnd.range(22, 34)) {
      const h = rnd.range(10, 18);
      if (!free(s * (WALL_X - 1), s * (WALL_X + 2), y - h / 2, y + h / 2)) continue;
      b.box(s * (WALL_X + 0.5), y, z - 4, 3, h, 5);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Bottom: the furnace                                                 */
/* ------------------------------------------------------------------ */

function furnace(b: MeshBuilder, rnd: Random, high: boolean, out: Out) {
  const cz = -48;
  // A pool of molten metal under a cracked crust
  const segments = high ? 44 : 28;
  const center = v(0, POOL_Y, cz);
  const at = (a: number) => v(Math.cos(a) * 75, POOL_Y, cz + Math.sin(a) * 42);
  b.paint(C.soot, PATTERN.crust);
  for (let k = 0; k < segments; k++) {
    const a1 = (k / segments) * Math.PI * 2;
    const a2 = ((k + 1) / segments) * Math.PI * 2;
    b.tri(center, at(a2), at(a1));
  }
  // Slag rocks around the rim
  b.paint(C.rock);
  for (let k = 0; k < (high ? 26 : 14); k++) {
    const a = rnd.range(Math.PI * 0.9, Math.PI * 2.1);
    const p = at(a);
    const s = rnd.range(3, 8);
    b.box(p.x, POOL_Y + s * 0.3, p.z, s * 1.4, s, s, rnd.range(-0.4, 0.4));
  }
  // The crucible, hanging from three chains
  const cc = v(-38, POOL_Y + 30, cz - 8);
  const pivot = v(cc.x, cc.y + 36, cc.z);
  b.move({ type: MOTION.sway, pivot, speed: 0.38, phase: 0.6, amp: 0.012 });
  b.paint(C.iron).lathe(
    cc,
    [
      [0.6, -8.5],
      [5.5, -7.6],
      [8.6, -4.4],
      [9.8, -0.5],
      [10.2, 2.4],
    ],
    high ? 22 : 14,
  );
  b.paint(C.iron, PATTERN.hot).lathe(
    cc,
    [
      [10.2, 2.4],
      [10.9, 2.6],
      [10.9, 3.2],
      [9.9, 3.2],
    ],
    high ? 22 : 14,
  );
  // Surface of the metal inside
  b.paint(C.soot, PATTERN.molten);
  const n = high ? 20 : 12;
  for (let k = 0; k < n; k++) {
    const a1 = (k / n) * Math.PI * 2;
    const a2 = ((k + 1) / n) * Math.PI * 2;
    b.tri(
      v(cc.x, cc.y + 2.6, cc.z),
      v(cc.x + Math.cos(a2) * 9.8, cc.y + 2.6, cc.z + Math.sin(a2) * 9.8),
      v(cc.x + Math.cos(a1) * 9.8, cc.y + 2.6, cc.z + Math.sin(a1) * 9.8),
    );
  }
  // Spout
  b.paint(C.iron, PATTERN.hot).beam(
    v(cc.x + 9.5, cc.y + 2.2, cc.z + 1),
    v(cc.x + 13, cc.y + 1.6, cc.z + 1),
    1.2,
    1.6,
  );
  b.paint(C.soot);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const from = v(cc.x + Math.cos(a) * 10, cc.y + 3, cc.z + Math.sin(a) * 10);
    const pieces = Math.round(from.distanceTo(pivot) / 1.4);
    for (let i = 0; i < pieces; i++) {
      const p0 = from.clone().lerp(pivot, i / pieces);
      const p1 = from.clone().lerp(pivot, (i + 0.8) / pieces);
      b.beam(p0, p1, i % 2 === 0 ? 0.45 : 0.18, i % 2 === 0 ? 0.18 : 0.45);
    }
  }
  b.still();
  // The pour
  const lip = v(cc.x + 13.2, cc.y + 1.2, cc.z + 1);
  b.paint(C.soot, PATTERN.molten).box(
    lip.x + 0.5,
    (lip.y + POOL_Y) / 2,
    lip.z,
    1.3,
    lip.y - POOL_Y,
    1.3,
  );
  out.bulbs.push({
    pos: v(lip.x + 0.5, POOL_Y + 1.5, lip.z + 1.5),
    sway: null,
    color: BULB_COLORS.molten,
    profile: "steady",
    seed: 3,
    size: 9,
    strength: 3.5,
    radius: 34,
    mains: false,
  });
  out.emitters.push({
    kind: "spatter",
    pos: v(lip.x + 0.5, POOL_Y + 0.5, lip.z + 1),
    target: null,
    spec: { slot: 2.2, minDuration: 0.4, maxDuration: 0.6, quiet: 0, seed: 91 },
    cycle: null,
    sway: null,
    color: new Color("#ff9a4a"),
    light: 0,
    direction: 1,
  });
  // Heat glow over the pool
  for (let k = 0; k < 3; k++) {
    out.bulbs.push({
      pos: v(-40 + k * 40 + rnd.range(-6, 6), POOL_Y + 3, cz + rnd.range(-6, 10)),
      sway: null,
      color: BULB_COLORS.molten,
      profile: "steady",
      seed: 10 + k,
      size: 14,
      strength: 2.2,
      radius: 40,
      mains: false,
    });
  }
  // The furnace mouth in the back wall
  const mouth = v(44, POOL_Y + 18, Z_BACK + 8);
  b.paint(C.brick, PATTERN.brick);
  const arch: [number, number][] = [];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    arch.push([mouth.x + Math.cos(a) * 16, mouth.y + Math.sin(a) * 13]);
  }
  for (let k = 0; k < 12; k++) {
    b.beam(v(arch[k][0], arch[k][1], mouth.z), v(arch[k + 1][0], arch[k + 1][1], mouth.z), 3.2, 3);
  }
  // The glowing inside of the mouth, shaped like the arch
  const glow: [number, number][] = [[mouth.x + 14, mouth.y - 19]];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    glow.push([mouth.x + Math.cos(a) * 14, mouth.y + Math.sin(a) * 11]);
  }
  glow.push([mouth.x - 14, mouth.y - 19]);
  b.paint(C.soot, PATTERN.hot).polygon(glow, mouth.z - 1.5);
  // The furnace door is a grate of iron bars
  b.paint(C.soot);
  for (let k = -5; k <= 5; k++) {
    const x = mouth.x + k * 2.5;
    const h = Math.sqrt(Math.max(0, 1 - ((k * 2.5) / 14) ** 2)) * 11;
    b.box(x, mouth.y + (h - 19) / 2, mouth.z, 0.55, h + 19, 0.6);
  }
  for (const y of [mouth.y - 10, mouth.y + 2]) b.box(mouth.x, y, mouth.z + 0.3, 28, 0.7, 0.6);
  b.paint(C.brick, PATTERN.brick);
  b.box(mouth.x - 19, mouth.y - 2, mouth.z, 6, 34, 4);
  b.box(mouth.x + 19, mouth.y - 2, mouth.z, 6, 34, 4);
}

/* ------------------------------------------------------------------ */
/* Back layer                                                          */
/* ------------------------------------------------------------------ */

function backLayer(b: MeshBuilder, rnd: Random, high: boolean, out: Out) {
  const z = Z_BACK;
  const top = TOP_Y + 30;
  const length = top - BOTTOM_Y;
  const midY = (top + BOTTOM_Y) / 2;

  // The broken lift
  const lx = -34;
  b.paint(C.iron);
  b.box(lx - 4, midY, z, 0.8, length, 0.8);
  b.box(lx + 4, midY, z, 0.8, length, 0.8);
  for (let y = top; y > BOTTOM_Y; y -= 7) {
    b.beam(v(lx - 4, y, z - 0.3), v(lx + 4, y - 7, z - 0.3), 0.3);
    b.box(lx, y, z - 0.3, 8, 0.4, 0.4);
  }
  b.paint(C.soot);
  b.box(lx - 1, midY, z + 0.6, 0.12, length, 0.12);
  b.box(lx + 1, midY, z + 0.6, 0.12, length, 0.12);
  const cageY = -26;
  b.move({ type: MOTION.lift, speed: 1 / 17, phase: 0.35, amp: 8 });
  b.paint(C.rust);
  b.box(lx, cageY + 3.4, z + 1.4, 7.4, 0.5, 3);
  b.box(lx, cageY - 3.4, z + 1.4, 7.4, 0.7, 3);
  for (let k = 0; k <= 8; k++) b.box(lx - 3.5 + k * 0.875, cageY, z + 2.8, 0.1, 6.6, 0.1);
  b.still();
  out.signs.push({
    center: v(lx, cageY + 0.2, z + 3),
    width: 2.6,
    height: 2.6,
    cell: SIGN_CELLS.lift,
    motion: { type: MOTION.lift, speed: 1 / 17, phase: 0.35, amp: 8 },
  });
  // Another cage that fell all the way down, crumpled at the bottom
  b.paint(C.rust);
  b.box(lx + 1, -SHAFT_DEPTH - 6, z + 2, 7.4, 0.6, 3, 0.35);
  for (let k = 0; k < 6; k++)
    b.box(lx - 1.5 + k * 1.1, -SHAFT_DEPTH - 3.5, z + 3, 0.12, 5, 0.12, 0.35 + (k % 2) * 0.2);

  // Scaffolding tower, with missing sections
  const sx = 34;
  b.paint(C.rust);
  const sections: [number, number][] = [
    [top - 10, -40],
    [-52, -SHAFT_DEPTH * 0.62],
    [-SHAFT_DEPTH * 0.7, BOTTOM_Y + 30],
  ];
  for (const [y0, y1] of sections) {
    for (const x of [sx, sx + 5, sx + 10]) b.box(x, (y0 + y1) / 2, z + 1, 0.3, y0 - y1, 0.3);
    for (let y = y0; y > y1; y -= 4) {
      if (rnd.chance(0.12)) continue;
      b.box(sx + 5, y, z + 1, 10, 0.22, 0.22);
      if (rnd.chance(0.4)) b.beam(v(sx, y, z + 1.2), v(sx + 5, y - 4, z + 1.2), 0.14);
      if (rnd.chance(0.3)) b.beam(v(sx + 10, y, z + 1.2), v(sx + 5, y - 4, z + 1.2), 0.14);
      if (rnd.chance(0.25))
        b.paint(C.wood)
          .box(sx + 5, y + 0.2, z + 0.4, 9.5, 0.2, 1.4)
          .paint(C.rust);
    }
  }

  // Bucket elevator: one side goes down full, the other comes back up
  const ex = 56;
  const loop = length - 10;
  b.paint(C.soot);
  b.box(ex - 2, midY, z, 0.25, length, 0.25);
  b.box(ex + 2, midY, z, 0.25, length, 0.25);
  const buckets = high ? 26 : 13;
  for (let k = 0; k < buckets; k++) {
    for (const s of [-1, 1]) {
      b.move({
        type: MOTION.conveyor,
        speed: s < 0 ? 1.4 : -1.4,
        amp: loop,
        phase: (k / buckets) * loop,
      });
      b.paint(C.iron).box(ex + s * 2, top - 4, z + 0.8, 2.4, 1.6, 1.8, s < 0 ? 0 : 0.5);
    }
  }
  b.still();

  // Pipe bundles with flanges and valve wheels
  b.paint(C.copper);
  for (const [px, r] of [
    [-52, 1.6],
    [-56.5, 1.1],
    [-49, 0.8],
    [68, 1.8],
  ] as const) {
    b.cylinder(v(px, top, z - 1), v(px, BOTTOM_Y, z - 1), r, r, 8, false);
    for (let y = top - 6; y > BOTTOM_Y; y -= rnd.range(9, 15)) {
      b.cylinder(v(px, y - 0.4, z - 1), v(px, y + 0.4, z - 1), r * 1.3, r * 1.3, 8);
    }
  }
  b.paint(C.iron);
  for (let k = 0; k < 6; k++) {
    const y = rnd.range(BOTTOM_Y + 30, TOP_Y - 4);
    b.gear(v(-50, y, z + 1.4), {
      teeth: 8,
      tip: 1.6,
      root: 1.4,
      rim: 1.25,
      thickness: 0.2,
      spokes: 4,
      hub: 0.3,
    });
  }
  // Horizontal pipes crossing the shaft, a few cut short
  b.paint(C.copper);
  for (let k = 0; k < (high ? 7 : 4); k++) {
    const y = rnd.range(BOTTOM_Y + 30, TOP_Y);
    const s = rnd.chance(0.5) ? -1 : 1;
    const end = s * rnd.range(-10, 40);
    const r = rnd.range(0.6, 1.2);
    b.cylinder(v(s * 75, y, z - 2), v(end, y, z - 2), r, r, 8);
    if (rnd.chance(0.5))
      b.cylinder(v(end, y + r, z - 2), v(end, y - rnd.range(4, 14), z - 2), r, r, 8);
  }

  // Gears on the walls, in meshing pairs
  for (let k = 0; k < (high ? 8 : 4); k++) {
    const s = k % 2 === 0 ? -1 : 1;
    const y = top - 20 - k * ((length - 60) / (high ? 8 : 4));
    const r = rnd.range(5, 9);
    const center = v(s * rnd.range(44, 60), y, z + 1);
    const teeth = Math.round(r * 1.6);
    const jammed = rnd.chance(0.3);
    const speed = (rnd.chance(0.5) ? 1 : -1) * rnd.range(0.15, 0.35);
    b.paint(C.bronze);
    if (jammed)
      b.move({
        type: MOTION.stutter,
        pivot: center,
        speed: rnd.range(0.25, 0.5),
        amp: (Math.PI * 2) / teeth,
        phase: rnd.next(),
      });
    else b.move({ type: MOTION.spin, pivot: center, speed });
    b.gear(center, { teeth, tip: r, root: r - 1.2, rim: r - 2.4, thickness: 1.2, spokes: 5 });
    const r2 = r * rnd.range(0.45, 0.65);
    const a = rnd.range(-1, 1) + (s > 0 ? Math.PI : 0);
    const c2 = center.clone().add(v(Math.cos(a) * (r + r2 - 1), Math.sin(a) * (r + r2 - 1), 0.4));
    const teeth2 = Math.max(6, Math.round(r2 * 1.6));
    if (jammed) b.still();
    else b.move({ type: MOTION.spin, pivot: c2, speed: (-speed * teeth) / teeth2 });
    b.gear(c2, { teeth: teeth2, tip: r2, root: r2 - 1.1, rim: r2 - 2, thickness: 1.2, spokes: 4 });
    b.still();
  }

  // The intake fan at the top, behind a grate: daylight comes through it
  const fan = v(-6, TOP_Y + 12, z - 3);
  b.paint(C.soot);
  b.move({ type: MOTION.spin, pivot: fan, speed: 0.9 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    b.beam(fan, v(fan.x + Math.cos(a) * 11, fan.y + Math.sin(a) * 11, fan.z), 3.2, 0.4);
  }
  b.still();
  b.paint(C.iron);
  for (let k = -6; k <= 6; k++) b.box(fan.x + k * 2, fan.y, z + 1, 0.3, 26, 0.3);
  for (let k = -3; k <= 3; k++) b.box(fan.x, fan.y + k * 4, z + 1, 26, 0.3, 0.3);
  for (let k = 0; k < 5; k++) {
    out.shafts.push({
      top: v(fan.x - 8 + k * 4 + rnd.range(-1, 1), fan.y - 2, z + 6),
      dx: 0.18 + rnd.range(-0.04, 0.04),
      width: rnd.range(3, 6),
      length: rnd.range(60, 90),
      phase: k * 1.26,
      strength: rnd.range(0.5, 1),
    });
  }

  // Ragged rock walls around the shaft
  for (const s of [-1, 1]) {
    const edge: [number, number][] = [];
    for (let y = top + 20; y > BOTTOM_Y; y -= rnd.range(3, 7)) {
      edge.push([s * (70 + rnd.range(-5, 9) + Math.sin(y * 0.05 + s) * 7), y]);
    }
    edge.push([s * 72, BOTTOM_Y]);
    b.paint(C.rock).wall(edge, s * 280, z - 7, 8);
  }
}

/* ------------------------------------------------------------------ */
/* Far layer                                                           */
/* ------------------------------------------------------------------ */

function farLayer(b: MeshBuilder, rnd: Random, high: boolean) {
  const z = Z_FAR;
  const span = TOP_Y + 20 - BOTTOM_Y;
  // Colossal gears, some turning, some seized for good
  const gears = high ? 9 : 5;
  for (let i = 0; i < gears; i++) {
    const s = i % 2 === 0 ? 1 : -1;
    const y = TOP_Y - 6 - (i + rnd.range(0, 0.6)) * (span / gears);
    const r = rnd.range(15, 30);
    const center = v(s * rnd.range(46, 98), y, z + rnd.range(-12, 12));
    const teeth = Math.round(r * 0.9);
    const kind = rnd.next();
    const speed = (rnd.chance(0.5) ? 1 : -1) * rnd.range(0.025, 0.06);
    if (kind < 0.55) b.move({ type: MOTION.spin, pivot: center, speed, phase: rnd.range(0, 6) });
    else if (kind < 0.8)
      b.move({
        type: MOTION.stutter,
        pivot: center,
        speed: rnd.range(0.12, 0.22),
        amp: (Math.PI * 2) / teeth,
        phase: rnd.next(),
      });
    else b.still();
    b.paint(i % 3 === 0 ? C.paleDark : C.pale).gear(center, {
      teeth,
      tip: r,
      root: r - 2.4,
      rim: r - 5,
      thickness: 3,
      spokes: 6,
      hub: r * 0.2,
      missing: kind > 0.9 ? (k) => k % 5 === 0 : undefined,
    });
    if (high && rnd.chance(0.65)) {
      const r2 = r * rnd.range(0.4, 0.6);
      const a = rnd.range(-0.9, 0.9) + (s > 0 ? Math.PI : 0);
      const c2 = center
        .clone()
        .add(v(Math.cos(a) * (r + r2 - 2.2), Math.sin(a) * (r + r2 - 2.2), 1.5));
      const teeth2 = Math.max(8, Math.round(r2 * 0.9));
      if (kind < 0.55) b.move({ type: MOTION.spin, pivot: c2, speed: (-speed * teeth) / teeth2 });
      else b.still();
      b.paint(C.pale).gear(c2, {
        teeth: teeth2,
        tip: r2,
        root: r2 - 2.2,
        rim: r2 - 4.2,
        thickness: 3,
        spokes: 5,
        hub: r2 * 0.22,
      });
    }
    b.still();
  }

  // Smokestacks rising out of the haze, some broken off
  for (let i = 0; i < (high ? 10 : 6); i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const x = s * rnd.range(28, 125);
    const w = rnd.range(5, 11);
    const topY = rnd.range(-70, 40);
    const zz = z - 20 - rnd.range(0, 25);
    b.paint(C.paleDark);
    b.box(x, (topY + BOTTOM_Y) / 2, zz, w, topY - BOTTOM_Y, w);
    for (let y = topY - 5; y > BOTTOM_Y; y -= rnd.range(10, 20))
      b.box(x, y, zz + w * 0.5, w * 1.15, 0.9, 0.6);
    b.polygon(
      [
        [x - w / 2, topY],
        [x + w / 2, topY],
        [x + w * 0.35, topY + rnd.range(2, 5)],
        [x + w * 0.1, topY + 0.6],
        [x - w * 0.2, topY + rnd.range(1.5, 4)],
      ],
      zz + w / 2 + 0.02,
    );
  }

  // Great arches of the old foundry
  if (high) {
    for (const y of [-34, -SHAFT_DEPTH * 0.62]) {
      const R = 52;
      const segs = 16;
      b.paint(C.paleDark, PATTERN.brick);
      for (let k = 0; k < segs; k++) {
        const a1 = (Math.PI * k) / segs;
        const a2 = (Math.PI * (k + 1)) / segs;
        b.beam(
          v(Math.cos(a1) * R, y + Math.sin(a1) * R * 0.45, z - 30),
          v(Math.cos(a2) * R, y + Math.sin(a2) * R * 0.45, z - 30),
          6,
          4,
        );
      }
    }
  }

  // Chains hanging from somewhere far above
  for (let i = 0; i < (high ? 7 : 4); i++) {
    const pivot = v(rnd.range(-70, 70), TOP_Y + 60, z + 14);
    const length = rnd.range(50, 140);
    b.move({
      type: MOTION.sway,
      pivot,
      speed: rnd.range(0.15, 0.3),
      phase: rnd.range(0, 6),
      amp: 0.008,
    });
    b.paint(C.pale).chain(pivot, length, 2.6, 1);
    hook(b, v(pivot.x, pivot.y - length, pivot.z), 3);
    b.still();
  }
}

/* ------------------------------------------------------------------ */
/* Entrance                                                            */
/* ------------------------------------------------------------------ */

function entrance(b: MeshBuilder, rnd: Random, out: Out) {
  const z = Z_MID;
  // Heavy trusses holding up the city above
  b.paint(C.iron);
  b.truss(v(-70, TOP_Y, z - 2), v(70, TOP_Y, z - 2), 3.4, 0.6);
  b.truss(v(-90, TOP_Y + 9, Z_BACK + 6), v(90, TOP_Y + 9, Z_BACK + 6), 4.5, 0.8);
  // The sector sign, lit by its own lamp
  const sign = v(36, 12, z + 1.4);
  b.paint(C.iron).box(sign.x, sign.y, z + 1, 8.4, 4.4, 0.6);
  out.signs.push({ center: sign, width: 8, height: 4, cell: SIGN_CELLS.sector });
  out.signs.push({
    center: v(sign.x + 6.4, sign.y - 0.4, z + 1.4),
    width: 3,
    height: 3,
    cell: SIGN_CELLS.down,
  });
  b.beam(v(sign.x - 3, sign.y + 2.2, z + 1), v(sign.x - 2, TOP_Y - 2, z - 1), 0.25);
  b.beam(v(sign.x + 3, sign.y + 2.2, z + 1), v(sign.x + 2, TOP_Y - 2, z - 1), 0.25);
  hangingLamp(b, rnd, out, v(sign.x - 0.5, sign.y + 6, z + 3.2), 1.6, {
    profile: "stutter",
    strength: 1.5,
    swing: 0.02,
  });
  // A dead fluorescent fixture, catching once in a while
  b.paint(C.steel).box(-16, TOP_Y - 3.6, z + 1, 6, 0.5, 0.8);
  out.bulbs.push({
    pos: v(-16, TOP_Y - 4.1, z + 1.6),
    sway: null,
    color: BULB_COLORS.cold,
    profile: "dying",
    seed: 42,
    size: 3,
    strength: 1.2,
    radius: 16,
    mains: true,
  });
  // Hazard barrier on the first ledge
  b.paint(C.iron, PATTERN.hazard).box(-34, -2, z + 3, 9, 1, 0.5);
  b.paint(C.iron)
    .box(-38, -3.4, z + 3, 0.4, 2.4, 0.4)
    .box(-30, -3.4, z + 3, 0.4, 2.4, 0.4);
  b.paint(C.concrete).box(-38, -5, z + 1, 26, 1.2, 8);
}

/* ------------------------------------------------------------------ */
/* Everything                                                          */
/* ------------------------------------------------------------------ */

export function generateLayout(tier: "high" | "low", projects: WipProject[]) {
  const high = tier === "high";
  const b = new MeshBuilder();
  const rnd = createRandom(404);
  const out: Out = { bulbs: [], emitters: [], signs: [], shafts: [] };
  // Front to back, so the GPU can skip pixels hidden behind closer shapes
  nearLayer(b, rnd, high);
  entrance(b, rnd, out);
  midLayer(b, rnd, high, out, projects);
  furnace(b, rnd, high, out);
  backLayer(b, rnd, high, out);
  farLayer(b, rnd, high);
  return { geometry: b.build(), vertices: b.vertices, ...out };
}

export type Layout = ReturnType<typeof generateLayout>;
