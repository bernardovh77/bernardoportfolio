"use client";

import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { wipProjects } from "@/lib/content";
import { createRandom } from "@/lib/random";
import { SHAFT_DEPTH, SITE_COUNT, shaftPosition, siteSide } from "@/lib/underworks";
import { world } from "@/lib/world";
import { type SceneProps, useActiveRef, useFontsReady } from "../shared";
import {
  EMITTER_KIND,
  generateLayout,
  type Layout,
  POOL_Y,
  type Sway,
  TOP_Y,
  Z_MID,
} from "./underworks/layout";
import {
  type Burst,
  CRUSHER_IMPACT,
  currentBurst,
  flicker,
  lastRecovery,
  mainsPower,
  noise1,
} from "./underworks/power";
import {
  arcFragment,
  arcVertex,
  backdropFragment,
  backdropVertex,
  bulbFragment,
  bulbVertex,
  dustFragment,
  dustVertex,
  MAX_ARC_LIGHTS,
  MAX_ARCS,
  MAX_BULB_LIGHTS,
  MAX_EMITTERS,
  shaftFragment,
  shaftVertex,
  signFragment,
  signVertex,
  smogFragment,
  smogVertex,
  sparkFragment,
  sparkVertex,
  structureFragment,
  structureVertex,
} from "./underworks/shaders";
import { createNoiseTexture, createSignAtlas } from "./underworks/textures";

/*
 * The Underworks: a foundry shaft under the city where unfinished projects
 * are still being built. The camera sinks as the page scrolls and stops at
 * each construction site while its card is on screen.
 *
 * Built to be light: the whole structure is one draw call, lights are a
 * handful of nearby bulbs computed analytically, noise comes from a small
 * texture, and every animation runs in the vertex shaders.
 */

/** With reduced motion the scene is a still frame at this moment. */
const STILL_TIME = 6.5;

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function underworksCamera(scroll: number, time: number, pos: Vector3, look: Vector3) {
  const { y, segment, t } = shaftPosition(scroll);
  // On narrow screens, lean toward the side of the shaft where the site is
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const narrow = clamp01((1.25 - aspect) / 0.7);
  let lean = 0;
  if (narrow > 0 && SITE_COUNT > 0) {
    const sideAt = (stop: number) => (stop >= 1 && stop <= SITE_COUNT ? siteSide(stop - 1) : 0);
    lean = (sideAt(segment) * (1 - t) + sideAt(segment + 1) * t) * 10 * narrow;
  }
  pos.set(lean + Math.sin(time * 0.13) * 0.5, y + 5 + Math.sin(time * 0.37) * 0.12, 30);
  look.set(lean * 1.15 + Math.sin(time * 0.11) * 0.3, y - 3, -60);
}

/* ------------------------------------------------------------------ */
/* Shared uniforms                                                     */
/* ------------------------------------------------------------------ */

const srgb = (hex: string, intensity = 1) => new Color(hex).multiplyScalar(intensity);

