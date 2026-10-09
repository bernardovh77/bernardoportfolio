"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  PlaneGeometry,
  type ShaderMaterial,
  Vector3,
} from "three";
import { THEMES } from "@/lib/themes";
import { createRandom } from "@/lib/random";
import { world } from "@/lib/world";
import { fogGLSL, hashGLSL, outputGLSL, simplexGLSL } from "../glsl";
import {
  createGlyphAtlas,
  SkyDome,
  Starfield,
  type SceneProps,
  useActiveRef,
  useFontsReady,
} from "../shared";

const THEME = THEMES.ocean;
const P = THEME.palette;

const MOON_POSITION: [number, number, number] = [200, 128, -540];

/** Wave height shared by the glowing points and the water surface under them. */
const waveGLSL = /* glsl */ `
${simplexGLSL}
float waveHeight(vec2 p, float t) {
  float h = 0.0;
  h += sin(dot(p, vec2(0.28, 0.96)) * 0.075 + t * 0.9) * 1.8;
  h += sin(dot(p, vec2(-0.6, 0.8)) * 0.12 + t * 1.25) * 0.95;
  h += sin(dot(p, vec2(0.92, 0.38)) * 0.21 + t * 1.6) * 0.45;
  h += snoise(vec3(p * 0.035, t * 0.12)) * 1.4;
  return h;
}
`;

/** Camera placement for a given page scroll (0..1). */
export function oceanCamera(scroll: number, time: number, pos: Vector3, look: Vector3) {
  pos.set(
    Math.sin(time * 0.2) * 1.2,
    6 + scroll * 24 + Math.sin(time * 0.9) * 0.3,
    24 - scroll * 46,
  );
  look.set(Math.sin(scroll * Math.PI) * 8, 8 - scroll * 5, -150);
}

/* ------------------------------------------------------------------ */
/* Point-cloud ocean                                                   */
/* ------------------------------------------------------------------ */

