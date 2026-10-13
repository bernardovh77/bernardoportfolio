"use client";

import { type RefObject, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  type Group,
  LinearFilter,
  type Mesh,
  Raycaster,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
} from "three";
import { doom, DOOM_HEIGHT, DOOM_WIDTH } from "@/lib/car/doom";
import { H, W } from "@/lib/car/draw";
import { getCarOS } from "@/lib/car/os";
import { drive, leaveRide, type Vehicle } from "@/lib/drive";
import { outputGLSL } from "../glsl";

/**
 * What the car and the ship have in common: the console screen running NV-77 OS
 * (and DOOM), the material of the cabin pieces, the projected head-up display,
 * and clicking on the screen. Only one vehicle is ridden at a time, so they share
 * one console.
 */

/** The screen lights up this long after landing in the seat (it boots while the head turns). */
const POWER_ON_DELAY = 2.4;

/* ------------------------------------------------------------------ */
/* Cabin material                                                      */
/* ------------------------------------------------------------------ */

/** Light falling on the cabin, by direction (world space; vehicles face -z). */
export type CabinLights = {
  ambient: Color;
  /** On surfaces facing up (the sky) */
  top?: Color;
  /** On surfaces facing down (light coming up from below) */
  bottom?: Color;
  /** On surfaces facing `frontDir` */
  front?: Color;
  frontDir?: Vector3;
  /** On surfaces facing left (-x) and right (+x) */
  left?: Color;
  right?: Color;
  /** Glossy trim catches this color at grazing angles */
  rim?: Color;
  /**
   * Glossy paint mirrors the world around it: below and above the horizon, and
   * bright signs sliding past (strength 0 turns it off).
   */
  reflect?: { strength: number; low: Color; high: Color; neonA: Color; neonB: Color };
};

/**
 * Matte, neon, glossy and blinking pieces (see KIND in ./builder.ts),
 * lit by the light around the vehicle and by the console screen.
 */