function createUniforms(noise: ReturnType<typeof createNoiseTexture>) {
  return {
    uTime: { value: 0 },
    uCamY: { value: 0 },
    uAspect: { value: 1.6 },
    uPixel: { value: 600 },
    uResolution: { value: new Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uNoise: { value: noise },
    uHaze: {
      value: [srgb("#3a4552"), srgb("#3d2c1f"), srgb("#512616"), srgb("#6a2410")],
    },
    uDepth: { value: SHAFT_DEPTH },
    uHazeDensity: { value: 0.0071 },
    uFurnaceY: { value: POOL_Y },
    uFurnace: { value: srgb("#ff5a1a", 2.2) },
    uTopY: { value: TOP_Y },
    uSkyLight: { value: srgb("#a3bad6", 0.55) },
    uBulbPos: { value: Array.from({ length: MAX_BULB_LIGHTS }, () => new Vector3(0, 1e4, 0)) },
    uBulbCol: { value: Array.from({ length: MAX_BULB_LIGHTS }, () => new Vector4(0, 0, 0, 1)) },
    uArcPos: { value: Array.from({ length: MAX_ARC_LIGHTS }, () => new Vector3(0, 1e4, 0)) },
    uArcCol: { value: Array.from({ length: MAX_ARC_LIGHTS }, () => new Vector4(0, 0, 0, 1)) },
    uEmit: { value: Array.from({ length: MAX_EMITTERS }, () => new Vector4(0, 1e4, 0, -1e6)) },
    uEmitInfo: { value: Array.from({ length: MAX_EMITTERS }, () => new Vector4(0, 0, 0, 1)) },
    uArcA: { value: Array.from({ length: MAX_ARCS }, () => new Vector4(0, 1e4, 0, -1e6)) },
    uArcB: { value: Array.from({ length: MAX_ARCS }, () => new Vector4(0, 1e4, 0, 0)) },
  };
}

type Uniforms = ReturnType<typeof createUniforms>;

// One set of uniforms shared by every material of the scene, so each value is
// updated once per frame. Created on first use and kept (it is tiny).
let shared: Uniforms | null = null;
function sharedUniforms() {
  if (!shared) shared = createUniforms(createNoiseTexture());
  return shared;
}

/* ------------------------------------------------------------------ */
/* Per-frame controller: power, lights, sparks                          */
/* ------------------------------------------------------------------ */

const _p = new Vector3();
const _focus = new Vector3();

function swayed(sway: Sway | null, rest: Vector3, t: number, out: Vector3) {
  out.copy(rest);
  if (!sway) return out;
  const a = sway.amp * Math.sin(sway.speed * t + sway.phase);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = rest.x - sway.pivot.x;
  const dy = rest.y - sway.pivot.y;
  out.x = sway.pivot.x + c * dx - s * dy;
  out.y = sway.pivot.y + s * dx + c * dy;
  return out;
}

/** Keeps emitters in the same slot while they stay among the nearest ones. */
function assignSlots(slots: number[], wanted: number[]) {
  const keep = new Set(wanted);
  for (let i = 0; i < slots.length; i++) if (slots[i] >= 0 && !keep.has(slots[i])) slots[i] = -1;
  const used = new Set(slots);
  for (const id of wanted) {
    if (used.has(id)) continue;
    const free = slots.indexOf(-1);
    if (free < 0) break;
    slots[free] = id;
    used.add(id);
  }
}

function Controller({
  layout,
  bulbsRef,
  active,
}: {
  layout: Layout;
  bulbsRef: RefObject<Mesh | null>;
  active: boolean;
}) {
  const activeRef = useActiveRef(active);
  const stateRef = useRef({
    emitterSlots: Array.from({ length: MAX_EMITTERS }, () => -1),
    arcSlots: Array.from({ length: MAX_ARCS }, () => -1),
    bursts: layout.emitters.map(() => ({ start: -1e6, duration: 0 }) as Burst),
    levels: layout.emitters.map(() => 0),
    spare: new Float32Array(layout.bulbs.length),
    lastTime: 0,
  });

  useFrame((state) => {
    if (!activeRef.current) return;
    const still = world.reducedMotion;
    const t = still ? STILL_TIME : state.clock.elapsedTime;
    const r = stateRef.current;
    const dt = Math.min(0.1, Math.max(0, t - r.lastTime));
    r.lastTime = t;
    const u = sharedUniforms();
    const camera = state.camera;
    u.uTime.value = t;
    u.uCamY.value = camera.position.y;
    u.uAspect.value = state.size.width / Math.max(1, state.size.height);
    const dpr = state.gl.getPixelRatio();
    u.uPixelRatio.value = dpr;
    u.uResolution.value.set(state.size.width * dpr, state.size.height * dpr);
    const fov = "fov" in camera ? (camera.fov as number) : 55;
    u.uPixel.value = (state.size.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360));

    _focus.set(camera.position.x, camera.position.y - 4, Z_MID);

    // Bulbs: flicker on their own, and all dim together when the mains brown out
    const mains = mainsPower(t);
    const bulbs = layout.bulbs;
    const brightness = bulbsRef.current?.geometry.getAttribute("iBright") as
      InstancedBufferAttribute | undefined;
    const glow = (brightness?.array as Float32Array | undefined) ?? r.spare;
    const ranked: { i: number; score: number; level: number }[] = [];
    for (let i = 0; i < bulbs.length; i++) {
      const bulb = bulbs[i];
      const level = flicker(bulb.profile, bulb.seed, t) * (bulb.mains ? mains : 1);
      glow[i] = level;
      if (level <= 0.01) continue;
      swayed(bulb.sway, bulb.pos, t, _p);
      const d2 = _p.distanceToSquared(_focus);
      if (d2 > 60 * 60) continue;
      ranked.push({ i, score: (level * bulb.strength) / (1 + d2 / 900), level });
    }
    if (brightness) brightness.needsUpdate = true;
    ranked.sort((a, b) => b.score - a.score);
    for (let k = 0; k < MAX_BULB_LIGHTS; k++) {
      const pos = u.uBulbPos.value[k];
      const col = u.uBulbCol.value[k];
      const entry = ranked[k];
      if (!entry) {
        col.set(0, 0, 0, 1);
        continue;
      }
      const bulb = bulbs[entry.i];
      swayed(bulb.sway, bulb.pos, t, pos);
      // Fade lights out before they drop off the list, so nothing pops
      const d = Math.sqrt(pos.distanceToSquared(_focus));
      const fade = 1 - Math.min(1, Math.max(0, (d - 36) / 22));
      const k8 = entry.level * bulb.strength * 8 * fade;
      col.set(
        bulb.color.r * k8,
        bulb.color.g * k8,
        bulb.color.b * k8,
        1 / (bulb.radius * bulb.radius),
      );
    }

    // Bursts of sparks and arcs
    const emitters = layout.emitters;
    const recovery = lastRecovery(t);
    const nearby: { i: number; d2: number }[] = [];
    const arcsNearby: { i: number; d2: number }[] = [];
    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i];
      const burst = r.bursts[i];
      if (e.cycle) {
        const k = Math.floor(t * e.cycle.speed + e.cycle.phase - CRUSHER_IMPACT);
        burst.start = (k + CRUSHER_IMPACT - e.cycle.phase) / e.cycle.speed;
        burst.duration = 0.06;
      } else if (e.spec) {
        currentBurst(e.spec, t, burst);
        // When the power comes back after a brownout, every arc fires at once
        if (
          e.kind === "arc" &&
          recovery > burst.start + burst.duration + 1.6 &&
          t - recovery < 1.2
        ) {
          burst.start = recovery + (i % 4) * 0.08;
          burst.duration = 0.3;
        }
      }
      // Light given off by the burst: quick attack, slower release, no strobing
      const age = t - burst.start;
      let target = 0;
      if (age >= 0 && age <= burst.duration) {
        target = e.kind === "weld" ? 0.7 + 0.3 * noise1(t * 2.5 + i * 7) : 1;
      }
      const level = r.levels[i];
      r.levels[i] = still
        ? 0
        : level + (target - level) * (1 - Math.exp(-dt * (target > level ? 30 : 6)));
      const d2 = e.pos.distanceToSquared(_focus);
      if (d2 < 70 * 70) {
        nearby.push({ i, d2 });
        if (e.kind === "arc") arcsNearby.push({ i, d2 });
      }
    }
    nearby.sort((a, b) => a.d2 - b.d2);
    arcsNearby.sort((a, b) => a.d2 - b.d2);
    assignSlots(
      r.emitterSlots,
      nearby.slice(0, MAX_EMITTERS).map((n) => n.i),
    );
    assignSlots(
      r.arcSlots,
      arcsNearby.slice(0, MAX_ARCS).map((n) => n.i),
    );

    for (let s = 0; s < MAX_EMITTERS; s++) {
      const id = r.emitterSlots[s];
      const info = u.uEmitInfo.value[s];
      if (id < 0 || still) {
        info.set(0, 0, 0, 1);
        continue;
      }
      const e = emitters[id];
      const burst = r.bursts[id];
      // Sparks leave from where the emitter was when the burst began
      swayed(e.sway, e.pos, burst.start, _p);
      u.uEmit.value[s].set(_p.x, _p.y, _p.z, burst.start);
      info.set(burst.duration, EMITTER_KIND[e.kind], 1, e.direction);
    }
    for (let s = 0; s < MAX_ARCS; s++) {
      const id = r.arcSlots[s];
      const a = u.uArcA.value[s];
      const b = u.uArcB.value[s];
      if (id < 0 || still) {
        b.w = 0;
        a.w = -1e6;
        continue;
      }
      const e = emitters[id];
      const burst = r.bursts[id];
      const target = e.target ?? e.pos;
      a.set(e.pos.x, e.pos.y, e.pos.z, burst.start);
      b.set(target.x, target.y, target.z, burst.duration);
    }

    // The brightest bursts near the camera light up their surroundings
    const lit = emitters
      .map((e, i) => ({
        i,
        score: (r.levels[i] * e.light) / (1 + e.pos.distanceToSquared(_focus) / 900),
      }))
      .filter((entry) => entry.score > 0.002)
      .sort((a, b) => b.score - a.score);
    for (let k = 0; k < MAX_ARC_LIGHTS; k++) {
      const entry = lit[k];
      const col = u.uArcCol.value[k];
      if (!entry) {
        col.set(0, 0, 0, 1);
        continue;
      }
      const e = emitters[entry.i];
      const level = r.levels[entry.i] * e.light * 6;
      u.uArcPos.value[k].copy(e.pos).add(_p.set(0, 0, 1.5));
      col.set(e.color.r * level, e.color.g * level, e.color.b * level, 1 / (12 * 12));
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */

/** Frees GPU memory when a geometry is replaced or the scene unmounts. */
function useDispose(item: { dispose: () => void }) {
  useEffect(() => () => item.dispose(), [item]);
}

function quadGeometry() {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function smogGeometry() {
  const banks = [
    { z: -58, opacity: 0.26, scale: 0.016, drift: 0.003 },
    { z: -118, opacity: 0.34, scale: 0.01, drift: 0.002 },
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const bank: number[] = [];
  const index: number[] = [];
  banks.forEach((b, k) => {
    const distance = 30 - b.z;
    const w = distance * 2.7;
    const h = distance * 1.45;
    const yc = -9;
    const base = k * 4;
    for (const [x, y, uu, vv] of [
      [-w / 2, yc - h / 2, 0, 0],
      [w / 2, yc - h / 2, 1, 0],
      [w / 2, yc + h / 2, 1, 1],
      [-w / 2, yc + h / 2, 0, 1],
    ]) {
      positions.push(x, y, b.z);
      uvs.push(uu, vv);
      bank.push(b.opacity, b.scale, b.drift, k * 3.7);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute("aBank", new BufferAttribute(new Float32Array(bank), 4));
  g.setIndex(index);
  return g;
}

function shaftGeometry(layout: Layout) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const data: number[] = [];
  const index: number[] = [];
  layout.shafts.forEach((s, k) => {
    const x0 = s.top.x;
    const y0 = s.top.y;
    const x1 = x0 + s.dx * s.length;
    const y1 = y0 - s.length;
    const w0 = s.width * 0.6;
    const w1 = s.width * 1.6;
    const base = k * 4;
    for (const [x, y, uu, vv] of [
      [x0 - w0, y0, 0, 0],
      [x0 + w0, y0, 1, 0],
      [x1 + w1, y1, 1, 1],
      [x1 - w1, y1, 0, 1],
    ]) {
      positions.push(x, y, s.top.z);
      uvs.push(uu, vv);
      data.push(s.phase, s.strength);
    }
    index.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute("aShaft", new BufferAttribute(new Float32Array(data), 2));
  g.setIndex(index);
  return g;
}

function bulbGeometry(layout: Layout) {
  const base = quadGeometry();
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", base.getAttribute("position"));
  g.setIndex(base.getIndex());
  const n = layout.bulbs.length;
  const pos = new Float32Array(n * 3);
  const pivot = new Float32Array(n * 3);
  const motion = new Float32Array(n * 4);
  const color = new Float32Array(n * 3);
  const size = new Float32Array(n);
  layout.bulbs.forEach((b, i) => {
    pos.set([b.pos.x, b.pos.y, b.pos.z], i * 3);
    if (b.sway) {
      pivot.set([b.sway.pivot.x, b.sway.pivot.y, b.sway.pivot.z], i * 3);
      motion.set([3, b.sway.speed, b.sway.phase, b.sway.amp], i * 4);
    }
    color.set([b.color.r, b.color.g, b.color.b], i * 3);
    size[i] = b.size;
  });
  g.setAttribute("iPos", new InstancedBufferAttribute(pos, 3));
  g.setAttribute("iPivot", new InstancedBufferAttribute(pivot, 3));
  g.setAttribute("iMotion", new InstancedBufferAttribute(motion, 4));
  g.setAttribute("iColor", new InstancedBufferAttribute(color, 3));
  g.setAttribute("iSize", new InstancedBufferAttribute(size, 1));
  const bright = new InstancedBufferAttribute(new Float32Array(n), 1);
  bright.setUsage(DynamicDrawUsage);
  g.setAttribute("iBright", bright);
  g.instanceCount = n;
  base.dispose();
  return g;
}

function dustGeometry(count: number) {
  const rnd = createRandom(808);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd.next();
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aSeed", new BufferAttribute(seeds, 4));
  return g;
}

function sparkGeometry(perEmitter: number) {
  const rnd = createRandom(909);
  const total = perEmitter * MAX_EMITTERS;
  const seeds = new Float32Array(total * 4 * 4);
  const corners = new Float32Array(total * 4 * 2);
  const emitter = new Float32Array(total * 4);
  const index: number[] = [];
  const CORNERS = [
    [0, -1],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let p = 0; p < total; p++) {
    const seed = [rnd.next(), rnd.next(), rnd.next(), rnd.next()];
    for (let c = 0; c < 4; c++) {
      const v = p * 4 + c;
      seeds.set(seed, v * 4);
      corners.set(CORNERS[c], v * 2);
      emitter[v] = Math.floor(p / perEmitter);
    }
    // Counter-clockwise on screen, whichever way the spark flies
    index.push(p * 4, p * 4 + 2, p * 4 + 1, p * 4, p * 4 + 3, p * 4 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(total * 4 * 3), 3));
  g.setAttribute("aSeed", new BufferAttribute(seeds, 4));
  g.setAttribute("aCorner", new BufferAttribute(corners, 2));
  g.setAttribute("aEmitter", new BufferAttribute(emitter, 1));
  g.setIndex(index);
  return g;
}

function arcGeometry(segments: number) {
  const arc: number[] = [];
  const index: number[] = [];
  let v = 0;
  for (let slot = 0; slot < MAX_ARCS; slot++) {
    for (let strand = 0; strand < 2; strand++) {
      const start = v;
      for (let i = 0; i <= segments; i++) {
        const s = i / segments;
        arc.push(s, -1, slot, strand, s, 1, slot, strand);
        v += 2;
      }
      for (let i = 0; i < segments; i++) {
        const a = start + i * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v * 3), 3));
  g.setAttribute("aArc", new BufferAttribute(new Float32Array(arc), 4));
  g.setIndex(index);
  return g;
}

function signGeometry(layout: Layout) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const pivots: number[] = [];
  const motions: number[] = [];
  const index: number[] = [];
  layout.signs.forEach((sign, k) => {
    const { center: c, width: w, height: h } = sign;
    const [u0, v0, du, dv] = sign.cell;
    for (const [x, y, uu, vv] of [
      [c.x - w / 2, c.y - h / 2, u0, v0],
      [c.x + w / 2, c.y - h / 2, u0 + du, v0],
      [c.x + w / 2, c.y + h / 2, u0 + du, v0 + dv],
      [c.x - w / 2, c.y + h / 2, u0, v0 + dv],
    ]) {
      positions.push(x, y, c.z);
      uvs.push(uu, vv);
      const m = sign.motion;
      pivots.push(m?.pivot?.x ?? 0, m?.pivot?.y ?? 0, m?.pivot?.z ?? 0);
      motions.push(m?.type ?? 0, m?.speed ?? 0, m?.phase ?? 0, m?.amp ?? 0);
    }
    const base = k * 4;
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute("aPivot", new BufferAttribute(new Float32Array(pivots), 3));
  g.setAttribute("aMotion", new BufferAttribute(new Float32Array(motions), 4));
  g.setIndex(index);
  return g;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function backdropGeometry() {
  // One triangle that covers the whole screen
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  return g;
}

/*
 * The materials are created here rather than as JSX props: React Three Fiber
 * copies the uniforms it is given, and these must stay linked to the shared
 * set that the controller updates every frame.
 */
function createMaterials(uniforms: Uniforms, atlas: Texture) {
  const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending };
  const shader = (vertexShader: string, fragmentShader: string, extra: object = {}) =>
    new ShaderMaterial({ uniforms, vertexShader, fragmentShader, ...extra });
  return {
    structure: shader(structureVertex, structureFragment),
    signs: new ShaderMaterial({
      uniforms: { ...uniforms, uAtlas: { value: atlas } },
      vertexShader: signVertex,
      fragmentShader: signFragment,
    }),
    backdrop: shader(backdropVertex, backdropFragment, { depthWrite: false }),
    shafts: shader(shaftVertex, shaftFragment, glow),
    smog: shader(smogVertex, smogFragment, { transparent: true, depthWrite: false }),
    bulbs: shader(bulbVertex, bulbFragment, glow),
    dust: shader(dustVertex, dustFragment, glow),
    sparks: shader(sparkVertex, sparkFragment, glow),
    arcs: shader(arcVertex, arcFragment, glow),
  };
}

export default function UnderworksScene({ active, tier }: SceneProps) {
  const layout = useMemo(() => generateLayout(tier, wipProjects), [tier]);
  useDispose(layout.geometry);
  const signs = useMemo(() => signGeometry(layout), [layout]);
  useDispose(signs);
  const backdrop = useMemo(() => backdropGeometry(), []);
  useDispose(backdrop);
  const bulbs = useMemo(() => bulbGeometry(layout), [layout]);
  useDispose(bulbs);
  const smog = useMemo(() => smogGeometry(), []);
  useDispose(smog);
  const shafts = useMemo(() => shaftGeometry(layout), [layout]);
  useDispose(shafts);
  const dust = useMemo(() => dustGeometry(tier === "high" ? 900 : 360), [tier]);
  useDispose(dust);
  const sparks = useMemo(() => sparkGeometry(tier === "high" ? 48 : 24), [tier]);
  useDispose(sparks);
  const arcs = useMemo(() => arcGeometry(tier === "high" ? 18 : 12), [tier]);
  useDispose(arcs);
  const atlas = useMemo(() => createSignAtlas(), []);
  useFontsReady(atlas);
  const materials = useMemo(() => createMaterials(sharedUniforms(), atlas.texture), [atlas]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  const bulbsRef = useRef<Mesh>(null);

  return (
    <group visible={active}>
      <Controller layout={layout} bulbsRef={bulbsRef} active={active} />
      <mesh geometry={layout.geometry} material={materials.structure} frustumCulled={false} />
      <mesh geometry={signs} material={materials.signs} frustumCulled={false} />
      {/* Drawn after the solid shapes, so only the pixels they leave empty are shaded */}
      <mesh
        geometry={backdrop}
        material={materials.backdrop}
        frustumCulled={false}
        renderOrder={1}
      />
      <mesh geometry={shafts} material={materials.shafts} frustumCulled={false} renderOrder={2} />
      <mesh geometry={smog} material={materials.smog} frustumCulled={false} renderOrder={3} />
      <mesh
        ref={bulbsRef}
        geometry={bulbs}
        material={materials.bulbs}
        frustumCulled={false}
        renderOrder={4}
      />
      <points geometry={dust} material={materials.dust} frustumCulled={false} renderOrder={5} />
      <mesh geometry={sparks} material={materials.sparks} frustumCulled={false} renderOrder={6} />
      <mesh geometry={arcs} material={materials.arcs} frustumCulled={false} renderOrder={7} />
    </group>
  );
}
