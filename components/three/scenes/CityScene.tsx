"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  type Group,
  InstancedBufferAttribute,
  type InstancedMesh,
  Object3D,
  PlaneGeometry,
  type ShaderMaterial,
  type Vector3,
} from "three";
import { THEMES } from "@/lib/themes";
import { createRandom } from "@/lib/random";
import { fogGLSL, hashGLSL, outputGLSL } from "../glsl";
import { createSignAtlas, SkyDome, type SceneProps, useActiveRef, useFontsReady } from "../shared";

const THEME = THEMES.city;
const P = THEME.palette;

/* ------------------------------------------------------------------ */
/* Camera path                                                         */
/* ------------------------------------------------------------------ */

/** Where the camera sits for a given page scroll (0..1). */
export function cityCamera(scroll: number, time: number, pos: Vector3, look: Vector3) {
  const z = 20 - scroll * 200;
  pos.set(
    Math.sin(scroll * Math.PI * 1.5) * 2.4,
    3.4 + scroll * 26 + Math.sin(time * 0.5) * 0.08,
    z,
  );
  look.set(Math.sin(scroll * Math.PI) * -3, 9 + scroll * 20, z - 90);
}

/* ------------------------------------------------------------------ */
/* Procedural city layout                                              */
/* ------------------------------------------------------------------ */

type Building = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  seed: number;
  style: number;
  /** 0 = lines the avenue, higher numbers are further away */
  column: number;
  side: number;
};

const AVENUE_HALF_WIDTH = 9;
const LANDMARK_Z = -345;