export function createCabinMaterial(lights: CabinLights) {
  const black = () => new Color(0, 0, 0);
  return new ShaderMaterial({
    // The pieces are not all wound the same way: draw both sides, light the one facing us
    side: DoubleSide,
    uniforms: {
      uAmbient: { value: lights.ambient },
      uTop: { value: lights.top ?? black() },
      uBottom: { value: lights.bottom ?? black() },
      uFront: { value: lights.front ?? black() },
      uFrontDir: { value: (lights.frontDir ?? new Vector3(0, 0, -1)).clone().normalize() },
      uLeft: { value: lights.left ?? black() },
      uRight: { value: lights.right ?? black() },
      uRim: { value: lights.rim ?? black() },
      uReflect: { value: lights.reflect?.strength ?? 0 },
      uEnvLow: { value: lights.reflect?.low ?? black() },
      uEnvHigh: { value: lights.reflect?.high ?? black() },
      uEnvA: { value: lights.reflect?.neonA ?? black() },
      uEnvB: { value: lights.reflect?.neonB ?? black() },
      /** Distance travelled, so the reflections slide by */
      uFlow: { value: 0 },
      uScreenPos: { value: new Vector3() },
      uScreenGlow: { value: new Color(0, 0, 0) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aKind;
      varying vec3 vColor;
      varying float vKind;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vColor = aColor;
        vKind = aKind;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uFront;
      uniform vec3 uFrontDir;
      uniform vec3 uLeft;
      uniform vec3 uRight;
      uniform vec3 uRim;
      uniform float uReflect;
      uniform vec3 uEnvLow;
      uniform vec3 uEnvHigh;
      uniform vec3 uEnvA;
      uniform vec3 uEnvB;
      uniform float uFlow;
      uniform vec3 uScreenPos;
      uniform vec3 uScreenGlow;
      uniform float uTime;
      varying vec3 vColor;
      varying float vKind;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        int kind = int(vKind + 0.5);
        vec3 col;
        if (kind == 1) {
          // Neon: lights itself
          col = vColor;
        } else if (kind == 3) {
          // Indicator lights, each blinking at its own pace (the phase rides on the kind)
          float phase = (vKind - 3.0) / 0.4;
          float rate = mix(0.5, 1.9, fract(phase * 7.31));
          float on = step(0.3, fract(uTime * rate + phase));
          col = vColor * mix(0.1, 1.0, on);
        } else {
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 light = uAmbient
            + uTop * max(n.y, 0.0)
            + uBottom * max(-n.y, 0.0)
            + uFront * max(dot(n, uFrontDir), 0.0)
            + uLeft * max(-n.x, 0.0)
            + uRight * max(n.x, 0.0);
          // Glow of the console screen
          vec3 toScreen = uScreenPos - vWorld;
          float d2 = max(dot(toScreen, toScreen), 1e-4);
          light += uScreenGlow * max(dot(n, toScreen * inversesqrt(d2)), 0.0) / (1.0 + d2 * 24.0);
          col = vColor * light;
          if (kind == 2) {
            // Glossy trim: a rim of light at grazing angles
            float f = pow(1.0 - max(dot(n, V), 0.0), 4.0);
            col += uRim * f * 0.06;
            if (uReflect > 0.0) {
              // A glossy coat mirroring the city: streets below, haze above, neon signs sliding past
              vec3 R = reflect(-V, n);
              vec3 env = mix(uEnvLow, uEnvHigh, smoothstep(-0.25, 0.35, R.y));
              float angle = atan(R.x, -R.z);
              float band = pow(max(sin(angle * 9.0 + uFlow * 0.11), 0.0), 18.0) * (1.0 - smoothstep(0.2, 0.75, abs(R.y)));
              env += mix(uEnvA, uEnvB, step(0.0, sin(angle * 4.5 + uFlow * 0.055 + 1.3))) * band * 2.0;
              col += env * uReflect * (0.25 + f * 0.75);
            }
          }
        }
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/* Console screen                                                      */
/* ------------------------------------------------------------------ */

function createScreenMaterial(os: CanvasTexture, game: DataTexture) {
  return new ShaderMaterial({
    uniforms: {
      uOs: { value: os },
      uDoom: { value: game },
      uSource: { value: 0 },
      uPower: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uOs;
      uniform sampler2D uDoom;
      uniform float uSource;
      uniform float uPower;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        // A touch of curvature, like an old monitor behind glass
        c *= 1.0 + dot(c, c) * 0.05;
        vec2 uv = c + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

        vec3 col = uSource > 0.5
          ? texture2D(uDoom, vec2(uv.x, 1.0 - uv.y)).rgb
          : texture2D(uOs, uv).rgb;

        // Scanlines and a faint shadow mask
        col *= 0.86 + 0.14 * sin(uv.y * 400.0 * 3.14159);
        col *= 0.93 + 0.07 * sin(gl_FragCoord.x * 2.0944);
        // Darker toward the edges of the tube
        float edge = smoothstep(0.0, 0.04, uv.x) * smoothstep(0.0, 0.04, 1.0 - uv.x)
                   * smoothstep(0.0, 0.06, uv.y) * smoothstep(0.0, 0.06, 1.0 - uv.y);
        col *= mix(0.45, 1.0, edge);

        // Power on: the picture opens from a bright line
        float open = smoothstep(0.15, 0.85, uPower);
        float band = 1.0 - smoothstep(open * 0.5, open * 0.5 + 0.006, abs(c.y));
        float line = (1.0 - smoothstep(0.0, 0.01, abs(c.y))) * smoothstep(0.0, 0.15, uPower) * (1.0 - open);
        col = col * band * open + vec3(1.4, 1.2, 1.6) * line;

        // Glass: dark when off, with a faint diagonal reflection
        vec3 glass = vec3(0.01, 0.006, 0.016);
        glass += vec3(0.022, 0.012, 0.034) * smoothstep(0.12, 0.0, abs(vUv.x * 0.8 + vUv.y - 1.25));
        col = col * inside * (uSource > 0.5 ? 1.12 : 1.0) + glass;
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

function createConsole() {
  const os = getCarOS();
  const osTexture = new CanvasTexture(os.canvas);
  osTexture.colorSpace = SRGBColorSpace;
  osTexture.minFilter = LinearFilter;
  osTexture.magFilter = LinearFilter;
  osTexture.generateMipmaps = false;

  const doomTexture = new DataTexture(
    new Uint8Array(DOOM_WIDTH * DOOM_HEIGHT * 4),
    DOOM_WIDTH,
    DOOM_HEIGHT,
    RGBAFormat,
    UnsignedByteType,
  );
  doomTexture.colorSpace = SRGBColorSpace;
  doomTexture.minFilter = LinearFilter;
  doomTexture.magFilter = LinearFilter;
  doomTexture.generateMipmaps = false;
  doomTexture.needsUpdate = true;

  return {
    os,
    osTexture,
    doomTexture,
    /** Shared by both vehicles' screens */
    screenMaterial: createScreenMaterial(osTexture, doomTexture),
    /** 0 = off, 1 = fully on */
    power: 0,
    doomVersion: -1,
  };
}

let consoleParts: ReturnType<typeof createConsole> | null = null;

/** The console, created the first time someone gets in a vehicle. */
export function getConsole() {
  if (!consoleParts) consoleParts = createConsole();
  return consoleParts;
}

/**
 * Runs the console for one frame while riding: boots it a moment after landing,
 * steps the OS and DOOM, uploads what changed. Returns the screen's power (0..1).
 */
export function runConsole(dt: number, time: number) {
  const c = getConsole();
  const os = c.os;
  const sinceArrival = (performance.now() - drive.arrivedAt) / 1000;
  if (os.mode === "off" && sinceArrival > POWER_ON_DELAY) os.powerOn();
  c.power = os.mode === "off" ? 0 : Math.min(1, c.power + dt / 0.45);
  os.speed = drive.speed;
  os.frame(dt);

  const screen = c.screenMaterial.uniforms;
  screen.uPower.value = c.power;
  screen.uTime.value = time;
  screen.uSource.value = os.showsDoom ? 1 : 0;
  if (os.dirty) {
    c.osTexture.needsUpdate = true;
    os.dirty = false;
  }
  if (os.showsDoom && doom.frame && doom.frameVersion !== c.doomVersion) {
    c.doomVersion = doom.frameVersion;
    c.doomTexture.image.data = doom.frame;
    c.doomTexture.needsUpdate = true;
  }
  return c.power;
}

/** Off the vehicle: everything pauses and the screen goes dark. */
export function stopConsole() {
  const c = consoleParts;
  if (!c) return;
  if (c.os.mode !== "off") c.os.powerOff();
  c.power = 0;
}

/** The screen's light on the cabin: warm while DOOM runs, violet for the menu. */
export function consoleGlow(out: Color) {
  const c = getConsole();
  if (c.os.showsDoom) out.setRGB(2.4, 0.9, 0.6);
  else out.setRGB(1.4, 0.9, 2.6);
  return out.multiplyScalar(c.power);
}

/** Seconds since landing in the seat. */
export function secondsInSeat() {
  return (performance.now() - drive.arrivedAt) / 1000;
}

/* ------------------------------------------------------------------ */
/* Head-up display                                                     */
/* ------------------------------------------------------------------ */

/** Projected light: black is see-through, the readout glows (drawn on a canvas). */
export function createHudMaterial(texture: CanvasTexture, alwaysOnTop = false) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !alwaysOnTop,
    blending: AdditiveBlending,
    uniforms: { uMap: { value: texture }, uPower: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uPower;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(uMap, vUv).rgb * uPower * 1.15;
        col *= 0.85 + 0.15 * sin(vUv.y * 220.0);
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

/** A canvas and its texture, for readouts drawn a few times a second. */
export function createCanvasTexture(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, context: canvas.getContext("2d"), texture };
}

const fontCache = new Map<string, string>();
/** A font family from the site's CSS variables (for canvas text). */
export function hudFont(variable: string) {
  let value = fontCache.get(variable);
  if (!value) {
    const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    value = family ? `${family}, sans-serif` : "sans-serif";
    fontCache.set(variable, value);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Hooks for the cabins                                                */
/* ------------------------------------------------------------------ */

/**
 * Compiles a cabin's shaders right away (during the transport effect),
 * not on the first frame inside.
 */
export function usePrecompile(groupRef: RefObject<Group | null>, visibleNow: () => boolean) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = true;
    gl.compileAsync(group, camera, scene).catch(() => {});
    group.visible = visibleNow();
  }, [gl, camera, scene, groupRef, visibleNow]);
}

/** Clicking a vehicle's screen: finds where the pointer lands on it, in screen pixels. */
export function useScreenPick(vehicle: Vehicle, screenRef: RefObject<Mesh | null>) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    drive.picks[vehicle] = (x, y) => {
      const screen = screenRef.current;
      if (!screen || !drive.inside || drive.vehicle !== vehicle) return null;
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(screen, false)[0];
      if (!hit?.uv) return null;
      return { x: hit.uv.x * W, y: (1 - hit.uv.y) * H };
    };
    getCarOS().onExit = leaveRide;
    return () => {
      delete drive.picks[vehicle];
    };
  }, [vehicle, camera, screenRef]);
}
