import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Quaternion,
  Vector3,
} from "three";
import { createRandom } from "@/lib/random";
import { blinking, KIND, PartBuilder } from "../../vehicle/builder";
import { BOARD } from "./textures";
import {
  BARRIER,
  HALF_WIDTH,
  KERB_WIDTH,
  SAMPLES,
  START_S,
  trackLength,
  trackPoint,
  trackTable,
  trackTangent,
} from "./track";

/*
 * Everything built along the circuit: the asphalt ribbon, the barriers, the
 * floodlight towers, the grandstand and pit building on the main straight,
 * the start gantry, the boards, and where their lights glow.
 */

/** Extra kinds for the structures' shader (after the builder's matte/neon/gloss/blink). */
export const RL_KIND = { ...KIND, seats: 4, garage: 5 } as const;

/** The main straight's buildings stand between these distances. */
const STRAIGHT_FROM = 40;
const STRAIGHT_TO = 270;

const UP = new Vector3(0, 1, 0);
const _p = new Vector3();
const _t = new Vector3();

/** Rotation that turns +x along the track at `s` (and +z to its right). */
function alongTrack(s: number) {
  trackTangent(s, _t);
  return new Quaternion().setFromAxisAngle(UP, Math.atan2(-_t.z, _t.x));
}

const at = (s: number, side: number, height: number) => trackPoint(s, side, height, new Vector3());

/* ------------------------------------------------------------------ */
/* Asphalt and barriers                                                */
/* ------------------------------------------------------------------ */

/** Columns across the ribbon, from the left barrier to the right one. */
const RIBBON_SIDES = [
  -BARRIER,
  -HALF_WIDTH - KERB_WIDTH,
  -HALF_WIDTH,
  0,
  HALF_WIDTH,
  HALF_WIDTH + KERB_WIDTH,
  BARRIER,
];

