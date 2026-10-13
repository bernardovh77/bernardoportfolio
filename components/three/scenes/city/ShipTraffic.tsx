"use client";

import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Group,
  InstancedBufferAttribute,
  type InstancedMesh,
  ShaderMaterial,
} from "three";
import { ridingIn } from "@/lib/drive";
import { THEMES } from "@/lib/themes";
import { fogGLSL, outputGLSL } from "../../glsl";
import { usePrecompile } from "../../vehicle/console";
import type { CityRide } from "./flow";
import {
  buildDart,
  buildHauler,
  buildShipGlow,
  ENGINE_COLORS,
  PAINTS,
  type SkyTraffic,
  skyTraffic,
  skyTrafficGLSL,
} from "./skyLanes";

/**
 * The ships around the sky taxi: painted hulls with glass canopies, nav lights
 * and engines, plus the glows that make them read from far away.
 */

const P = THEMES.city.palette;
const inShip = () => ridingIn("ship");

function trafficUniforms() {
  return {
    uTravel: { value: 0 },
    uTime: { value: 0 },
    uPaint: { value: PAINTS.map((hex) => new Color(hex)) },
    uEngine: { value: ENGINE_COLORS.map((hex) => new Color(hex)) },
    // City glow from above (the haze) and below (the streets), neon from both sides
    uSky: { value: new Color(0.26, 0.2, 0.45) },
    uGround: { value: new Color(0.42, 0.16, 0.42) },
    uRimA: { value: new Color(P.a).multiplyScalar(0.55) },
    uRimB: { value: new Color(P.b).multiplyScalar(0.55) },
    uFogColor: { value: new Color(P.fog) },
    uFogDensity: { value: THEMES.city.fogDensity },
  };
}

