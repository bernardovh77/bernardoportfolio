"use client";

import { type RefObject, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  EdgesGeometry,
  type Group,
  InstancedBufferAttribute,
  type InstancedMesh,
  OctahedronGeometry,
  PlaneGeometry,
  type ShaderMaterial,
  type Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CAR_POSITION } from "@/lib/car/cabin";
import { drive, driveStore } from "@/lib/drive";
import { THEMES } from "@/lib/themes";
import { createRandom } from "@/lib/random";
import { world } from "@/lib/world";
import { fogGLSL, outputGLSL, simplexGLSL } from "../glsl";
import { SkyDome, Starfield, type SceneProps, useActiveRef } from "../shared";
import { CarInterior } from "./desert/CarInterior";
import { ExitSign } from "./desert/ExitSign";
import { TrafficCars } from "./desert/TrafficCars";
import { LANE_LINE, trafficData, trafficGLSL } from "./desert/traffic";

const THEME = THEMES.desert;
const P = THEME.palette;

/** Camera placement for a given page scroll (0..1). */
export function desertCamera(scroll: number, time: number, pos: Vector3, look: Vector3) {
  const sway = Math.sin(scroll * Math.PI);
  pos.set(
    Math.sin(time * 0.25) * 0.5 + sway * 3,
    2.5 + scroll * 17 + Math.sin(time * 1.3) * 0.04,
    14 - scroll * 22,
  );
  look.set(sway * -4, 8 + scroll * 6, -140);
}

/** World units per second to km/h on the dashboard (the car is about 4 units long). */
const KMH = 3.3;

/**
 * Distance travelled along the highway. Scrolling the page makes you drive faster,
 * and riding in the car cruises at highway speed.
 * Shared by the terrain, gates, traffic and dust so they all move together.
 */
function useTravel(active: boolean) {
  const travel = useRef(0);
  const speed = useRef(18);
  const activeRef = useActiveRef(active);
  useFrame((_, delta) => {
    if (!activeRef.current) return;
    const dt = Math.min(delta, 0.1);
    const boost = Math.min(Math.abs(world.velocity) * 2.2, 90);
    const cruise = drive.inside ? 34 : 18;
    const base = world.reducedMotion ? (drive.inside ? 8 : 3) : cruise;
    speed.current += (base + boost - speed.current) * (1 - Math.exp(-dt * (drive.inside ? 0.8 : 2.5)));
    travel.current += speed.current * dt;
    drive.speed = speed.current * KMH;
  });
  return travel;
}

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

const terrainHeightGLSL = /* glsl */ `
${simplexGLSL}
float terrainHeight(vec2 p) {
  float ax = abs(p.x);
  float valley = smoothstep(10.0, 34.0, ax);
  float mountainMask = smoothstep(28.0, 120.0, ax);
  float n = snoise(p * 0.009) * 0.5 + 0.5;
  float ridge = 1.0 - abs(snoise(p * 0.017 + 4.0));
  float mountains = (n * 0.55 + ridge * ridge * 0.65) * 62.0 * mountainMask;
  float dunes = (snoise(p * 0.035) * 0.5 + 0.5) * 3.5 * valley;
  return mountains + dunes;
}
`;