/** The track surface: asphalt, kerbs and run-off, one strip along the whole lap. */
export function ribbonGeometry() {
  const t = trackTable();
  const columns = RIBBON_SIDES.length;
  const rows = SAMPLES + 1;
  const positions = new Float32Array(rows * columns * 3);
  const track = new Float32Array(rows * columns * 2);
  const kerb = new Float32Array(rows * columns);
  const step = t.length / SAMPLES;
  for (let r = 0; r < rows; r++) {
    const i = r % SAMPLES;
    const s = r * step;
    for (let c = 0; c < columns; c++) {
      const side = RIBBON_SIDES[c];
      const v = r * columns + c;
      trackPoint(s, side, 0, _p);
      positions.set([_p.x, 0, _p.z], v * 3);
      track.set([s, side], v * 2);
      kerb[v] = t.kerb[i];
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c;
      const b = a + columns;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("aTrack", new BufferAttribute(track, 2));
  g.setAttribute("aKerb", new BufferAttribute(kerb, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/** Low walls on both sides, with a neon strip on top. */
export function barrierGeometry() {
  const t = trackTable();
  const rows = SAMPLES + 1;
  const height = 1.15;
  const positions: number[] = [];
  const track: number[] = [];
  const extra: number[] = [];
  const indices: number[] = [];
  const step = t.length / SAMPLES;
  for (const side of [-BARRIER, BARRIER]) {
    const base = positions.length / 3;
    for (let r = 0; r < rows; r++) {
      const s = r * step;
      trackPoint(s, side, 0, _p);
      for (const y of [0, height]) {
        positions.push(_p.x, y, _p.z);
        track.push(s, side);
        extra.push(y / height, t.kerb[r % SAMPLES]);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = base + r * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("aTrack", new BufferAttribute(new Float32Array(track), 2));
  g.setAttribute("aWall", new BufferAttribute(new Float32Array(extra), 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* Structures, glows, beams, boards                                    */
/* ------------------------------------------------------------------ */

export type Glow = { center: Vector3; color: Color; size: number; mode: number };

/** Glow modes for the shader: steady, the start lights (1 to 5), blinking (with a phase). */
export const GLOW = { steady: 0, start: 1, blink: 10 } as const;

export type Board = {
  center: Vector3;
  right: Vector3;
  up: Vector3;
  width: number;
  height: number;
  cell: number;
  color: Color;
};

export type Layout = {
  structures: BufferGeometry;
  glows: InstancedBufferGeometry;
  beams: BufferGeometry;
  boards: BufferGeometry;
  crowd: BufferGeometry;
  /** Where the floodlights stand (for the light they pour on the asphalt) */
  towerSpacing: number;
  towerOffset: number;
};

const WARM = "#fff1d6";
const RED = "#ff2e43";
const AMBER = "#ffb52e";

export function generateLayout(tier: "high" | "low"): Layout {
  const rnd = createRandom(404);
  const length = trackLength();
  const b = new PartBuilder();
  const glows: Glow[] = [];
  const boards: Board[] = [];
  const beams: { apex: Vector3; foot: Vector3; radius: number }[] = [];
  const glow = (
    center: Vector3,
    color: string,
    size: number,
    mode: number = GLOW.steady,
    boost = 1,
  ) => glows.push({ center, color: new Color(color).multiplyScalar(boost), size, mode });

  // Floodlight towers around the lap, on alternating sides (the main straight has its own lights)
  const towerCount = Math.round(length / 78);
  const towerSpacing = length / towerCount;
  const towerOffset = towerSpacing * 0.5;
  for (let k = 0; k < towerCount; k++) {
    const s = towerOffset + k * towerSpacing;
    if (s > STRAIGHT_FROM - 20 && s < STRAIGHT_TO + 10) continue;
    const side = k % 2 === 0 ? 1 : -1;
    const foot = at(s, side * (BARRIER + 5), 0);
    const top = at(s, side * (BARRIER + 5), 23);
    b.paint("#1c1820").beam(foot, top, 0.9);
    // The lamp bank leans over the track
    const toTrack = at(s, 0, 23).sub(top).normalize();
    const right = new Vector3().crossVectors(UP, toTrack).normalize();
    const face = top
      .clone()
      .addScaledVector(toTrack, 0.7)
      .add(new Vector3(0, -0.4, 0));
    const tilt = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, 1),
      toTrack
        .clone()
        .add(new Vector3(0, -0.55, 0))
        .normalize(),
    );
    b.paint("#26212b").box(face.clone().addScaledVector(toTrack, -0.35), 6, 2.6, 0.6, tilt);
    b.paint(WARM, KIND.neon, 2.4).panel(
      face,
      right,
      new Vector3(0, 1, 0).applyQuaternion(tilt),
      5.4,
      2.1,
    );
    glow(face.clone().addScaledVector(toTrack, 0.6), WARM, 9, GLOW.steady, 1);
    b.paint(RED, blinking(rnd.next()), 2.2).box(
      top.clone().add(new Vector3(0, 0.6, 0)),
      0.5,
      0.5,
      0.5,
    );
    glow(top.clone().add(new Vector3(0, 0.6, 0)), RED, 2.2, GLOW.blink + rnd.next() * 0.9);
    beams.push({ apex: face, foot: at(s, side * 2, 0), radius: 10 });
  }

  // Grandstand on the left of the main straight: stepped tiers under a roof
  const tiers = 7;
  const standFrom = -(BARRIER + 4);
  const segment = 23;
  for (let s = STRAIGHT_FROM; s < STRAIGHT_TO - 30; s += segment) {
    const mid = s + segment / 2;
    const q = alongTrack(mid);
    for (let k = 0; k < tiers; k++) {
      const side = standFrom - 1.1 - k * 2.2;
      const h = 1.2 + k * 1.25;
      b.paint(k % 2 === 0 ? "#3a1420" : "#2b1019", RL_KIND.seats).box(
        at(mid, side, h / 2),
        segment - 0.4,
        h,
        2.2,
        q,
      );
    }
    const back = standFrom - tiers * 2.2 - 0.6;
    b.paint("#17121b").box(at(mid, back, 7.5), segment, 15, 1.2, q);
    // Roof on pillars, a neon line along its edge
    b.paint("#14101a", KIND.gloss).box(
      at(mid, (standFrom + back) / 2 + 1, 15.2),
      segment + 0.2,
      0.5,
      tiers * 2.2 + 4,
      q,
    );
    b.paint("#1c1820").beam(at(s, standFrom + 1, 0), at(s, standFrom + 1, 15), 0.45);
    b.paint(RED, KIND.neon, 2.6).box(at(mid, standFrom + 3, 14.9), segment + 0.2, 0.22, 0.22, q);
    glow(at(mid, standFrom, 14.4), WARM, 6.5, GLOW.steady, 0.7);
  }
  {
    const s = (STRAIGHT_FROM + STRAIGHT_TO - 30) / 2;
    trackTangent(s, _t);
    boards.push({
      center: at(s, standFrom + 2.6, 17.6),
      right: _t.clone(),
      up: UP.clone(),
      width: 24,
      height: 6,
      cell: BOARD["FULL THROTTLE"],
      color: new Color(RED).multiplyScalar(2.2),
    });
  }

  // Pit building on the right: lit garages facing the track
  const pitFrom = BARRIER + 5;
  const pitDepth = 14;
  for (let s = STRAIGHT_FROM; s < STRAIGHT_TO; s += segment) {
    const mid = s + segment / 2;
    const q = alongTrack(mid);
    b.paint("#1a161f").box(at(mid, pitFrom + pitDepth / 2, 5), segment, 10, pitDepth, q);
    // Two garages per section
    for (const offset of [-segment / 4, segment / 4]) {
      trackTangent(mid + offset, _t);
      b.paint("#cfe4ff", RL_KIND.garage, 1).panel(
        at(mid + offset, pitFrom - 0.05, 2.6),
        _t.clone().negate(),
        UP,
        segment / 2 - 2.4,
        5,
      );
    }
    b.paint(AMBER, KIND.neon, 2.2).box(at(mid, pitFrom - 0.1, 6.4), segment, 0.2, 0.2, q);
    b.paint(RED, blinking(rnd.next()), 2).box(at(mid, pitFrom + 2, 10.4), 0.4, 0.4, 0.4);
  }
  for (const [s, text] of [
    [STRAIGHT_FROM + 50, "PIT LANE"],
    [STRAIGHT_FROM + 150, "BERNARDO"],
  ] as const) {
    trackTangent(s, _t);
    boards.push({
      center: at(s, pitFrom - 0.2, 8.4),
      right: _t.clone().negate(),
      up: UP.clone(),
      width: 16,
      height: 4,
      cell: BOARD[text],
      color: new Color(text === "BERNARDO" ? AMBER : "#ffffff").multiplyScalar(2),
    });
  }

  // The start gantry, with its five pairs of start lights and the REDLINE board
  {
    const s = START_S;
    const q = alongTrack(s);
    for (const side of [-1, 1]) {
      b.paint("#1c1820").beam(
        at(s, side * (HALF_WIDTH + 2.4), 0),
        at(s, side * (HALF_WIDTH + 2.4), 9.6),
        0.8,
      );
    }
    b.paint("#1f1a24").box(at(s, 0, 8.2), 1.2, 1.4, HALF_WIDTH * 2 + 6, q);
    trackTangent(s, _t);
    const back = _t.clone().negate();
    for (let i = 0; i < 5; i++) {
      for (const row of [0, 1]) {
        const p = at(s, -2.6 + i * 1.3, 7.9 + row * 0.75).addScaledVector(back, 0.66);
        b.paint("#2a0a0e").box(p, 0.16, 0.6, 0.6, q);
        glow(p.clone().addScaledVector(back, 0.2), RED, 0.75, GLOW.start + i, 3);
      }
    }
    boards.push({
      center: at(s, 0, 10.6).addScaledVector(back, 0.56),
      right: new Vector3(-_t.z, 0, _t.x),
      up: UP.clone(),
      width: 13,
      height: 3.2,
      cell: BOARD["D-04"],
      color: new Color(RED).multiplyScalar(2.6),
    });
    b.paint("#17121b").box(at(s, 0, 10.6), 1, 3.6, 14, q);
  }

  // Boards on the approach to some corners, facing the cars that come
  for (const [s, side, text] of [
    [START_S + 180, 1, "REV-BENCH"],
    [START_S + 520, -1, "REDLINE"],
    [START_S + 860, 1, "BOOST"],
    [START_S + 1180, -1, "LIGHTS OUT"],
    [START_S + 1420, 1, "REV-BENCH"],
  ] as const) {
    trackTangent(s, _t);
    const right = new Vector3(-_t.z, 0, _t.x);
    // Turned a little toward the track so it reads from the racing line
    const facing = _t
      .clone()
      .negate()
      .addScaledVector(right, -side * 0.45)
      .normalize();
    const boardRight = new Vector3().crossVectors(UP, facing).normalize();
    const center = at(s, side * (BARRIER + 3), 6.2);
    boards.push({
      center,
      right: boardRight,
      up: UP.clone(),
      width: 18,
      height: 4.5,
      cell: BOARD[text],
      color: new Color(text === "REV-BENCH" ? AMBER : RED).multiplyScalar(2.3),
    });
    b.paint("#17121b").box(
      center.clone().addScaledVector(facing, -0.3),
      18.6,
      5,
      0.4,
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), facing),
    );
    for (const end of [-1, 1]) {
      const post = center
        .clone()
        .addScaledVector(boardRight, end * 7.5)
        .addScaledVector(facing, -0.4);
      b.paint("#1c1820").beam(new Vector3(post.x, 0, post.z), new Vector3(post.x, 4, post.z), 0.4);
    }
  }

  // Crowd in the grandstand: phone screens and camera flashes
  const crowdCount = tier === "high" ? 1500 : 650;
  const crowdPositions = new Float32Array(crowdCount * 3);
  const crowdSeeds = new Float32Array(crowdCount);
  for (let i = 0; i < crowdCount; i++) {
    const s = rnd.range(STRAIGHT_FROM + 1, STRAIGHT_TO - 31);
    const k = rnd.int(0, tiers - 1);
    trackPoint(s, standFrom - 1.1 - k * 2.2 + rnd.range(-0.7, 0.7), 1.2 + k * 1.25 + 0.55, _p);
    crowdPositions.set([_p.x, _p.y, _p.z], i * 3);
    crowdSeeds[i] = rnd.next();
  }
  const crowd = new BufferGeometry();
  crowd.setAttribute("position", new BufferAttribute(crowdPositions, 3));
  crowd.setAttribute("aSeed", new BufferAttribute(crowdSeeds, 1));
  crowd.computeBoundingSphere();

  return {
    structures: b.build(),
    glows: glowGeometry(glows),
    beams: beamGeometry(beams),
    boards: boardGeometry(boards),
    crowd,
    towerSpacing,
    towerOffset,
  };
}

function glowGeometry(glows: Glow[]) {
  const g = new InstancedBufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const centers = new Float32Array(glows.length * 4);
  const colors = new Float32Array(glows.length * 4);
  glows.forEach((item, i) => {
    centers.set([item.center.x, item.center.y, item.center.z, item.size], i * 4);
    colors.set([item.color.r, item.color.g, item.color.b, item.mode], i * 4);
  });
  g.setAttribute("aCenter", new InstancedBufferAttribute(centers, 4));
  g.setAttribute("aGlow", new InstancedBufferAttribute(colors, 4));
  g.instanceCount = glows.length;
  return g;
}

/** Light pouring down from each floodlight: open cones, brightest near the lamp. */
function beamGeometry(beams: { apex: Vector3; foot: Vector3; radius: number }[]) {
  const sides = 14;
  const positions: number[] = [];
  const along: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const axis = new Vector3();
  const u = new Vector3();
  const v = new Vector3();
  for (const beam of beams) {
    axis.subVectors(beam.foot, beam.apex);
    const len = axis.length();
    axis.divideScalar(len);
    u.set(0, 0, 1).cross(axis);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    v.crossVectors(axis, u).normalize();
    const base = positions.length / 3;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const dir = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      const rim = beam.foot.clone().addScaledVector(dir, beam.radius);
      const tip = beam.apex.clone().addScaledVector(dir, 0.8);
      const n = dir.clone().multiplyScalar(len).addScaledVector(axis, -beam.radius).normalize();
      positions.push(tip.x, tip.y, tip.z, rim.x, rim.y, rim.z);
      along.push(0, 1);
      normals.push(n.x, n.y, n.z, n.x, n.y, n.z);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute("aAlong", new BufferAttribute(new Float32Array(along), 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

function boardGeometry(boards: Board[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const cells: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const board of boards) {
    const r = board.right.clone().multiplyScalar(board.width / 2);
    const u = board.up.clone().multiplyScalar(board.height / 2);
    const base = positions.length / 3;
    const corners = [
      board.center.clone().sub(r).sub(u),
      board.center.clone().add(r).sub(u),
      board.center.clone().add(r).add(u),
      board.center.clone().sub(r).add(u),
    ];
    const uv = [0, 0, 1, 0, 1, 1, 0, 1];
    corners.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      uvs.push(uv[i * 2], uv[i * 2 + 1]);
      cells.push(board.cell);
      colors.push(board.color.r, board.color.g, board.color.b);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute("aCell", new BufferAttribute(new Float32Array(cells), 1));
  g.setAttribute("aColor", new BufferAttribute(new Float32Array(colors), 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* Cars and the skyline                                                */
/* ------------------------------------------------------------------ */

/** Points along each light trail (more is smoother through the corners). */
export const TRAIL_SEGMENTS = 12;

/**
 * The cars lapping the circuit, seen as long-exposure light trails: two lights
 * per car, each a strip of TRAIL_SEGMENTS. Every car's start, speed and lane
 * ride in an instanced attribute; the vertex shader drives them around.
 */
export function trailGeometry(tier: "high" | "low") {
  const rnd = createRandom(808);
  const count = tier === "high" ? 48 : 24;
  const length = trackLength();
  const positions: number[] = [];
  const streak: number[] = [];
  const indices: number[] = [];
  for (const light of [-1, 1]) {
    for (let i = 0; i <= TRAIL_SEGMENTS; i++) {
      const base = positions.length / 3;
      for (const edge of [-1, 1]) {
        positions.push(0, 0, 0);
        streak.push(i / TRAIL_SEGMENTS, edge, light);
      }
      if (i < TRAIL_SEGMENTS) indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("aStreak", new BufferAttribute(new Float32Array(streak), 3));
  g.setIndex(indices);
  const cars = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // Packs of cars, like a race a few laps in
    const pack = Math.floor(i / 6);
    cars.set(
      [
        (pack / Math.ceil(count / 6) + rnd.range(0, 0.05)) * length,
        rnd.range(68, 96),
        rnd.range(-HALF_WIDTH + 1.6, HALF_WIDTH - 1.6),
        rnd.next(),
      ],
      i * 4,
    );
  }
  g.setAttribute("aCar", new InstancedBufferAttribute(cars, 4));
  g.instanceCount = count;
  return g;
}

/** Where the circuit's middle is, for the distant skyline around it. */
export function circuitCenter() {
  const t = trackTable();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    minX = Math.min(minX, t.positions[i * 3]);
    maxX = Math.max(maxX, t.positions[i * 3]);
    minZ = Math.min(minZ, t.positions[i * 3 + 2]);
    maxZ = Math.max(maxZ, t.positions[i * 3 + 2]);
  }
  return new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
}

/** A ring of city far away around the circuit (its towers are drawn by the shader). */
export function skylineGeometry(radius = 950) {
  const segments = 240;
  const center = circuitCenter();
  const positions: number[] = [];
  const coords: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = center.x + Math.cos(a) * radius;
    const z = center.z + Math.sin(a) * radius;
    positions.push(x, -8, z, x, 150, z);
    coords.push(i / segments, 0, i / segments, 1);
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("aCoord", new BufferAttribute(new Float32Array(coords), 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
