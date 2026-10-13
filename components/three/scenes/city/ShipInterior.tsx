"use client";

import { type RefObject, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, DoubleSide, type Group, type Mesh, ShaderMaterial, Vector3 } from "three";
import { SHIP_CABIN, SHIP_EYE, SHIP_POSITION, SHIP_SCREEN_CENTER, SHIP_STICK_PIVOT } from "@/lib/car/ship";
import type { VehicleMotion } from "@/lib/car/cabin";
import { drive, ridingIn } from "@/lib/drive";
import { THEMES } from "@/lib/themes";
import { world } from "@/lib/world";
import { hashGLSL, outputGLSL } from "../../glsl";
import {
  consoleGlow,
  createCabinMaterial,
  createCanvasTexture,
  createHudMaterial,
  getConsole,
  hudFont,
  runConsole,
  secondsInSeat,
  stopConsole,
  usePrecompile,
  useScreenPick,
} from "../../vehicle/console";
import {
  auxGeometry,
  buildCockpit,
  buildStick,
  canopyGlassGeometry,
  shipHudGeometry,
  shipScreenGeometry,
} from "./cockpitGeometry";
import {
  buildFrame,
  createHitMaterial,
  createPhotoMaterial,
  FRAME_CENTER,
  FRAME_PHOTO,
  photoGeometry,
  useKeepsakePick,
} from "../../vehicle/keepsake";
import { cityFlow, type CityRide } from "./flow";
import { SKY_AHEAD, SKY_SPAN, skyTraffic } from "./skyLanes";

/**
 * The cockpit of the sky taxi: canopy, console, stick, the holographic HUD,
 * the radar and systems displays, a little photo frame on the dash, and the
 * console screen running NV-77 OS (and DOOM), the same one as in the desert car.
 * Only built the first time someone hails the taxi.
 */

const P = THEMES.city.palette;

