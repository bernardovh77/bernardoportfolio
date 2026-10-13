"use client";

import { type RefObject, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, type Group, type Mesh, ShaderMaterial, Vector3 } from "three";
import { CAR_CABIN, CAR_POSITION, SCREEN_CENTER, type VehicleMotion } from "@/lib/car/cabin";
import { drive, ridingIn } from "@/lib/drive";
import { world } from "@/lib/world";
import { outputGLSL } from "../../glsl";
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
import { buildCabin, hudGeometry, screenGeometry, windshieldGeometry } from "./cabinGeometry";
import { createMirrorMaterial, mirrorGlassGeometry } from "./mirrors";
import { trafficData } from "./traffic";

/**
 * The inside of the car you hitch a ride in: dashboard, wheel, pillars,
 * and the console screen that runs NV-77 OS (and DOOM).
 * Only built the first time someone gets in.
 */

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

type CarParts = ReturnType<typeof createParts>;

function createParts(tier: "high" | "low") {
  const hud = createCanvasTexture(384, 128);
  // Sunset light pouring in through the windshield, from ahead and above
  const sky = new Color(2.6, 0.95, 1.7);
  return {
    hudContext: hud.context,
    hudTexture: hud.texture,
    cabin: buildCabin(),
    screen: screenGeometry(),
    hud: hudGeometry(),
    windshield: windshieldGeometry(),
    cabinMaterial: createCabinMaterial({
      ambient: new Color(0.42, 0.3, 0.62),
      top: sky.clone().multiplyScalar(0.85),
      front: sky.clone().multiplyScalar(0.4),
      frontDir: new Vector3(0, 0.35, -1),
      rim: sky,
    }),
    hudMaterial: createHudMaterial(hud.texture),
    windshieldMaterial: createWindshieldMaterial(),
    mirrors: mirrorGlassGeometry(),
    mirrorMaterial: createMirrorMaterial(trafficData(tier === "high" ? 14 : 8)),
    /** Per-frame bookkeeping */
    hudIn: 0,
    motion: { x: 0, y: 0, pitch: 0, yaw: 0, roll: 0 } as VehicleMotion,
  };
}

// One car for the whole visit: built on the first ride, kept for the next ones
let parts: CarParts | null = null;
function carParts(tier: "high" | "low") {
  if (!parts) parts = createParts(tier);
  return parts;
}

const inCar = () => ridingIn("car");

function updateCar(group: Group, time: number, delta: number, travel: number) {
  const p = parts;
  if (!p) return;
  group.visible = inCar();
  if (!drive.inside) {
    stopConsole();
    return;
  }
  if (!group.visible) return;

  const dt = Math.min(delta, 0.1);
  const m = CAR_CABIN.motion(time, world.reducedMotion, p.motion);
  group.position.set(CAR_POSITION.x + m.x, CAR_POSITION.y + m.y, CAR_POSITION.z);
  group.rotation.set(m.pitch, m.yaw, m.roll);

  // Boot the console while the driver turns toward it
  runConsole(dt, time);

  // The screen lights up the cabin
  consoleGlow(p.cabinMaterial.uniforms.uScreenGlow.value as Color);
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
  p.hudMaterial.uniforms.uPower.value = Math.min(1, Math.max(0, (secondsInSeat() - 0.3) / 0.5));
}

export function CarInterior({ tier, travel }: { tier: "high" | "low"; travel: RefObject<number> }) {
  const groupRef = useRef<Group>(null);
  const screenRef = useRef<Mesh>(null);
  const p = carParts(tier);
  const screenMaterial = getConsole().screenMaterial;

  usePrecompile(groupRef, inCar);
  useScreenPick("car", screenRef);

  useFrame((state, delta) => {
    if (groupRef.current) updateCar(groupRef.current, state.clock.elapsedTime, delta, travel.current);
  });

  return (
    <group ref={groupRef} visible={false} position={CAR_POSITION.toArray()}>
      <mesh geometry={p.cabin} material={p.cabinMaterial} frustumCulled={false} />
      <mesh ref={screenRef} geometry={p.screen} material={screenMaterial} frustumCulled={false} />
      <mesh geometry={p.hud} material={p.hudMaterial} frustumCulled={false} renderOrder={3} />
      <mesh geometry={p.mirrors} material={p.mirrorMaterial} frustumCulled={false} />
      <mesh geometry={p.windshield} material={p.windshieldMaterial} frustumCulled={false} renderOrder={2} />
    </group>
  );
}