function Waves({ active, tier }: SceneProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const flow = useRef(0);
  const dpr = useThree((state) => state.viewport.dpr);
  const n = tier === "high" ? 260 : 150;

  const geometry = useMemo(() => {
    const width = 340;
    const depth = 340;
    const grid = new Float32Array(n * n * 2);
    let k = 0;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        grid[k++] = (ix / (n - 1) - 0.5) * width;
        grid[k++] = 40 - (iz / (n - 1)) * depth;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(n * n * 3), 3));
    g.setAttribute("aGrid", new BufferAttribute(grid, 2));
    return g;
  }, [n]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uPixelRatio: { value: 1 },
      uPing: { value: [0, -70] },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uDeep: { value: new Color("#0a2a6a") },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    const boost = Math.min(Math.abs(world.velocity) * 0.6, 30);
    flow.current += Math.min(delta, 0.1) * ((world.reducedMotion ? 1 : 5) + boost);
    m.uniforms.uTime.value = state.clock.elapsedTime * (world.reducedMotion ? 0.3 : 1);
    m.uniforms.uFlow.value = flow.current;
    m.uniforms.uPixelRatio.value = dpr;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          uniform float uFlow;
          uniform float uPixelRatio;
          uniform vec2 uPing;
          attribute vec2 aGrid;
          varying float vH;
          varying float vDist;
          varying float vPing;
          ${waveGLSL}
          void main() {
            vec2 q = aGrid - vec2(0.0, uFlow);
            float h = waveHeight(q, uTime);
            vec3 pos = vec3(aGrid.x, h, aGrid.y);
            float d = length(aGrid - uPing);
            float radius = mod(uTime * 24.0, 320.0);
            float ring = (d - radius) / 2.6;
            vPing = exp(-ring * ring) * (1.0 - radius / 320.0);
            vH = h;
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            vDist = -mv.z;
            gl_PointSize = clamp(2.2 * uPixelRatio * (70.0 / vDist), 1.2, 7.0 * uPixelRatio);
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColA;
          uniform vec3 uColB;
          uniform vec3 uDeep;
          varying float vH;
          varying float vDist;
          varying float vPing;
          ${fogGLSL}
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c);
            if (r > 0.5) discard;
            float soft = 1.0 - smoothstep(0.05, 0.5, r);
            float crest = smoothstep(0.2, 3.2, vH);
            vec3 col = mix(uColB, uColA, crest);
            col *= 0.6 + crest * 2.4;
            col += vec3(0.85, 1.0, 1.0) * smoothstep(2.9, 3.8, vH) * 1.6;
            col += uColA * vPing * 3.5;
            float a = soft * (1.0 - fogAmount(vDist)) * (0.55 + crest * 0.45);
            gl_FragColor = vec4(col * a, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Water surface (dark, with a moonlight glint)                        */
/* ------------------------------------------------------------------ */

function WaterSurface({ active, tier }: SceneProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const flow = useRef(0);
  const segments = tier === "high" ? 220 : 120;

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(340, 340, segments, segments);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -130);
    return g;
  }, [segments]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uMoon: { value: new Vector3(...MOON_POSITION) },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uGlow: { value: new Color("#0f4f86") },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    const boost = Math.min(Math.abs(world.velocity) * 0.6, 30);
    flow.current += Math.min(delta, 0.1) * ((world.reducedMotion ? 1 : 5) + boost);
    m.uniforms.uTime.value = state.clock.elapsedTime * (world.reducedMotion ? 0.3 : 1);
    m.uniforms.uFlow.value = flow.current;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          uniform float uFlow;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vH;
          ${waveGLSL}
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vec2 q = w.xz - vec2(0.0, uFlow);
            float h = waveHeight(q, uTime);
            float e = 0.8;
            float hx = waveHeight(q + vec2(e, 0.0), uTime);
            float hz = waveHeight(q + vec2(0.0, e), uTime);
            vNormal = normalize(vec3(h - hx, e, h - hz));
            w.y += h - 0.25;
            vWorld = w.xyz;
            vH = h;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uMoon;
          uniform vec3 uColA;
          uniform vec3 uColB;
          uniform vec3 uGlow;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vH;
          ${fogGLSL}
          void main() {
            vec3 V = normalize(cameraPosition - vWorld);
            vec3 N = normalize(vNormal);
            vec3 L = normalize(uMoon - vWorld);
            vec3 R = reflect(-V, N);
            float facing = max(dot(R, L), 0.0);
            float spec = pow(facing, 900.0);
            float sheen = pow(facing, 40.0);
            float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
            vec3 col = vec3(0.003, 0.012, 0.03);
            col += uGlow * fres * 0.6;
            float dist = length(vWorld - cameraPosition);
            float far = smoothstep(12.0, 70.0, dist);
            col += mix(uColB, uColA, 0.5) * sheen * 0.12 * far;
            col += mix(uColA, vec3(1.0), 0.4) * spec * 2.6 * (0.25 + far * 0.75);
            col += uColB * smoothstep(1.5, 3.5, vH) * 0.05;
            col = applyFog(col, dist);
            gl_FragColor = vec4(col, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Code-rain pillars                                                   */
/* ------------------------------------------------------------------ */

function DataPillars({ active, tier }: SceneProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const atlas = useMemo(() => createGlyphAtlas(), []);
  useFontsReady(atlas);

  const { geometry, count } = useMemo(() => {
    const rnd = createRandom(64);
    const total = tier === "high" ? 16 : 9;
    const pos = new Float32Array(total * 3);
    const size = new Float32Array(total * 2);
    const seed = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * rnd.range(14, 90);
      const z = rnd.range(-25, -200);
      pos.set([x, -1, z], i * 3);
      size.set([rnd.range(4.5, 9), rnd.range(30, 95)], i * 2);
      seed[i] = rnd.next();
    }
    const g = new PlaneGeometry(1, 1);
    g.setAttribute("aPos", new InstancedBufferAttribute(pos, 3));
    g.setAttribute("aSize", new InstancedBufferAttribute(size, 2));
    g.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));
    return { geometry: g, count: total };
  }, [tier]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGlyphs: { value: atlas.texture },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity * 0.55 },
    }),
    [atlas],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime * (world.reducedMotion ? 0.3 : 1);
  });

  return (
    <instancedMesh args={[geometry, undefined, count]} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          attribute vec3 aPos;
          attribute vec2 aSize;
          attribute float aSeed;
          varying vec2 vUv;
          varying vec2 vSize;
          varying float vSeed;
          varying float vDist;
          void main() {
            vec3 toCam = cameraPosition - aPos;
            toCam.y = 0.0;
            toCam = normalize(toCam);
            vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
            vec3 worldPos = aPos + right * position.x * aSize.x + vec3(0.0, (position.y + 0.5) * aSize.y, 0.0);
            vUv = uv;
            vSize = aSize;
            vSeed = aSeed;
            vec4 mv = viewMatrix * vec4(worldPos, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform sampler2D uGlyphs;
          uniform float uTime;
          uniform vec3 uColA;
          uniform vec3 uColB;
          varying vec2 vUv;
          varying vec2 vSize;
          varying float vSeed;
          varying float vDist;
          ${fogGLSL}
          ${hashGLSL}
          void main() {
            vec2 cells = vec2(max(1.0, floor(vSize.x / 1.15)), floor(vSize.y / 1.35));
            vec2 c = vUv * cells;
            vec2 id = floor(c);
            vec2 f = fract(c);
            float colSeed = hash12(vec2(id.x, vSeed * 100.0));
            float speed = 5.0 + colSeed * 9.0;
            float loopLen = cells.y + 24.0;
            float head = mod(uTime * speed + colSeed * 300.0, loopLen);
            float row = cells.y - id.y;
            float behind = head - row;
            float trail = behind >= 0.0 ? exp(-behind * 0.16) : 0.0;
            float isHead = step(0.0, behind) * step(behind, 1.0);
            float glyphIndex = floor(hash12(id + floor(uTime * (1.5 + colSeed * 5.0)) * 0.37 + vSeed) * 64.0);
            vec2 guv = vec2(mod(glyphIndex, 8.0) + f.x, 7.0 - floor(glyphIndex / 8.0) + f.y) / 8.0;
            float glyph = texture2D(uGlyphs, guv).r;
            vec3 col = mix(uColA, vec3(0.9, 1.0, 1.0), isHead);
            col = mix(col, uColB, smoothstep(0.6, 1.0, vUv.y) * 0.5);
            float frame = (1.0 - smoothstep(0.0, 0.025, vUv.x)) + smoothstep(0.975, 1.0, vUv.x);
            float verticalFade = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
            float a = (glyph * trail * (1.2 + isHead * 2.5) + frame * 0.18 + 0.025) * verticalFade;
            a *= 1.0 - fogAmount(vDist);
            gl_FragColor = vec4(col * a * 2.8, a);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Holographic moon                                                    */
/* ------------------------------------------------------------------ */

function Moon({ active }: { active: boolean }) {
  const bodyRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRim: { value: new Color(P.a) },
      uBody: { value: new Color("#0f2348") },
      uSignal: { value: new Color(P.signal) },
    }),
    [],
  );
  const ringUniforms = useMemo(
    () => ({
      uColor: { value: new Color(P.signal) },
      uColA: { value: new Color(P.a) },
    }),
    [],
  );
  const haloUniforms = useMemo(() => ({ uColor: { value: new Color(P.b) } }), []);

  useFrame((state) => {
    if (!activeRef.current || !bodyRef.current) return;
    bodyRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group position={MOON_POSITION}>
      <mesh position={[0, 0, -40]} renderOrder={-6}>
        <planeGeometry args={[520, 520]} />
        <shaderMaterial
          uniforms={haloUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            varying vec2 vUv;
            void main() {
              float r = length(vUv * 2.0 - 1.0);
              float glow = exp(-r * 3.6) * 0.45;
              gl_FragColor = vec4(uColor * glow, glow);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[62, 64, 48]} />
        <shaderMaterial
          ref={bodyRef}
          uniforms={uniforms}
          vertexShader={
            /* glsl */ `
            varying vec3 vNormalV;
            varying vec3 vViewV;
            varying vec3 vObj;
            void main() {
              vObj = position;
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vNormalV = normalize(normalMatrix * normal);
              vViewV = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform float uTime;
            uniform vec3 uRim;
            uniform vec3 uBody;
            uniform vec3 uSignal;
            varying vec3 vNormalV;
            varying vec3 vViewV;
            varying vec3 vObj;
            ${simplexGLSL}
            void main() {
              vec3 n = normalize(vObj);
              float fres = pow(1.0 - max(dot(normalize(vNormalV), normalize(vViewV)), 0.0), 2.6);
              float lat = asin(clamp(n.y, -1.0, 1.0));
              float lon = atan(n.z, n.x) + uTime * 0.03;
              vec2 g = vec2(lon / 6.28318 * 28.0, lat / 3.14159 * 14.0);
              vec2 fw = max(fwidth(g), vec2(1e-4));
              vec2 gl = abs(fract(g - 0.5) - 0.5) / fw;
              float grid = 1.0 - min(min(gl.x, gl.y), 1.0);
              float surface = snoise(n * 2.6) * 0.5 + 0.5;
              surface += snoise(n * 7.0) * 0.18;
              float bandDist = abs(fract(n.y * 0.5 + 0.5 - uTime * 0.04) - 0.5);
              float band = 1.0 - smoothstep(0.0, 0.03, bandDist);
              vec3 col = uBody * (0.25 + surface * 0.5);
              col += uRim * fres * 2.4;
              col += mix(uRim, uSignal, 0.5) * grid * 0.4;
              col += uRim * band * 0.9;
              gl_FragColor = vec4(col, 1.0);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      <mesh rotation={[1.25, 0.2, 0.35]}>
        <ringGeometry args={[86, 140, 160, 1]} />
        <shaderMaterial
          uniforms={ringUniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          vertexShader={
            /* glsl */ `
            varying float vR;
            void main() {
              vR = length(position.xy);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform vec3 uColor;
            uniform vec3 uColA;
            varying float vR;
            void main() {
              float t = (vR - 86.0) / 54.0;
              float bands = 0.55 + 0.45 * sin(t * 70.0) * sin(t * 13.0);
              float gap = smoothstep(0.42, 0.44, t) * (1.0 - smoothstep(0.5, 0.52, t));
              float a = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.9, 1.0, t)) * bands * (1.0 - gap * 0.85) * 0.5;
              vec3 col = mix(uColor, uColA, t);
              gl_FragColor = vec4(col * a * 1.4, a);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Rising plankton                                                     */
/* ------------------------------------------------------------------ */

function Plankton({ active, tier }: SceneProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const count = tier === "high" ? 1400 : 600;

  const geometry = useMemo(() => {
    const rnd = createRandom(9);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) seeds[i] = rnd.next();
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 3));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColA: { value: new Color(P.a) },
      uSignal: { value: new Color(P.signal) },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime * (world.reducedMotion ? 0.3 : 1);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
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
          varying float vAlpha;
          varying float vMix;
          void main() {
            float height = 34.0;
            float y = mod(aSeed.y * height + uTime * (0.6 + aSeed.z * 1.4), height);
            vec3 worldPos = vec3(
              (aSeed.x - 0.5) * 150.0 + sin(uTime * 0.3 + aSeed.z * 30.0) * 2.0,
              y - 1.0,
              20.0 - aSeed.z * 200.0
            );
            vec4 mv = viewMatrix * vec4(worldPos, 1.0);
            float dist = -mv.z;
            float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.x * 3.0) + aSeed.y * 50.0);
            vAlpha = twinkle * smoothstep(0.0, 3.0, y) * (1.0 - smoothstep(height - 8.0, height, y)) * (1.0 - smoothstep(60.0, 190.0, dist));
            vMix = aSeed.x;
            gl_PointSize = clamp(110.0 / dist, 1.5, 7.0);
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColA;
          uniform vec3 uSignal;
          varying float vAlpha;
          varying float vMix;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha;
            vec3 col = mix(uColA, uSignal, step(0.7, vMix)) * 2.2;
            gl_FragColor = vec4(col * a, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export default function OceanScene({ active, tier }: SceneProps) {
  return (
    <group visible={active}>
      <SkyDome
        zenith={P.sky}
        horizon={P.fog}
        glow="#127aa8"
        glowStrength={0.75}
        glowHeight={0.08}
      />
      <Starfield
        count={tier === "high" ? 1400 : 600}
        color="#d6f4ff"
        active={active}
        seed={33}
        minHeight={0.04}
      />
      <Moon active={active} />
      <WaterSurface active={active} tier={tier} />
      <Waves active={active} tier={tier} />
      <DataPillars active={active} tier={tier} />
      <Plankton active={active} tier={tier} />
    </group>
  );
}
