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
import { CAR_POSITION } from "@/lib/car/cabin";
import { drive } from "@/lib/drive";
import { THEMES } from "@/lib/themes";
import { fogGLSL, outputGLSL } from "../../glsl";
import { buildTrafficCar, buildTrafficGlow, trafficData, trafficGLSL } from "./traffic";

/**
 * The cars around you while you ride: real bodies with tail and head lights,
 * a glow on the road under each one. Seen from the page the traffic is only
 * light trails (HighwayTraffic); these take over once you are in the car.
 */

const P = THEMES.desert.palette;

function trafficUniforms() {
  return {
    uTravel: { value: 0 },
    uTime: { value: 0 },
    uDrive: { value: 1 },
    uCarZ: { value: CAR_POSITION.z },
    uSky: { value: new Color(1.1, 0.45, 1.0) },
    uHorizon: { value: new Color(P.a) },
    uFogColor: { value: new Color(P.fog) },
    uFogDensity: { value: THEMES.desert.fogDensity },
  };
}

function createCarMaterial() {
  return new ShaderMaterial({
    // The pieces are not all wound the same way: draw both sides, light the one facing us
    side: DoubleSide,
    uniforms: trafficUniforms(),
    vertexShader: /* glsl */ `
      ${trafficGLSL}
      attribute vec3 aColor;
      attribute float aKind;
      attribute vec4 aCar;
      varying vec3 vColor;
      varying float vKind;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vFade;
      void main() {
        vec2 place = trafficPlace(aCar);
        vec3 p = position;
        vec3 n = normal;
        // Oncoming cars are the same model, turned around
        if (aCar.z < 0.0) {
          p.xz = -p.xz;
          n.xz = -n.xz;
        }
        p.y += sin(uTime * 2.1 + aCar.w) * 0.008;
        vec3 w = p + vec3(aCar.x, 0.0, place.x);
        vWorld = w;
        vNormal = n;
        vColor = aColor;
        vKind = aKind;
        vFade = place.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSky;
      uniform vec3 uHorizon;
      varying vec3 vColor;
      varying float vKind;
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
          col = vColor * 5.0;
        } else if (kind == 3) {
          col = vColor * 6.0;
        } else {
          // Dark paint: sky light from above, a pink rim from the sunset
          float top = max(n.y, 0.0);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          vec3 light = vec3(0.3, 0.18, 0.42) + uSky * top + uHorizon * fres * 1.6;
          col = vColor * light;
          if (kind == 1) col += uHorizon * fres * 0.12 + vec3(0.012, 0.006, 0.02);
          if (kind == 4) col *= 0.35;
          col += uHorizon * max(dot(n, normalize(vec3(0.0, 0.3, -1.0))), 0.0) * 0.02;
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
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      ${trafficGLSL}
      attribute vec4 aCar;
      varying vec2 vLocal;
      varying float vDir;
      varying float vFade;
      varying float vDist;
      void main() {
        vec2 place = trafficPlace(aCar);
        vec3 p = position;
        vLocal = p.xz;
        if (aCar.z < 0.0) p.xz = -p.xz;
        vec3 w = p + vec3(aCar.x, 0.0, place.x);
        vDir = aCar.z;
        vFade = place.y;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vLocal;
      varying float vDir;
      varying float vFade;
      varying float vDist;
      ${fogGLSL}
      void main() {
        vec2 q = vLocal;
        // Neon underglow, a soft slab of light under the car
        vec2 u = q / vec2(1.05, 2.3);
        float under = exp(-pow(dot(u * u, u * u), 1.0) * 2.0);
        vec3 col = (vDir > 0.0 ? vec3(1.0, 0.25, 0.55) : vec3(0.1, 0.9, 1.0)) * under * 0.32;
        // Red spill behind the tail lights
        float tail = exp(-q.x * q.x * 1.6) * smoothstep(2.0, 2.5, q.y) * exp(-(q.y - 2.4) * 0.9);
        col += vec3(1.0, 0.08, 0.15) * tail * 0.5;
        // Headlights throwing light on the road ahead
        float beam = exp(-q.x * q.x / (0.25 + max(-q.y - 2.2, 0.0) * 0.18)) * smoothstep(-2.0, -3.0, q.y) * exp((q.y + 2.2) * 0.3);
        col += vec3(1.0, 0.9, 0.75) * beam * 0.35;
        col *= vFade * (1.0 - fogAmount(vDist));
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

export function TrafficCars({ tier, travel }: { tier: "high" | "low"; travel: RefObject<number> }) {
  const groupRef = useRef<Group>(null);
  const carsRef = useRef<InstancedMesh>(null);
  const glowRef = useRef<InstancedMesh>(null);
  const perLane = tier === "high" ? 14 : 8;

  const parts = useMemo(() => {
    const data = trafficData(perLane);
    const count = data.length / 4;
    const car = buildTrafficCar();
    car.setAttribute("aCar", new InstancedBufferAttribute(data, 4));
    const glow = buildTrafficGlow();
    glow.setAttribute("aCar", new InstancedBufferAttribute(data, 4));
    return { car, glow, count, carMaterial: createCarMaterial(), glowMaterial: createGlowMaterial() };
  }, [perLane]);

  useLayoutEffect(
    () => () => {
      parts.car.dispose();
      parts.glow.dispose();
      parts.carMaterial.dispose();
      parts.glowMaterial.dispose();
    },
    [parts],
  );

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = drive.inside;
    if (!drive.inside) return;
    for (const mesh of [carsRef.current, glowRef.current]) {
      const material = mesh?.material as ShaderMaterial | undefined;
      if (!material) continue;
      material.uniforms.uTravel.value = travel.current;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <instancedMesh ref={carsRef} args={[parts.car, parts.carMaterial, parts.count]} frustumCulled={false} />
      <instancedMesh
        ref={glowRef}
        args={[parts.glow, parts.glowMaterial, parts.count]}
        frustumCulled={false}
        renderOrder={1}
      />
    </group>
  );
}