function Terrain({
  active,
  tier,
  travel,
}: {
  active: boolean;
  tier: SceneProps["tier"];
  travel: RefObject<number>;
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const segments = tier === "high" ? 300 : 170;

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(640, 620, segments, segments);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -250);
    return g;
  }, [segments]);

  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uTime: { value: 0 },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uSignal: { value: new Color(P.signal) },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    m.uniforms.uTravel.value = travel.current;
    m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          uniform float uTravel;
          varying vec3 vWorld;
          varying float vScrollZ;
          varying float vHeight;
          ${terrainHeightGLSL}
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vec2 p = vec2(w.x, w.z - uTravel);
            float h = terrainHeight(p);
            w.y += h;
            vWorld = w.xyz;
            vScrollZ = p.y;
            vHeight = h;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform float uTime;
          uniform vec3 uColA;
          uniform vec3 uColB;
          uniform vec3 uSignal;
          varying vec3 vWorld;
          varying float vScrollZ;
          varying float vHeight;
          ${fogGLSL}
          void main() {
            float ax = abs(vWorld.x);
            vec2 g = vec2(vWorld.x, vScrollZ) / 5.0;
            vec2 fw = max(fwidth(g), vec2(1e-4));
            vec2 gl = abs(fract(g - 0.5) - 0.5) / fw;
            float line = 1.0 - min(min(gl.x, gl.y), 1.0);
            float dense = 1.0 - smoothstep(0.18, 0.7, max(fw.x, fw.y));
            float hN = clamp(vHeight / 60.0, 0.0, 1.0);
            vec3 lineCol = mix(uColA, uSignal, smoothstep(0.12, 0.7, hN));
            lineCol = mix(lineCol, uColB, smoothstep(0.82, 1.0, hN));
            vec3 base = mix(vec3(0.016, 0.006, 0.03), vec3(0.05, 0.01, 0.065), hN);
            float pulse = 0.8 + 0.2 * sin(vScrollZ * 0.05 - uTime * 2.0);
            vec3 col = base + lineCol * line * dense * 2.4 * pulse + lineCol * (1.0 - dense) * 0.06;

            // Highway
            float road = 1.0 - smoothstep(7.0, 7.6, ax);
            float fx = fwidth(vWorld.x) * 1.5;
            float edge = 1.0 - smoothstep(0.1, 0.1 + fx, abs(ax - 6.7));
            float lane = (1.0 - smoothstep(0.06, 0.06 + fx, abs(ax - ${LANE_LINE.toFixed(2)}))) * step(0.5, fract(vScrollZ / 9.0));
            float center = (1.0 - smoothstep(0.08, 0.08 + fx, abs(vWorld.x))) * step(0.45, fract(vScrollZ / 5.0));
            vec3 roadCol = vec3(0.01, 0.006, 0.016) + uColB * edge * 3.2 + vec3(1.0, 0.85, 0.75) * lane * 0.7 + uColA * center * 1.8;
            col = mix(col, roadCol, road);

            col = applyFog(col, length(vWorld - cameraPosition));
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
/* Sun                                                                 */
/* ------------------------------------------------------------------ */

function Sun({ active }: { active: boolean }) {
  const sunRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTop: { value: new Color("#ffd23f") },
      uBottom: { value: new Color(P.a) },
    }),
    [],
  );
  const glowUniforms = useMemo(() => ({ uColor: { value: new Color("#ff4f7b") } }), []);

  useFrame((state) => {
    if (!activeRef.current || !sunRef.current) return;
    sunRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group position={[0, 62, -545]}>
      <mesh position={[0, 0, -6]} renderOrder={-5}>
        <planeGeometry args={[620, 620]} />
        <shaderMaterial
          uniforms={glowUniforms}
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
              float glow = exp(-r * 4.2) * 0.9 + exp(-r * 1.6) * 0.12;
              gl_FragColor = vec4(uColor * glow, glow);
              ${outputGLSL}
            }
          `
          }
        />
      </mesh>
      <mesh renderOrder={-4}>
        <planeGeometry args={[250, 250]} />
        <shaderMaterial
          ref={sunRef}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          vertexShader={
            /* glsl */ `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
          `
          }
          fragmentShader={
            /* glsl */ `
            uniform float uTime;
            uniform vec3 uTop;
            uniform vec3 uBottom;
            varying vec2 vUv;
            void main() {
              vec2 uv = vUv * 2.0 - 1.0;
              float r = length(uv);
              float aa = fwidth(r) * 1.5;
              float disc = 1.0 - smoothstep(0.97 - aa, 0.97 + aa, r);
              float y = uv.y;
              vec3 col = mix(uBottom, uTop, smoothstep(-0.85, 0.8, y));
              float stripes = 1.0;
              if (y < 0.3) {
                float s = fract((y + uTime * 0.035) * 9.0);
                float k = clamp((0.3 - y) / 1.25, 0.0, 1.0);
                float gap = k * 0.6;
                float fs = fwidth(y * 9.0) * 1.5;
                stripes = smoothstep(gap - fs, gap + fs, s);
              }
              float a = disc * stripes;
              gl_FragColor = vec4(col * 2.6 * a, a);
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
/* Neon gates over the highway                                         */
/* ------------------------------------------------------------------ */

const GATE_COUNT = 9;
const GATE_SPAN = 630;

function Gates({ active, travel }: { active: boolean; travel: RefObject<number> }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);

  const geometry = useMemo(() => {
    const thickness = 0.32;
    const left = new BoxGeometry(thickness, 13, thickness).translate(-9, 6.5, 0);
    const right = new BoxGeometry(thickness, 13, thickness).translate(9, 6.5, 0);
    const top = new BoxGeometry(18 + thickness, thickness, thickness).translate(0, 13, 0);
    const inner = new BoxGeometry(14, thickness * 0.5, thickness * 0.5).translate(0, 11.4, 0);
    const merged = mergeGeometries([left, right, top, inner]);
    [left, right, top, inner].forEach((g) => g.dispose());
    const ids = new Float32Array(GATE_COUNT);
    for (let i = 0; i < GATE_COUNT; i++) ids[i] = i;
    merged.setAttribute("aIndex", new InstancedBufferAttribute(ids, 1));
    return merged;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uTime: { value: 0 },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    m.uniforms.uTravel.value = travel.current;
    m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh args={[geometry, undefined, GATE_COUNT]} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          uniform float uTravel;
          attribute float aIndex;
          varying float vFade;
          varying float vIndex;
          varying float vDist;
          void main() {
            float spacing = ${GATE_SPAN.toFixed(1)} / ${GATE_COUNT.toFixed(1)};
            float offset = mod(aIndex * spacing + uTravel, ${GATE_SPAN.toFixed(1)});
            float z = -560.0 + offset;
            vFade = smoothstep(0.0, 80.0, offset) * (1.0 - smoothstep(${GATE_SPAN.toFixed(1)} - 40.0, ${GATE_SPAN.toFixed(1)}, offset));
            vIndex = aIndex;
            vec4 mv = viewMatrix * vec4(position + vec3(0.0, 0.0, z), 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform float uTime;
          uniform vec3 uColA;
          uniform vec3 uColB;
          varying float vFade;
          varying float vIndex;
          varying float vDist;
          ${fogGLSL}
          void main() {
            vec3 col = mod(vIndex, 2.0) < 0.5 ? uColA : uColB;
            float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + vIndex * 1.7);
            col *= 4.2 * pulse * vFade;
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
/* Light trails on the highway                                         */
/* ------------------------------------------------------------------ */

function HighwayTraffic({
  active,
  tier,
  travel,
}: {
  active: boolean;
  tier: SceneProps["tier"];
  travel: RefObject<number>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const activeRef = useActiveRef(active);
  const perLane = tier === "high" ? 14 : 8;

  const { geometry, count } = useMemo(() => {
    const data = trafficData(perLane);
    const g = new BoxGeometry(1, 1, 1);
    g.setAttribute("aCar", new InstancedBufferAttribute(data, 4));
    return { geometry: g, count: data.length / 4 };
  }, [perLane]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uDrive: { value: 0 },
      uCarZ: { value: CAR_POSITION.z },
      uTail: { value: new Color("#ff2340") },
      uHead: { value: new Color("#fff1d6") },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEME.fogDensity },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!activeRef.current || !mesh) return;
    // In the car, real cars take over (TrafficCars)
    mesh.visible = !drive.inside;
    const m = mesh.material as ShaderMaterial;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uTravel.value = travel.current;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          ${trafficGLSL}
          attribute vec4 aCar;
          varying float vAlong;
          varying float vDir;
          varying float vDist;
          varying float vEdge;
          void main() {
            vec2 place = trafficPlace(aCar);
            vec3 p = position * vec3(0.5, 0.16, 4.0);
            vec3 worldPos = vec3(aCar.x, 0.55, place.x) + p;
            vAlong = position.z + 0.5;
            vDir = aCar.z;
            vEdge = place.y;
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
            float intensity = pow(lead, 2.0) * 4.5 + 0.1;
            vec3 col = (vDir > 0.0 ? uTail : uHead) * intensity;
            gl_FragColor = vec4(col * (1.0 - fogAmount(vDist)) * vEdge, 1.0);
            ${outputGLSL}
          }
        `
        }
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Wireframe monuments                                                 */
/* ------------------------------------------------------------------ */

function Monuments({ active }: { active: boolean }) {
  const groupRef = useRef<Group>(null);
  const activeRef = useActiveRef(active);

  const { pyramid, octa } = useMemo(() => {
    const p = new ConeGeometry(1, 1, 4, 1);
    const o = new OctahedronGeometry(1, 0);
    const result = { pyramid: new EdgesGeometry(p), octa: new EdgesGeometry(o) };
    p.dispose();
    o.dispose();
    return result;
  }, []);

  const colors = useMemo(
    () => ({
      a: new Color(P.a).multiplyScalar(3),
      b: new Color(P.b).multiplyScalar(2.5),
      s: new Color(P.signal).multiplyScalar(3.5),
    }),
    [],
  );

  useLayoutEffect(
    () => () => {
      pyramid.dispose();
      octa.dispose();
    },
    [pyramid, octa],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!activeRef.current || !group) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      child.rotation.y += delta * (i === 2 ? 0.25 : 0.03);
      if (i === 2) child.position.y = 96 + Math.sin(t * 0.6) * 4;
    });
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={pyramid} position={[-185, 55, -430]} scale={[95, 110, 95]}>
        <lineBasicMaterial color={colors.s} toneMapped={false} fog={false} />
      </lineSegments>
      <lineSegments geometry={pyramid} position={[160, 36, -360]} scale={[60, 72, 60]}>
        <lineBasicMaterial color={colors.a} toneMapped={false} fog={false} />
      </lineSegments>
      <lineSegments geometry={octa} position={[110, 96, -470]} scale={[22, 34, 22]}>
        <lineBasicMaterial color={colors.b} toneMapped={false} fog={false} />
      </lineSegments>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Dust                                                                */
/* ------------------------------------------------------------------ */

function Dust({ active, travel }: { active: boolean; travel: RefObject<number> }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);
  const count = 900;

  const geometry = useMemo(() => {
    const rnd = createRandom(12);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) seeds[i] = rnd.next();
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 3));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uColor: { value: new Color("#ffb3c8") },
      // x, z of the car and 1 while someone rides in it
      uCar: { value: [CAR_POSITION.x, CAR_POSITION.z, 0] },
    }),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const m = materialRef.current;
    if (!activeRef.current || !m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uTravel.value = travel.current;
    m.uniforms.uCar.value[2] = drive.inside ? 1 : 0;
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
          uniform float uTravel;
          uniform vec3 uCar;
          attribute vec3 aSeed;
          varying float vAlpha;
          void main() {
            vec3 box = vec3(120.0, 14.0, 160.0);
            vec3 p = aSeed * box;
            p.z += uTravel * (0.9 + aSeed.y * 0.2);
            p.x += uTime * (2.0 + aSeed.z * 3.0);
            p.y += sin(uTime * 0.5 + aSeed.x * 20.0) * 0.6;
            vec3 local = mod(p, box);
            vec3 worldPos = vec3(local.x - box.x * 0.5, local.y + 0.2, local.z - box.z + 20.0);
            vec4 mv = viewMatrix * vec4(worldPos, 1.0);
            float dist = -mv.z;
            vAlpha = (1.0 - smoothstep(30.0, 140.0, dist)) * smoothstep(0.0, 6.0, local.z) * (0.3 + aSeed.x * 0.7);
            // No dust floating around inside the car
            vec2 inCar = abs(worldPos.xz - uCar.xy) - vec2(1.1, 2.6);
            if (uCar.z > 0.5 && max(inCar.x, inCar.y) < 0.0 && worldPos.y < 1.6) vAlpha = 0.0;
            gl_PointSize = clamp(40.0 / dist, 1.0, 4.0);
            gl_Position = projectionMatrix * mv;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha * 0.6;
            gl_FragColor = vec4(uColor * a, a);
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

export default function DesertScene({ active, tier }: SceneProps) {
  const travel = useTravel(active);
  // The car is only built once someone hitches a ride
  const { visited } = useSyncExternalStore(
    driveStore.subscribe,
    driveStore.getSnapshot,
    driveStore.getServerSnapshot,
  );
  return (
    <group visible={active}>
      <SkyDome
        zenith={P.sky}
        horizon={P.fog}
        glow="#ff3f8e"
        glowStrength={0.38}
        glowHeight={0.07}
      />
      <Starfield
        count={tier === "high" ? 1100 : 500}
        color="#ffd9ec"
        active={active}
        seed={21}
        minHeight={0.12}
      />
      <Sun active={active} />
      <Monuments active={active} />
      <Terrain active={active} tier={tier} travel={travel} />
      <Gates active={active} travel={travel} />
      <HighwayTraffic active={active} tier={tier} travel={travel} />
      <Dust active={active} travel={travel} />
      <ExitSign active={active} travel={travel} />
      {visited && <TrafficCars tier={tier} travel={travel} />}
      {visited && <CarInterior tier={tier} travel={travel} />}
    </group>
  );
}
