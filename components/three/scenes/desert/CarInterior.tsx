"use client";

import { type RefObject, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
import { CAR_POSITION, carMotion, type CarMotion, SCREEN_CENTER } from "@/lib/car/cabin";
import { doom, DOOM_HEIGHT, DOOM_WIDTH } from "@/lib/car/doom";
import { H, W } from "@/lib/car/draw";
import { getCarOS } from "@/lib/car/os";
import { drive, leaveCar } from "@/lib/drive";
import { world } from "@/lib/world";
import { outputGLSL } from "../../glsl";
import { buildCabin, hudGeometry, screenGeometry, windshieldGeometry } from "./cabinGeometry";
import { createMirrorMaterial, mirrorGlassGeometry } from "./mirrors";
import { trafficData } from "./traffic";

/**
 * The inside of the car you hitch a ride in: dashboard, wheel, pillars,
 * and the console screen that runs NV-77 OS (and DOOM).
 * Only built the first time someone gets in.
 */

/** The screen lights up this long after landing in the seat (it boots while the head turns). */
const POWER_ON_DELAY = 2.4;

function createCabinMaterial() {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uAmbient: { value: new Color(0.42, 0.3, 0.62) },
      uSky: { value: new Color(2.6, 0.95, 1.7) },
      uScreenPos: { value: new Vector3() },
      uScreenGlow: { value: new Color(0, 0, 0) },
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
      uniform vec3 uSky;
      uniform vec3 uScreenPos;
      uniform vec3 uScreenGlow;
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
        } else {
          vec3 V = normalize(cameraPosition - vWorld);
          // Sunset light pouring in through the windshield, from ahead and above
          float top = max(n.y, 0.0);
          float ahead = max(dot(n, normalize(vec3(0.0, 0.35, -1.0))), 0.0);
          vec3 light = uAmbient + uSky * (top * 0.85 + ahead * 0.4);
          // Glow of the console screen
          vec3 toScreen = uScreenPos - vWorld;
          float d2 = max(dot(toScreen, toScreen), 1e-4);
          light += uScreenGlow * max(dot(n, toScreen * inversesqrt(d2)), 0.0) / (1.0 + d2 * 24.0);
          col = vColor * light;
          if (kind == 2) {
            // Glossy trim: a rim of sky color at grazing angles
            float f = pow(1.0 - max(dot(n, V), 0.0), 4.0);
            col += uSky * f * 0.06;
          }
        }
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

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

function createHudMaterial(texture: CanvasTexture) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
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
        // Projected light: black is see-through, the readout glows
        vec3 col = texture2D(uMap, vUv).rgb * uPower * 1.15;
        col *= 0.85 + 0.15 * sin(vUv.y * 220.0);
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

function createWindshieldMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uTint: { value: new Color("#3a0c3f") } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        // Tinted band at the top of the glass, and the dashboard's glow reflected at the bottom
        float band = smoothstep(0.8, 0.97, vUv.y);
        float reflection = (1.0 - smoothstep(0.0, 0.16, vUv.y)) * 0.1;
        float streak = smoothstep(0.035, 0.0, abs(vUv.x * 0.55 + vUv.y - 0.95)) * 0.035;
        vec3 col = uTint * band + vec3(0.6, 0.25, 0.7) * (reflection + streak);
        gl_FragColor = vec4(col, band * 0.7 + reflection + streak);
        ${outputGLSL}
      }
    `,
  });
}

/** Head-up display on the windshield: speed, autopilot and the time (drawn on black, shown additively). */
function drawHud(ctx: CanvasRenderingContext2D, speed: number, time: number) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  // Speed in the middle
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#7ff7ff";
  ctx.font = `700 58px ${hudFont("--font-tektur")}`;
  ctx.fillText(String(Math.round(speed)), w / 2, 76);
  ctx.font = `600 12px ${hudFont("--font-martian")}`;
  ctx.fillStyle = "#19c8d4";
  ctx.fillText("KM/H", w / 2, 96);

  // Lane markers either side, like a lane-keeping assistant
  ctx.strokeStyle = "#19c8d4";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(108, 100);
  ctx.lineTo(130, 40);
  ctx.moveTo(w - 108, 100);
  ctx.lineTo(w - 130, 40);
  ctx.stroke();

  // Autopilot and clock
  ctx.font = `700 12px ${hudFont("--font-martian")}`;
  ctx.textAlign = "left";
  ctx.fillStyle = Math.sin(time * 3) > -0.4 ? "#ff4f9a" : "#5a1a36";
  ctx.fillText("◆ AUTO", 14, 24);
  ctx.textAlign = "right";
  ctx.fillStyle = "#b07cff";
  const now = new Date();
  ctx.fillText(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, w - 14, 24);

  // Thin progress line: distance to the next neon gate
  const gate = (time * 0.18) % 1;
  ctx.fillStyle = "#3a1530";
  ctx.fillRect(14, h - 12, w - 28, 2);
  ctx.fillStyle = "#ff4f9a";
  ctx.fillRect(14, h - 12, (w - 28) * gate, 2);
}

const fontCache = new Map<string, string>();
function hudFont(variable: string) {
  let value = fontCache.get(variable);
  if (!value) {
    const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    value = family ? `${family}, sans-serif` : "sans-serif";
    fontCache.set(variable, value);
  }
  return value;
}

type CarParts = ReturnType<typeof createParts>;

function createParts(tier: "high" | "low") {
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

  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 384;
  hudCanvas.height = 128;
  const hudTexture = new CanvasTexture(hudCanvas);
  hudTexture.colorSpace = SRGBColorSpace;
  hudTexture.minFilter = LinearFilter;
  hudTexture.generateMipmaps = false;

  return {
    os,
    osTexture,
    doomTexture,
    hudContext: hudCanvas.getContext("2d"),
    hudTexture,
    cabin: buildCabin(),
    screen: screenGeometry(),
    hud: hudGeometry(),
    windshield: windshieldGeometry(),
    cabinMaterial: createCabinMaterial(),
    screenMaterial: createScreenMaterial(osTexture, doomTexture),
    hudMaterial: createHudMaterial(hudTexture),
    windshieldMaterial: createWindshieldMaterial(),
    mirrors: mirrorGlassGeometry(),
    mirrorMaterial: createMirrorMaterial(trafficData(tier === "high" ? 14 : 8)),
    /** Per-frame bookkeeping */
    hudIn: 0,
    power: 0,
    doomVersion: -1,
    motion: { y: 0, pitch: 0, roll: 0 } as CarMotion,
  };
}

// One car for the whole visit: built on the first ride, kept for the next ones
let parts: CarParts | null = null;
function carParts(tier: "high" | "low") {
  if (!parts) parts = createParts(tier);
  return parts;
}

function updateCar(group: Group, time: number, delta: number, travel: number) {
  const p = parts;
  if (!p) return;
  const os = p.os;
  group.visible = drive.inside;
  if (!drive.inside) {
    if (os.mode !== "off") os.powerOff();
    p.power = 0;
    return;
  }

  const dt = Math.min(delta, 0.1);
  const m = carMotion(time, world.reducedMotion, p.motion);
  group.position.set(CAR_POSITION.x, CAR_POSITION.y + m.y, CAR_POSITION.z);
  group.rotation.set(m.pitch, 0, m.roll);

  // Boot the console while the driver turns toward it
  const sinceArrival = (performance.now() - drive.arrivedAt) / 1000;
  if (os.mode === "off" && sinceArrival > POWER_ON_DELAY) os.powerOn();
  p.power = os.mode === "off" ? 0 : Math.min(1, p.power + dt / 0.45);
  os.speed = drive.speed;
  os.frame(dt);

  const screen = p.screenMaterial.uniforms;
  screen.uPower.value = p.power;
  screen.uTime.value = time;
  screen.uSource.value = os.showsDoom ? 1 : 0;
  if (os.dirty) {
    p.osTexture.needsUpdate = true;
    os.dirty = false;
  }
  if (os.showsDoom && doom.frame && doom.frameVersion !== p.doomVersion) {
    p.doomVersion = doom.frameVersion;
    p.doomTexture.image.data = doom.frame;
    p.doomTexture.needsUpdate = true;
  }

  // The screen lights up the cabin: warm for DOOM, violet for the menu
  const glow = p.cabinMaterial.uniforms.uScreenGlow.value as Color;
  if (os.showsDoom) glow.setRGB(2.4, 0.9, 0.6).multiplyScalar(p.power);
  else glow.setRGB(1.4, 0.9, 2.6).multiplyScalar(p.power);
  (p.cabinMaterial.uniforms.uScreenPos.value as Vector3).copy(SCREEN_CENTER).applyMatrix4(group.matrixWorld);

  // Mirrors: the road behind moves with the same travel as the road ahead
  const mirror = p.mirrorMaterial.uniforms;
  mirror.uTravel.value = travel;
  mirror.uTime.value = time;

  // Head-up display, a few times a second
  p.hudIn -= dt;
  if (p.hudIn <= 0 && p.hudContext) {
    p.hudIn = 0.12;
    drawHud(p.hudContext, drive.speed, time);
    p.hudTexture.needsUpdate = true;
  }
  p.hudMaterial.uniforms.uPower.value = Math.min(1, Math.max(0, (sinceArrival - 0.3) / 0.5));
}

export function CarInterior({ tier, travel }: { tier: "high" | "low"; travel: RefObject<number> }) {
  const groupRef = useRef<Group>(null);
  const screenRef = useRef<Mesh>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const p = carParts(tier);

  // Compile the car's shaders right away (during the transport effect),
  // not on the first frame inside the car
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = true;
    gl.compileAsync(group, camera, scene).catch(() => {});
    group.visible = drive.inside;
  }, [gl, camera, scene]);

  // Clicking the screen: find where the pointer lands on it
  useEffect(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    drive.pick = (x, y) => {
      const screen = screenRef.current;
      if (!screen || !drive.inside) return null;
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(screen, false)[0];
      if (!hit?.uv) return null;
      return { x: hit.uv.x * W, y: (1 - hit.uv.y) * H };
    };
    getCarOS().onExit = leaveCar;
    return () => {
      drive.pick = null;
    };
  }, [camera]);

  useFrame((state, delta) => {
    if (groupRef.current) updateCar(groupRef.current, state.clock.elapsedTime, delta, travel.current);
  });

  return (
    <group ref={groupRef} visible={false} position={CAR_POSITION.toArray()}>
      <mesh geometry={p.cabin} material={p.cabinMaterial} frustumCulled={false} />
      <mesh ref={screenRef} geometry={p.screen} material={p.screenMaterial} frustumCulled={false} />
      <mesh geometry={p.hud} material={p.hudMaterial} frustumCulled={false} renderOrder={3} />
      <mesh geometry={p.mirrors} material={p.mirrorMaterial} frustumCulled={false} />
      <mesh geometry={p.windshield} material={p.windshieldMaterial} frustumCulled={false} renderOrder={2} />
    </group>
  );
}