function generateCity(tier: SceneProps["tier"]): Building[] {
  const rnd = createRandom(2077);
  const list: Building[] = [];
  const blockLength = 26;
  const crossStreet = 9;
  const columns = tier === "high" ? 5 : 3;

  for (const side of [-1, 1]) {
    for (let z0 = 34; z0 > -300; z0 -= blockLength + crossStreet) {
      let x0 = AVENUE_HALF_WIDTH;
      for (let column = 0; column < columns; column++) {
        const columnWidth = rnd.range(9, 16);
        const parts = rnd.int(1, 3);
        const depth = blockLength / parts;
        let zc = z0;
        for (let p = 0; p < parts; p++) {
          const d = depth - rnd.range(0.6, 2.2);
          const w = columnWidth - rnd.range(0.4, 2.4);
          let h = column === 0 ? rnd.range(12, 48) : rnd.range(20, 64 + column * 14);
          if (rnd.chance(0.07)) h = rnd.range(95, 160);
          const x = side * (x0 + columnWidth / 2);
          const z = zc - depth / 2;
          list.push({ x, y: h / 2, z, w, h, d, seed: rnd.next(), style: rnd.next(), column, side });
          if (h > 30 && rnd.chance(0.38)) {
            const h2 = rnd.range(8, 34);
            list.push({
              x: x + rnd.range(-1, 1),
              y: h + h2 / 2,
              z: z + rnd.range(-1, 1),
              w: w * rnd.range(0.45, 0.75),
              h: h2,
              d: d * rnd.range(0.45, 0.75),
              seed: rnd.next(),
              style: rnd.next(),
              column: column + 10,
              side,
            });
          }
          zc -= depth;
        }
        x0 += columnWidth + rnd.range(3, 6);
      }
    }
  }

  // Distant skyline behind the landmark
  const far = tier === "high" ? 90 : 45;
  for (let i = 0; i < far; i++) {
    const x = rnd.range(-200, 200);
    if (Math.abs(x) < 34) continue;
    const h = rnd.range(30, 170);
    const w = rnd.range(10, 26);
    const d = rnd.range(10, 26);
    list.push({
      x,
      y: h / 2,
      z: rnd.range(-330, -470),
      w,
      h,
      d,
      seed: rnd.next(),
      style: rnd.next(),
      column: 20,
      side: Math.sign(x),
    });
  }

  // The landmark megatower at the end of the avenue
  list.push({
    x: 0,
    y: 130,
    z: LANDMARK_Z,
    w: 30,
    h: 260,
    d: 30,
    seed: 0.42,
    style: 0.1,
    column: 30,
    side: 0,
  });
  list.push({
    x: 0,
    y: 290,
    z: LANDMARK_Z,
    w: 14,
    h: 60,
    d: 14,
    seed: 0.77,
    style: 0.4,
    column: 30,
    side: 0,
  });

  return list;
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

const buildingVertex = /* glsl */ `
attribute vec2 aSeed;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vScale;
varying vec2 vSeed;
void main() {
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = worldPos.xyz;
  vLocal = position;
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const buildingFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vScale;
varying vec2 vSeed;
${fogGLSL}
${hashGLSL}

void main() {
  vec3 n = normalize(vNormalW);
  float seed = vSeed.x;
  float style = vSeed.y;
  float distCam = length(vWorld - cameraPosition);
  vec3 col = vec3(0.012, 0.014, 0.032);

  if (abs(n.y) < 0.5) {
    bool alongX = abs(n.x) > 0.5;
    vec2 fc = alongX ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
    vec2 lp = alongX ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
    vec2 sc = alongX ? vec2(vScale.z, vScale.y) : vec2(vScale.x, vScale.y);

    // Window grid: lots of small panes, dimly lit, some floors completely off
    vec2 spacing = vec2(mix(0.7, 1.15, fract(seed * 13.7)), mix(1.05, 1.5, fract(seed * 7.3)));
    vec2 cell = fc / spacing;
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    vec2 aa = fwidth(cell) * 1.25;
    bool strips = fract(seed * 3.1) < 0.08;
    float wx = strips ? 1.0 : smoothstep(0.28 - aa.x, 0.28 + aa.x, f.x) * (1.0 - smoothstep(0.72 - aa.x, 0.72 + aa.x, f.x));
    float wy = smoothstep(0.34 - aa.y, 0.34 + aa.y, f.y) * (1.0 - smoothstep(0.7 - aa.y, 0.7 + aa.y, f.y));
    float margin = step(0.7, (0.5 - abs(lp.x)) * sc.x) * step(1.4, (0.5 - lp.y) * sc.y) * step(3.6, vWorld.y);
    vec2 rid = strips ? vec2(0.0, id.y) : id;
    float litChance = mix(0.26, 0.6, fract(seed * 5.1));
    float floorOn = step(0.22, hash12(vec2(id.y * 1.31, seed * 17.0)));
    float lit = step(1.0 - litChance, hash12(rid + seed * 91.7)) * floorOn;
    float flickerId = hash12(rid * 1.7 + seed);
    float flicker = flickerId > 0.975 ? step(0.35, hash11(floor(uTime * 9.0) + flickerId * 100.0)) : 1.0;
    float tone = hash12(rid + 3.7 + seed);
    vec3 warm = vec3(1.0, 0.55, 0.22);
    vec3 cool = vec3(0.3, 0.6, 1.0);
    vec3 wc = tone < 0.55 ? warm : (tone < 0.86 ? cool : (tone < 0.93 ? uColA : uColB));
    float bright = mix(0.14, 0.75, pow(hash12(rid + 9.1), 1.8));
    bright += step(0.97, hash12(rid + 4.4)) * 1.4;
    bright *= strips ? 0.35 : 1.0;
    float density = litChance * 0.78 * (strips ? 0.45 : 0.17) * 0.36;
    float tiny = clamp((max(aa.x, aa.y) - 0.16) * 4.0, 0.0, 1.0);
    float pattern = mix(wx * wy * lit * flicker * bright, density, tiny);
    col *= 0.7 + hash11(seed * 31.0) * 0.6;
    col += wc * pattern * margin;

    // Faint cool rim on the vertical edges so silhouettes read against the haze
    float rimDist = (0.5 - abs(lp.x)) * sc.x;
    col += vec3(0.25, 0.35, 0.8) * (1.0 - smoothstep(0.0, 0.6, rimDist)) * 0.05;

    // Storefronts along the avenue: a bright sign band over dim shop windows
    float onAvenue = alongX && abs(vWorld.x) < 30.0 ? 1.0 : 0.0;
    float shopCell = floor(vWorld.z / 5.0);
    float shopX = fract(vWorld.z / 5.0);
    float shopOn = step(0.3, hash11(shopCell + seed * 50.0));
    vec3 shopCol = hash11(shopCell * 3.3 + seed) > 0.5 ? uColA : uColB;
    shopCol = mix(shopCol, warm, step(0.7, hash11(shopCell * 7.7)));
    float shopFrame = step(0.1, shopX) * step(shopX, 0.9);
    float signBand = smoothstep(2.35, 2.45, vWorld.y) * (1.0 - smoothstep(2.85, 2.95, vWorld.y));
    float glassBand = smoothstep(0.3, 0.5, vWorld.y) * (1.0 - smoothstep(2.15, 2.3, vWorld.y));
    float mullion = step(0.06, abs(fract(shopX * 4.0) - 0.5) * 2.0);
    col += shopCol * signBand * shopFrame * shopOn * onAvenue * 2.4;
    col += mix(warm, shopCol, 0.35) * glassBand * mullion * shopFrame * shopOn * onAvenue * 0.32;

    // Neon trims, bright enough to bloom
    vec3 neon = style < 0.5 ? uColA : uColB;
    float edgeDist = (0.5 - abs(lp.x)) * sc.x;
    float topDist = (0.5 - lp.y) * sc.y;
    float edgeLine = 1.0 - smoothstep(0.0, 0.16, edgeDist);
    float topLine = 1.0 - smoothstep(0.0, 0.18, topDist);
    float pulse = 0.85 + 0.15 * sin(uTime * 1.5 + seed * 40.0);
    if (style < 0.28) {
      col += neon * edgeLine * 4.0 * pulse;
    } else if (style < 0.6) {
      col += neon * topLine * 3.4 * pulse;
    } else if (style < 0.7) {
      float bandY = sc.y * 0.5 - 5.0;
      float band = 1.0 - smoothstep(0.12, 0.42, abs(lp.y * sc.y - bandY));
      col += neon * band * 3.2 * pulse;
    }
  } else {
    col = vec3(0.004, 0.005, 0.012);
  }

  // Light pollution haze close to the ground
  col += mix(uColB, uColA, 0.5) * exp(-max(vWorld.y, 0.0) / 12.0) * 0.05;
  col = applyFog(col, distCam);
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

function useCityUniforms() {
  return useMemo(
    () => ({
      uTime: { value: 0 },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uSignal: { value: new Color(P.signal) },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );
}

function Buildings({ data, active }: { data: Building[]; active: boolean }) {
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const uniforms = useCityUniforms();

  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const seeds = new Float32Array(data.length * 2);
    data.forEach((b, i) => {
      seeds[i * 2] = b.seed;
      seeds[i * 2 + 1] = b.style;
    });
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 2));
    return g;
  }, [data]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    data.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return () => geometry.dispose();
  }, [data, geometry]);

  useFrame((state) => {
    if (!activeRef.current || !materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, data.length]} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={buildingVertex}
        fragmentShader={buildingFragment}
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Neon signs                                                          */
/* ------------------------------------------------------------------ */

type Sign = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  rect: [number, number, number, number];
  color: string;
  seed: number;
};

function generateSigns(buildings: Building[], tier: SceneProps["tier"]): Sign[] {
  const rnd = createRandom(404);
  const colors = [P.a, P.b, P.signal, P.a, P.b, "#ff5a36", "#8d6bff"];
  const signs: Sign[] = [];
  const max = tier === "high" ? 70 : 36;

  for (const b of buildings) {
    if (signs.length >= max) break;
    if (b.column === 0 && b.z > -290 && rnd.chance(0.7)) {
      // Blade signs sticking out over the avenue, facing the camera
      const count = rnd.int(1, 2);
      for (let i = 0; i < count; i++) {
        const v = rnd.int(0, 7);
        const height = rnd.range(7.5, 12);
        signs.push({
          x: b.side * (AVENUE_HALF_WIDTH - rnd.range(0.9, 1.6)),
          y: rnd.range(
            height / 2 + 3,
            Math.max(height / 2 + 4, Math.min(b.h - height / 2 - 1, 26)),
          ),
          z: b.z + rnd.range(-b.d * 0.35, b.d * 0.35),
          w: height / 4,
          h: height,
          rect: [v / 8, 0.5, 1 / 8, 0.5],
          color: rnd.pick(colors),
          seed: rnd.next(),
        });
      }
    }
    if (b.column < 3 && b.h > 18 && rnd.chance(0.3)) {
      // Wide signs on the faces that look back at the camera
      const hIndex = rnd.int(0, 7);
      const width = Math.min(b.w * 0.85, rnd.range(7, 12));
      signs.push({
        x: b.x,
        y: rnd.range(10, b.h - 4),
        z: b.z + b.d / 2 + 0.25,
        w: width,
        h: width / 4,
        rect: [(hIndex % 2) * 0.5, (3 - Math.floor(hIndex / 2)) * 0.125, 0.5, 0.125],
        color: rnd.pick(colors),
        seed: rnd.next(),
      });
    }
  }

  // A giant ad on the landmark tower
  signs.push({
    x: 0,
    y: 150,
    z: LANDMARK_Z + 15.5,
    w: 26,
    h: 6.5,
    rect: [0, 3 * 0.125, 0.5, 0.125],
    color: P.a,
    seed: 0.33,
  });
  signs.push({
    x: 0,
    y: 105,
    z: LANDMARK_Z + 15.5,
    w: 10,
    h: 40,
    rect: [0, 0.5, 1 / 8, 0.5],
    color: P.b,
    seed: 0.21,
  });
  return signs;
}

function Signs({ data, active }: { data: Sign[]; active: boolean }) {
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const atlas = useMemo(() => createSignAtlas(), []);
  useFontsReady(atlas);

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const rects = new Float32Array(data.length * 4);
    const colors = new Float32Array(data.length * 3);
    const seeds = new Float32Array(data.length);
    const c = new Color();
    data.forEach((s, i) => {
      rects.set(s.rect, i * 4);
      c.set(s.color);
      colors.set([c.r, c.g, c.b], i * 3);
      seeds[i] = s.seed;
    });
    g.setAttribute("aRect", new InstancedBufferAttribute(rects, 4));
    g.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
    return g;
  }, [data]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAtlas: { value: atlas.texture },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [atlas],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    data.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.set(s.w, s.h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return () => geometry.dispose();
  }, [data, geometry]);

  useFrame((state) => {
    if (!activeRef.current || !materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, data.length]} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        side={DoubleSide}
        vertexShader={
          /* glsl */ `
          attribute vec4 aRect;
          attribute vec3 aColor;
          attribute float aSeed;
          varying vec2 vUv;
          varying vec2 vLocalUv;
          varying vec3 vColor;
          varying float vSeed;
          varying float vDist;
          void main() {
            vUv = aRect.xy + uv * aRect.zw;
            vLocalUv = uv;
            vColor = aColor;
            vSeed = aSeed;
            vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vDist = length(w.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform sampler2D uAtlas;
          uniform float uTime;
          varying vec2 vUv;
          varying vec2 vLocalUv;
          varying vec3 vColor;
          varying float vSeed;
          varying float vDist;
          ${fogGLSL}
          ${hashGLSL}
          void main() {
            float glyph = texture2D(uAtlas, vUv).r;
            float broken = step(0.86, vSeed);
            float flick = broken > 0.5 ? step(0.3, hash11(floor(uTime * 12.0) + vSeed * 91.0)) : 1.0;
            float pulse = 0.82 + 0.18 * sin(uTime * 2.2 + vSeed * 30.0);
            float scan = 0.88 + 0.12 * sin(vLocalUv.y * 160.0 - uTime * 6.0);
            vec3 col = vColor * glyph * 3.4 * flick * pulse * scan;
            col += vColor * 0.035;
            col = applyFog(col, vDist);
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Flying traffic                                                      */
/* ------------------------------------------------------------------ */

function Traffic({ active, tier }: { active: boolean; tier: SceneProps["tier"] }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const perLane = tier === "high" ? 26 : 14;

  const { geometry, count } = useMemo(() => {
    const rnd = createRandom(88);
    const lanes: [number, number, number, number][] = [];
    for (let i = 0; i < 10; i++) {
      lanes.push([
        rnd.range(-6.5, 6.5),
        rnd.range(13, 40),
        rnd.range(16, 34),
        i % 2 === 0 ? 1 : -1,
      ]);
    }
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      lanes.push([
        side * rnd.range(16, 40),
        rnd.range(48, 80),
        rnd.range(20, 40),
        rnd.chance(0.5) ? 1 : -1,
      ]);
    }
    const total = lanes.length * perLane;
    const laneData = new Float32Array(total * 4);
    const phases = new Float32Array(total);
    let k = 0;
    lanes.forEach((lane) => {
      for (let j = 0; j < perLane; j++) {
        laneData.set(lane, k * 4);
        phases[k] = (j / perLane) * 640 + rnd.range(0, 18);
        k++;
      }
    });
    const g = new BoxGeometry(1, 1, 1);
    g.setAttribute("aLane", new InstancedBufferAttribute(laneData, 4));
    g.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    return { geometry: g, count: total };
  }, [perLane]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStart: { value: 60 },
      uLength: { value: 640 },
      uTail: { value: new Color("#ff2a4d") },
      uHead: { value: new Color("#d8f6ff") },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!activeRef.current || !materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh args={[geometry, undefined, count]} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          uniform float uStart;
          uniform float uLength;
          attribute vec4 aLane;
          attribute float aPhase;
          varying float vAlong;
          varying float vDir;
          varying float vDist;
          varying float vEdge;
          void main() {
            float travel = mod(aPhase + uTime * aLane.z, uLength);
            float z = aLane.w > 0.0 ? uStart - travel : uStart - uLength + travel;
            vec3 p = position * vec3(0.3, 0.14, 3.4);
            vec3 worldPos = vec3(aLane.x, aLane.y + sin(uTime * 0.7 + aPhase) * 0.2, z) + p;
            vAlong = position.z + 0.5;
            vDir = aLane.w;
            vEdge = smoothstep(0.0, 30.0, travel) * (1.0 - smoothstep(uLength - 30.0, uLength, travel));
            vec4 mv = viewMatrix * vec4(worldPos, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uTail;
          uniform vec3 uHead;
          varying float vAlong;
          varying float vDir;
          varying float vDist;
          varying float vEdge;
          ${fogGLSL}
          void main() {
            float lead = clamp(vDir > 0.0 ? 1.0 - vAlong : vAlong, 0.0, 1.0);
            float intensity = pow(lead, 2.2) * 5.0 + 0.15;
            vec3 col = (vDir > 0.0 ? uTail : uHead) * intensity;
            float fade = (1.0 - fogAmount(vDist)) * vEdge * smoothstep(18.0, 50.0, vDist);
            gl_FragColor = vec4(col * fade, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Rain                                                                */
/* ------------------------------------------------------------------ */

function Rain({ active, tier }: { active: boolean; tier: SceneProps["tier"] }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const count = tier === "high" ? 5200 : 2200;

  const geometry = useMemo(() => {
    const rnd = createRandom(5);
    const positions = new Float32Array(count * 2 * 3);
    const seeds = new Float32Array(count * 2 * 3);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const s: [number, number, number] = [rnd.next(), rnd.next(), rnd.next()];
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e;
        seeds.set(s, v * 3);
        ends[v] = e;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 3));
    g.setAttribute("aEnd", new BufferAttribute(ends, 1));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color("#9fc9ff") },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!activeRef.current || !materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          attribute vec3 aSeed;
          attribute float aEnd;
          varying float vAlpha;
          void main() {
            vec3 box = vec3(46.0, 34.0, 60.0);
            float speed = 26.0 + aSeed.x * 10.0;
            vec3 p = aSeed * box;
            p.y -= uTime * speed;
            // Wrap the drops around the camera so it is always raining around you
            vec3 origin = cameraPosition - vec3(box.x * 0.5, box.y * 0.45, box.z * 0.75);
            vec3 local = mod(p - origin, box);
            vec3 worldPos = origin + local;
            vec3 streak = vec3(-0.12, -1.0, 0.04) * (0.55 + aSeed.z * 0.6);
            worldPos += streak * aEnd;
            float edge = smoothstep(0.0, 4.0, local.x) * (1.0 - smoothstep(box.x - 4.0, box.x, local.x))
                       * smoothstep(0.0, 4.0, local.z) * (1.0 - smoothstep(box.z - 4.0, box.z, local.z))
                       * smoothstep(0.0, 3.0, local.y);
            vec4 mv = viewMatrix * vec4(worldPos, 1.0);
            float dist = -mv.z;
            vAlpha = edge * (1.0 - smoothstep(10.0, 46.0, dist)) * (aEnd > 0.5 ? 1.0 : 0.25);
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            gl_FragColor = vec4(uColor * vAlpha * 0.55, vAlpha);
            ${outputGLSL}
          }
        `
        }
      />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ */
/* Searchlights                                                        */
/* ------------------------------------------------------------------ */

const BEAM_HEIGHT = 240;

function Searchlights({ active }: { active: boolean }) {
  const groupRef = useRef<Group>(null);
  const activeRef = useActiveRef(active);

  const geometry = useMemo(() => {
    const g = new ConeGeometry(16, BEAM_HEIGHT, 32, 1, true);
    // Move the tip of the cone to the origin, pointing up
    g.translate(0, -BEAM_HEIGHT / 2, 0);
    g.rotateX(Math.PI);
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uHeight: { value: BEAM_HEIGHT },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  const beams = useMemo(
    () => [
      { x: -44, y: 48, z: -150, color: 0, speed: 0.22, phase: 0 },
      { x: 52, y: 56, z: -210, color: 1, speed: -0.17, phase: 2 },
      { x: -11, y: 262, z: LANDMARK_Z - 11, color: 1, speed: 0.13, phase: 4 },
      { x: 11, y: 262, z: LANDMARK_Z + 11, color: 0, speed: -0.1, phase: 1 },
    ],
    [],
  );

  useFrame((state) => {
    const group = groupRef.current;
    if (!activeRef.current || !group) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      const beam = beams[i];
      child.rotation.z = Math.sin(t * beam.speed + beam.phase) * 0.5;
      child.rotation.x = Math.cos(t * beam.speed * 0.8 + beam.phase) * 0.25 - 0.1;
    });
  });

  return (
    <group ref={groupRef}>
      {beams.map((beam, i) => (
        <mesh key={i} geometry={geometry} position={[beam.x, beam.y, beam.z]} frustumCulled={false}>
          <shaderMaterial
            uniforms={uniforms}
            transparent
            depthWrite={false}
            side={DoubleSide}
            blending={AdditiveBlending}
            defines={{ BEAM_COLOR: beam.color }}
            vertexShader={
              /* glsl */ `
              uniform float uHeight;
              varying float vH;
              varying vec3 vNormalV;
              varying vec3 vViewV;
              void main() {
                vH = clamp(position.y / uHeight, 0.0, 1.0);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vNormalV = normalize(normalMatrix * normal);
                vViewV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
              }
            `
            }
            fragmentShader={
              /* glsl */ `
              uniform vec3 uColA;
              uniform vec3 uColB;
              varying float vH;
              varying vec3 vNormalV;
              varying vec3 vViewV;
              void main() {
                float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
                float a = pow(facing, 2.0) * pow(1.0 - vH, 1.4) * 0.2;
                vec3 col = BEAM_COLOR == 0 ? uColA : uColB;
                gl_FragColor = vec4(col * a, a);
                ${outputGLSL}
              }
            `
            }
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Landmark rings                                                      */
/* ------------------------------------------------------------------ */

function LandmarkRings({ active }: { active: boolean }) {
  const groupRef = useRef<Group>(null);
  const activeRef = useActiveRef(active);
  const colorA = useMemo(() => new Color(P.a).multiplyScalar(2.6), []);
  const colorB = useMemo(() => new Color(P.b).multiplyScalar(2.6), []);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!activeRef.current || !group) return;
    group.children.forEach((ring, i) => {
      ring.rotation.z += delta * (i % 2 === 0 ? 0.12 : -0.09);
      ring.position.y = 70 + i * 62 + Math.sin(state.clock.elapsedTime * 0.4 + i) * 3;
    });
  });

  return (
    <group ref={groupRef} position={[0, 0, LANDMARK_Z]}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          rotation={[Math.PI / 2 + (i - 1) * 0.12, 0, 0]}
          position={[0, 70 + i * 62, 0]}
        >
          <torusGeometry args={[34 + i * 6, 0.45, 8, 160]} />
          <meshBasicMaterial color={i === 1 ? colorB : colorA} toneMapped={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Street                                                              */
/* ------------------------------------------------------------------ */

function StreetMarkings() {
  const uniforms = useMemo(
    () => ({
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, -200]} frustumCulled={false}>
      <planeGeometry args={[60, 900]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColA;
          uniform vec3 uColB;
          varying vec3 vWorld;
          ${fogGLSL}
          float lineX(float x, float center, float width) {
            float fw = fwidth(x);
            return 1.0 - smoothstep(width, width + fw * 1.5, abs(x - center));
          }
          void main() {
            float x = vWorld.x;
            float z = vWorld.z;
            // Neon curbs on both sides of the avenue
            float curb = lineX(x, -9.0, 0.08) + lineX(x, 9.0, 0.08);
            // Dashed lane lines
            float dash = step(0.45, fract(z / 7.0));
            float lanes = (lineX(x, -3.0, 0.06) + lineX(x, 3.0, 0.06)) * dash;
            // Double center line
            float center = lineX(x, -0.25, 0.05) + lineX(x, 0.25, 0.05);
            float onAvenue = step(abs(x), 9.2);
            vec3 col = uColA * curb * 3.0 + vec3(0.9, 0.9, 1.0) * lanes * 0.35 * onAvenue + uColB * center * 1.4;
            col *= 1.0 - fogAmount(length(vWorld - cameraPosition));
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </mesh>
  );
}

function Street({ tier, active }: { tier: SceneProps["tier"]; active: boolean }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -200]} frustumCulled={false}>
        <planeGeometry args={[520, 900]} />
        {tier === "high" && active ? (
          <MeshReflectorMaterial
            // The reflection is multiplied into the base color and lit by the
            // ambient light, so the base stays mid-grey and the mirror term does the work.
            resolution={512}
            blur={[260, 80]}
            mixBlur={0.85}
            mixStrength={7}
            mixContrast={1}
            mirror={0.93}
            depthScale={0.45}
            minDepthThreshold={0.25}
            maxDepthThreshold={1.2}
            roughness={1}
            metalness={0}
            color="#7c84a6"
          />
        ) : (
          <meshBasicMaterial color="#05060f" />
        )}
      </mesh>
      <StreetMarkings />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export default function CityScene({ active, tier }: SceneProps) {
  const buildings = useMemo(() => generateCity(tier), [tier]);
  const signs = useMemo(() => generateSigns(buildings, tier), [buildings, tier]);

  return (
    <group visible={active}>
      <SkyDome
        zenith={P.sky}
        horizon={P.fog}
        glow="#3a1460"
        glowStrength={0.55}
        glowHeight={0.12}
      />
      <ambientLight intensity={1} />
      <Buildings data={buildings} active={active} />
      <Signs data={signs} active={active} />
      <Traffic active={active} tier={tier} />
      <Rain active={active} tier={tier} />
      <Searchlights active={active} />
      <LandmarkRings active={active} />
      <Street tier={tier} active={active} />
    </group>
  );
}