/** A neon sign of the city, as far as the cockpit's lighting is concerned. */
export type CityLight = { x: number; y: number; z: number; color: string; anchor: number; stack: number };

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/** The canopy: faint reflections, a tint at grazing angles and raindrops racing back over it. */
function createGlassMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: 0 },
      uTintA: { value: new Color(P.a) },
      uTintB: { value: new Color(P.b) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      uniform vec3 uTintA;
      uniform vec3 uTintB;
      varying vec2 vUv;
      ${hashGLSL}
      void main() {
        // u: across the canopy (left sill to right sill), v: from the front to the back
        vec3 tint = mix(uTintA, uTintB, vUv.x);
        float graze = pow(abs(vUv.x - 0.5) * 2.0, 4.0);
        // Two soft diagonal reflections
        float d = vUv.x * 0.7 + vUv.y * 0.45;
        float streak = smoothstep(0.035, 0.0, abs(d - 0.6)) * 0.6 + smoothstep(0.012, 0.0, abs(d - 0.67)) * 0.4;

        // Raindrops: a few, sliding back with the airflow, each column at its own pace
        vec2 g = vec2(vUv.x * 64.0, vUv.y * 46.0);
        float column = floor(g.x);
        float pace = mix(0.5, 1.4, hash12(vec2(column, 3.7)));
        g.y -= uTime * pace * (1.2 + uWind * 0.2);
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float there = step(0.8, hash12(id + column * 0.37));
        vec2 offset = (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.5;
        float r = mix(0.06, 0.15, hash12(id + 9.3));
        // A bead of light, a little longer than wide, with a faint trail behind it
        vec2 q = (f - offset) * vec2(1.0, 0.65);
        float bead = smoothstep(r, r * 0.2, length(q - vec2(0.0, r * 0.25)));
        float trail = smoothstep(0.035, 0.0, abs(q.x)) * smoothstep(0.0, -0.4, q.y) * (1.0 - smoothstep(-0.4, -0.5, q.y)) * 0.25;
        float rain = there * (bead + trail);

        vec3 col = tint * (graze * 0.05 + streak * 0.035) + mix(vec3(0.7, 0.85, 1.0), tint, 0.5) * rain * 0.12;
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

/** The small displays: their canvas, lit, with scanlines. */
function createDisplayMaterial(texture: ReturnType<typeof createCanvasTexture>["texture"]) {
  return new ShaderMaterial({
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
        vec3 col = texture2D(uMap, vUv).rgb * uPower * 1.3;
        col *= 0.82 + 0.18 * sin(vUv.y * 300.0);
        col += vec3(0.006, 0.01, 0.016);
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/* Readouts                                                            */
/* ------------------------------------------------------------------ */

const HUD_CYAN = "#7ff7ff";
const HUD_DIM = "#1d8c96";
const HUD_YELLOW = "#ffe94a";
const HUD_MAGENTA = "#ff4fd8";

/** The holographic head-up display: reticle, speed, altitude, heading, autopilot. */
function drawHud(ctx: CanvasRenderingContext2D, speed: number, altitude: number, heading: number, time: number) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2 + 6;
  const mono = hudFont("--font-martian");
  const head = hudFont("--font-tektur");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";

  // Reticle
  ctx.strokeStyle = HUD_CYAN;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.moveTo(cx + dx * 31, cy + dy * 31);
    ctx.lineTo(cx + dx * 42, cy + dy * 42);
  }
  ctx.stroke();
  ctx.fillStyle = HUD_CYAN;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Corner brackets around the middle
  ctx.strokeStyle = HUD_DIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const x = cx + sx * 92;
    const y = cy + sy * 66;
    ctx.moveTo(x, y - sy * 16);
    ctx.lineTo(x, y);
    ctx.lineTo(x - sx * 16, y);
  }
  ctx.stroke();

  // Heading tape across the top
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 120, 6, 240, 44);
  ctx.clip();
  ctx.strokeStyle = HUD_DIM;
  ctx.fillStyle = HUD_CYAN;
  ctx.font = `600 13px ${mono}`;
  ctx.textAlign = "center";
  const pxPerDegree = 4;
  const start = Math.floor((heading - 32) / 5) * 5;
  ctx.beginPath();
  for (let deg = start; deg <= heading + 32; deg += 5) {
    const x = cx + (deg - heading) * pxPerDegree;
    const major = deg % 15 === 0;
    ctx.moveTo(x, 34);
    ctx.lineTo(x, major ? 22 : 28);
    if (major) {
      const value = ((deg % 360) + 360) % 360;
      const label = value === 0 ? "N" : value === 90 ? "E" : value === 180 ? "S" : value === 270 ? "W" : String(value).padStart(3, "0");
      ctx.fillText(label, x, 16);
    }
  }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = HUD_YELLOW;
  ctx.beginPath();
  ctx.moveTo(cx, 38);
  ctx.lineTo(cx - 6, 46);
  ctx.lineTo(cx + 6, 46);
  ctx.closePath();
  ctx.fill();

  // Speed on the left, altitude on the right
  const readout = (x: number, align: CanvasTextAlign, label: string, value: string, unit: string) => {
    ctx.textAlign = align;
    ctx.fillStyle = HUD_DIM;
    ctx.font = `700 12px ${mono}`;
    ctx.fillText(label, x, cy - 26);
    ctx.fillStyle = HUD_CYAN;
    ctx.font = `700 40px ${head}`;
    ctx.fillText(value, x, cy + 12);
    ctx.fillStyle = HUD_DIM;
    ctx.font = `600 11px ${mono}`;
    ctx.fillText(unit, x, cy + 30);
  };
  readout(cx - 112, "right", "SPD", String(Math.round(speed)), "KM/H");
  readout(cx + 112, "left", "ALT", String(Math.round(altitude)).padStart(3, "0"), "M");
  // Little ladders beside them
  ctx.strokeStyle = HUD_DIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    const y = cy + i * 12 + ((time * 18) % 12);
    ctx.moveTo(cx - 104, y);
    ctx.lineTo(cx - 98, y);
    const ya = cy + i * 12 - ((time * 2) % 12);
    ctx.moveTo(cx + 104, ya);
    ctx.lineTo(cx + 98, ya);
  }
  ctx.stroke();

  // Autopilot, blinking
  ctx.textAlign = "center";
  ctx.font = `700 13px ${mono}`;
  ctx.fillStyle = Math.sin(time * 3) > -0.4 ? HUD_MAGENTA : "#4a1640";
  ctx.fillText("◆", cx - 108, h - 14);
  ctx.fillStyle = HUD_YELLOW;
  ctx.fillText("AUTOPILOT · SKY LANE 7", cx + 8, h - 14);
}

/** Left: the radar with the traffic around you. Right: the ship's systems. */
function drawDisplays(ctx: CanvasRenderingContext2D, blips: Float32Array, blipCount: number, speed: number, time: number) {
  const mono = hudFont("--font-martian");
  ctx.fillStyle = "#020509";
  ctx.fillRect(0, 0, 512, 256);

  // Radar
  const cx = 128;
  const cy = 132;
  const radius = 104;
  ctx.strokeStyle = "rgba(25,243,255,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const r of [radius / 3, (radius * 2) / 3, radius]) {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
  // Sweep
  const sweep = (time * 1.6) % (Math.PI * 2);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(25,243,255,${0.16 * (1 - i / 10)})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, sweep - (i + 1) * 0.06, sweep - i * 0.06);
    ctx.closePath();
    ctx.fill();
  }
  // Blips (x across, z ahead), brightest right after the sweep passes them
  for (let i = 0; i < blipCount; i++) {
    const bx = blips[i * 3];
    const bz = blips[i * 3 + 1];
    const oncoming = blips[i * 3 + 2] < 0;
    const angle = Math.atan2(bz, bx);
    const since = (((sweep - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const alpha = 0.35 + 0.65 * Math.max(0, 1 - since / 2.2);
    ctx.fillStyle = oncoming ? `rgba(255,79,216,${alpha})` : `rgba(127,247,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(cx + bx, cy + bz, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // You
  ctx.fillStyle = HUD_YELLOW;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx - 6, cy + 6);
  ctx.lineTo(cx + 6, cy + 6);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 13px ${mono}`;
  ctx.textAlign = "left";
  ctx.fillStyle = HUD_CYAN;
  ctx.fillText("RADAR", 12, 20);
  ctx.textAlign = "right";
  ctx.fillStyle = HUD_DIM;
  ctx.fillText("150 M", 244, 20);

  // Systems
  const x0 = 276;
  ctx.textAlign = "left";
  ctx.fillStyle = HUD_YELLOW;
  ctx.font = `700 14px ${mono}`;
  ctx.fillText("SKY-77 · SYS", x0, 22);
  const bars: [string, number, string][] = [
    ["SHIELD", 0.92 + Math.sin(time * 0.7) * 0.02, "#19f3ff"],
    ["THRUST", Math.min(1, speed / 140) * (0.96 + Math.sin(time * 9) * 0.04), "#ff4fd8"],
    ["HULL", 1, "#ffe94a"],
    ["CELLS", 0.68 + Math.sin(time * 0.05) * 0.04, "#ffa03a"],
  ];
  bars.forEach(([label, value, color], i) => {
    const y = 46 + i * 34;
    ctx.fillStyle = HUD_DIM;
    ctx.font = `700 12px ${mono}`;
    ctx.fillText(label, x0, y + 9);
    ctx.fillStyle = "rgba(127,247,255,0.12)";
    ctx.fillRect(x0 + 72, y, 150, 11);
    ctx.fillStyle = color;
    ctx.fillRect(x0 + 72, y, 150 * Math.max(0, Math.min(1, value)), 11);
  });
  // Engine trace
  ctx.strokeStyle = HUD_CYAN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = x0 + i * 3.7;
    const y = 222 + Math.sin(i * 0.5 + time * 7) * 9 * Math.sin(i * 0.11 + time) + Math.sin(i * 1.7 + time * 13) * 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Parts                                                               */
/* ------------------------------------------------------------------ */

const inShip = () => ridingIn("ship");

/** A little photo frame stands on the right of the dash, turned toward the pilot and leaning back. */
const FRAME_SPOT = new Vector3(0.5, 0.909, -0.53);
const FRAME_YAW = Math.atan2(SHIP_EYE.x - FRAME_SPOT.x, SHIP_EYE.z - FRAME_SPOT.z);

function createParts(tier: "high" | "low") {
  const hud = createCanvasTexture(512, 256);
  const displays = createCanvasTexture(512, 256);
  const traffic = skyTraffic(tier).all;
  return {
    cockpit: buildCockpit(),
    frame: buildFrame(),
    photo: photoGeometry(FRAME_PHOTO),
    photoMaterial: createPhotoMaterial(),
    frameHit: photoGeometry(0.12),
    hitMaterial: createHitMaterial(),
    stick: buildStick(),
    screen: shipScreenGeometry(),
    aux: auxGeometry(),
    hud: shipHudGeometry(),
    glass: canopyGlassGeometry(),
    cabinMaterial: createCabinMaterial({
      ambient: new Color(0.1, 0.11, 0.2),
      // The city's haze above, its streets below, the avenue's glow ahead
      top: new Color(0.24, 0.17, 0.4),
      bottom: new Color(0.3, 0.12, 0.32),
      front: new Color(0.22, 0.3, 0.55),
      frontDir: new Vector3(0, 0.25, -1),
      left: new Color(),
      right: new Color(),
      rim: new Color(0.7, 0.55, 1.1),
      reflect: {
        strength: 0.45,
        low: new Color(0.16, 0.05, 0.16),
        high: new Color(0.05, 0.05, 0.14),
        neonA: new Color(P.a).multiplyScalar(0.45),
        neonB: new Color(P.b).multiplyScalar(0.45),
      },
    }),
    hudMaterial: createHudMaterial(hud.texture, true),
    displayMaterial: createDisplayMaterial(displays.texture),
    glassMaterial: createGlassMaterial(),
    hudCanvas: hud,
    displayCanvas: displays,
    traffic,
    blips: new Float32Array(traffic.count * 3),
    /** Per-frame bookkeeping */
    drawIn: 0,
    motion: { x: 0, y: 0, pitch: 0, yaw: 0, roll: 0 } as VehicleMotion,
    lights: [] as { x: number; y: number; z: number; color: Color; anchor: number; stack: number }[],
  };
}

// One ship for the whole visit: built on the first ride, kept for the next ones
let parts: ReturnType<typeof createParts> | null = null;
function shipParts(tier: "high" | "low", lights: CityLight[]) {
  if (!parts) {
    parts = createParts(tier);
    parts.lights = lights.map((l) => ({ ...l, color: new Color(l.color) }));
  }
  return parts;
}

const BASE_LEFT = new Color(0.03, 0.09, 0.14);
const BASE_RIGHT = new Color(0.12, 0.03, 0.12);

/** Neon signs passing by light up the cockpit from their side, in their color. */
function cityLights(p: NonNullable<typeof parts>, ride: CityRide, left: Color, right: Color) {
  left.copy(BASE_LEFT);
  right.copy(BASE_RIGHT);
  for (const light of p.lights) {
    const flow = cityFlow(light.anchor, ride.travel, ride.riding);
    const dz = light.z + flow.shift - SHIP_POSITION.z;
    if (dz < -30 || dz > 40) continue;
    const dx = light.x - SHIP_POSITION.x;
    const dy = light.y - (1 - flow.rise) * (light.stack + 2) - SHIP_POSITION.y;
    // Strongest right beside the ship, a little ahead
    const weight = Math.exp(-((dz + 3) * (dz + 3)) / 110) / (1 + (dx * dx + dy * dy) / 36);
    const target = dx < 0 ? left : right;
    target.r += light.color.r * weight * 1.3;
    target.g += light.color.g * weight * 1.3;
    target.b += light.color.b * weight * 1.3;
  }
}

/** Where the traffic is on the radar (same placement as the ships' shader). */
function radarBlips(p: NonNullable<typeof parts>, ride: CityRide, time: number) {
  const { lanes, looks, count } = p.traffic;
  const scale = 104 / 150;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = lanes[i * 4];
    const speed = lanes[i * 4 + 2];
    const phase = lanes[i * 4 + 3];
    if (Math.abs(x) > 12) continue;
    let dz: number;
    if (speed === 0) {
      dz = -(phase + Math.sin(time * 0.21 + looks[i * 4 + 3] * 9) * 2.5);
    } else {
      const offset = (((phase + ride.travel - speed * time) % SKY_SPAN) + SKY_SPAN) % SKY_SPAN;
      dz = offset - SKY_AHEAD;
    }
    const dx = x - SHIP_POSITION.x;
    if (dx * dx + dz * dz > 150 * 150) continue;
    p.blips[n * 3] = dx * scale;
    p.blips[n * 3 + 1] = dz * scale;
    p.blips[n * 3 + 2] = speed;
    n++;
  }
  return n;
}

function updateShip(group: Group, stick: Group | null, ride: CityRide, time: number, delta: number) {
  const p = parts;
  if (!p) return;
  group.visible = inShip();
  if (!drive.inside) {
    stopConsole();
    return;
  }
  if (!group.visible) return;

  const dt = Math.min(delta, 0.1);
  const m = SHIP_CABIN.motion(time, world.reducedMotion, p.motion);
  group.position.set(SHIP_POSITION.x + m.x, SHIP_POSITION.y + m.y, SHIP_POSITION.z);
  group.rotation.set(m.pitch, m.yaw, m.roll);
  // The pilot's hand follows the ship's moves
  if (stick) stick.rotation.set(-m.pitch * 5 - 0.04, 0, m.roll * 3.5);

  // Boot the console while the pilot turns toward it
  const power = runConsole(dt, time);

  const cabin = p.cabinMaterial.uniforms;
  consoleGlow(cabin.uScreenGlow.value as Color);
  (cabin.uScreenPos.value as Vector3).copy(SHIP_SCREEN_CENTER).applyMatrix4(group.matrixWorld);
  cabin.uTime.value = time;
  cabin.uFlow.value = ride.travel;
  cityLights(p, ride, cabin.uLeft.value as Color, cabin.uRight.value as Color);

  p.glassMaterial.uniforms.uTime.value = time;
  p.glassMaterial.uniforms.uWind.value = ride.speed;

  // Head-up display and the small displays, a few times a second
  p.drawIn -= dt;
  if (p.drawIn <= 0) {
    p.drawIn = 0.11;
    const altitude = SHIP_POSITION.y + m.y;
    if (p.hudCanvas.context) {
      drawHud(p.hudCanvas.context, drive.speed, altitude, -m.yaw * 57.3 * 8, time);
      p.hudCanvas.texture.needsUpdate = true;
    }
    if (p.displayCanvas.context) {
      drawDisplays(p.displayCanvas.context, p.blips, radarBlips(p, ride, time), drive.speed, time);
      p.displayCanvas.texture.needsUpdate = true;
    }
  }
  p.hudMaterial.uniforms.uPower.value = Math.min(1, Math.max(0, (secondsInSeat() - 0.3) / 0.6));
  p.displayMaterial.uniforms.uPower.value = Math.max(power, Math.min(1, Math.max(0, (secondsInSeat() - 1.2) / 0.5)));
}

export function ShipInterior({
  tier,
  ride,
  lights,
}: {
  tier: "high" | "low";
  ride: RefObject<CityRide>;
  lights: CityLight[];
}) {
  const groupRef = useRef<Group>(null);
  const stickRef = useRef<Group>(null);
  const frameRef = useRef<Group>(null);
  const screenRef = useRef<Mesh>(null);
  const p = shipParts(tier, lights);
  const screenMaterial = getConsole().screenMaterial;

  usePrecompile(groupRef, inShip);
  useScreenPick("ship", screenRef);
  useKeepsakePick("ship", frameRef);

  useFrame((state, delta) => {
    if (groupRef.current) updateShip(groupRef.current, stickRef.current, ride.current, state.clock.elapsedTime, delta);
  });

  return (
    <group ref={groupRef} visible={false} position={SHIP_POSITION.toArray()}>
      <mesh geometry={p.cockpit} material={p.cabinMaterial} frustumCulled={false} />
      <group ref={frameRef} position={FRAME_SPOT.toArray()} rotation={[-0.2, FRAME_YAW, 0, "YXZ"]}>
        <mesh geometry={p.frame} material={p.cabinMaterial} frustumCulled={false} />
        <mesh geometry={p.photo} material={p.photoMaterial} position={[0, FRAME_CENTER.y, 0.0022]} frustumCulled={false} />
        <mesh geometry={p.frameHit} material={p.hitMaterial} position={[0, FRAME_CENTER.y, 0.004]} />
      </group>
      <group ref={stickRef} position={SHIP_STICK_PIVOT.toArray()}>
        <mesh geometry={p.stick} material={p.cabinMaterial} frustumCulled={false} />
      </group>
      <mesh ref={screenRef} geometry={p.screen} material={screenMaterial} frustumCulled={false} />
      <mesh geometry={p.aux} material={p.displayMaterial} frustumCulled={false} />
      <mesh geometry={p.glass} material={p.glassMaterial} frustumCulled={false} renderOrder={2} />
      <mesh geometry={p.hud} material={p.hudMaterial} frustumCulled={false} renderOrder={4} />
    </group>
  );
}