function createHullMaterial() {
  return new ShaderMaterial({
    // The pieces are not all wound the same way: draw both sides, light the one facing us
    side: DoubleSide,
    uniforms: trafficUniforms(),
    vertexShader: /* glsl */ `
      ${skyTrafficGLSL}
      uniform vec3 uPaint[${PAINTS.length}];
      uniform vec3 uEngine[${ENGINE_COLORS.length}];
      attribute vec3 aColor;
      attribute float aKind;
      varying vec3 vColor;
      varying vec3 vEngine;
      varying float vKind;
      varying float vSeed;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFade;
      void main() {
        float facing;
        float bank;
        vec4 place = shipPlace(facing, bank);
        vec3 w = shipToWorld(position, facing, bank, place.xyz);
        vNormal = shipNormal(normal, facing, bank);
        int kind = int(aKind + 0.5);
        vColor = kind == 0 ? aColor * uPaint[int(aLook.y + 0.5)] : aColor;
        vEngine = uEngine[int(aLook.z + 0.5)];
        vKind = aKind;
        vSeed = aLook.w;
        vFade = place.w;
        vWorld = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSky;
      uniform vec3 uGround;
      uniform vec3 uRimA;
      uniform vec3 uRimB;
      varying vec3 vColor;
      varying vec3 vEngine;
      varying float vKind;
      varying float vSeed;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFade;
      ${fogGLSL}
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        int kind = int(vKind + 0.5);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 col;
        if (kind == 2) {
          // Engine nozzle
          col = vEngine * 4.5;
        } else if (kind == 3) {
          // Headlights
          col = vColor * 5.0;
        } else if (kind == 5) {
          // Tail lights
          col = vColor * 3.5;
        } else if (kind == 6) {
          // Nav lights: steady and dim, with a bright strobe now and then
          float strobe = step(0.86, fract(uTime * 0.8 + vSeed * 7.0));
          col = vColor * (0.6 + strobe * 7.0);
        } else if (kind == 7) {
          // Neon accents in the engines' color
          col = vEngine * 2.2;
        } else {
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          vec3 neon = mix(uRimA, uRimB, 0.5 + 0.5 * n.x);
          vec3 light = vec3(0.08, 0.08, 0.14) + uSky * max(n.y, 0.0) + uGround * max(-n.y, 0.0) + neon * (0.2 + fres * 1.6);
          col = vColor * light;
          if (kind == 1) {
            // Canopy glass: dark, catching the city's neon
            col = vec3(0.008, 0.01, 0.018) + neon * (0.06 + fres * 0.9) + uSky * max(n.y, 0.0) * 0.12;
          } else if (kind == 4) {
            col *= 0.7;
          }
        }
        col = applyFog(col, length(vWorld - cameraPosition));
        col = mix(uFogColor, col, vFade);
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

function createGlowMaterial() {
  return new ShaderMaterial({
    uniforms: trafficUniforms(),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      ${skyTrafficGLSL}
      uniform vec3 uEngine[${ENGINE_COLORS.length}];
      attribute vec2 aCorner;
      attribute float aPart;
      attribute float aSide;
      varying vec2 vCorner;
      varying float vPart;
      varying vec3 vColor;
      varying float vFade;
      varying float vDist;
      void main() {
        float facing;
        float bank;
        vec4 place = shipPlace(facing, bank);
        bool hauler = aLook.x > 0.5;
        vec3 engine = hauler ? vec3(1.18 * aSide, 0.0, 2.33) : vec3(0.27 * aSide, 0.08, 2.79);
        vec3 head = hauler ? vec3(0.5 * aSide, 0.08, -2.52) : vec3(0.26 * aSide, -0.02, -2.23);
        int part = int(aPart + 0.5);
        vec3 w;
        // Which way the ship points, and how much it faces the camera
        vec3 forward = vec3(0.0, 0.0, -facing);
        vec3 toCamera = normalize(cameraPosition - place.xyz);
        float facingUs = dot(forward, toCamera);
        float strength = 1.0;
        if (part <= 1) {
          // Exhaust plume behind the engine, one flat and one upright quad
          float plumeLength = hauler ? 2.4 : 3.2;
          float plumeWidth = hauler ? 0.34 : 0.26;
          vec3 local = engine + vec3(0.0, 0.0, aCorner.x * plumeLength);
          if (part == 0) local.x += aCorner.y * plumeWidth;
          else local.y += aCorner.y * plumeWidth;
          w = shipToWorld(local, facing, bank, place.xyz);
          vColor = uEngine[int(aLook.z + 0.5)];
        } else {
          // Camera-facing glow: the engine's core (seen from behind) or a headlight (seen from the front)
          bool core = part == 2;
          vec3 center = shipToWorld(core ? engine + vec3(0.0, 0.0, 0.12) : head - vec3(0.0, 0.0, 0.08), facing, bank, place.xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float size = core ? (hauler ? 0.85 : 0.7) : 0.75;
          w = center + (right * (aCorner.x * 2.0 - 1.0) + up * aCorner.y) * size;
          strength = core ? smoothstep(-0.2, 0.6, -facingUs) : smoothstep(0.0, 0.7, facingUs);
          vColor = core ? uEngine[int(aLook.z + 0.5)] : vec3(1.0, 0.92, 0.8);
        }
        vCorner = aCorner;
        vPart = aPart;
        vFade = place.w * strength;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vCorner;
      varying float vPart;
      varying vec3 vColor;
      varying float vFade;
      varying float vDist;
      ${fogGLSL}
      void main() {
        float glow;
        if (vPart < 1.5) {
          // Hot near the nozzle, thinning out behind, flickering a little
          float u = vCorner.x;
          float flicker = 0.85 + 0.15 * sin(uTime * 37.0 + u * 9.0);
          glow = pow(1.0 - u, 1.8) * exp(-vCorner.y * vCorner.y * 3.2) * 1.4 * flicker;
        } else {
          vec2 q = vec2(vCorner.x * 2.0 - 1.0, vCorner.y);
          float r = dot(q, q);
          glow = exp(-r * 5.0) * 1.6 + exp(-r * 1.6) * 0.25;
        }
        vec3 col = vColor * glow * vFade * (1.0 - fogAmount(vDist));
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

function withTraffic(geometry: ReturnType<typeof buildDart>, traffic: SkyTraffic) {
  geometry.setAttribute("aLane", new InstancedBufferAttribute(traffic.lanes, 4));
  geometry.setAttribute("aLook", new InstancedBufferAttribute(traffic.looks, 4));
  return geometry;
}

export function ShipTraffic({ tier, ride }: { tier: "high" | "low"; ride: RefObject<CityRide> }) {
  const groupRef = useRef<Group>(null);
  const dartsRef = useRef<InstancedMesh>(null);
  const haulersRef = useRef<InstancedMesh>(null);
  const glowRef = useRef<InstancedMesh>(null);

  const parts = useMemo(() => {
    const traffic = skyTraffic(tier);
    return {
      darts: withTraffic(buildDart(), traffic.darts),
      haulers: withTraffic(buildHauler(), traffic.haulers),
      glow: withTraffic(buildShipGlow(), traffic.all),
      counts: { darts: traffic.darts.count, haulers: traffic.haulers.count, all: traffic.all.count },
      hull: createHullMaterial(),
      glowMaterial: createGlowMaterial(),
    };
  }, [tier]);

  useLayoutEffect(
    () => () => {
      parts.darts.dispose();
      parts.haulers.dispose();
      parts.glow.dispose();
      parts.hull.dispose();
      parts.glowMaterial.dispose();
    },
    [parts],
  );

  usePrecompile(groupRef, inShip);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = ride.current.riding;
    if (!group.visible) return;
    for (const mesh of [dartsRef.current, haulersRef.current, glowRef.current]) {
      const material = mesh?.material as ShaderMaterial | undefined;
      if (!material) continue;
      material.uniforms.uTravel.value = ride.current.travel;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <instancedMesh ref={dartsRef} args={[parts.darts, parts.hull, parts.counts.darts]} frustumCulled={false} />
      <instancedMesh ref={haulersRef} args={[parts.haulers, parts.hull, parts.counts.haulers]} frustumCulled={false} />
      <instancedMesh
        ref={glowRef}
        args={[parts.glow, parts.glowMaterial, parts.counts.all]}
        frustumCulled={false}
        renderOrder={2}
      />
    </group>
  );
}
