"use client";

import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  Plane,
  PlaneGeometry,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import { drive } from "@/lib/drive";
import { exitSign } from "@/lib/exitSign";
import { THEMES } from "@/lib/themes";
import { world } from "@/lib/world";
import { fogGLSL, outputGLSL } from "../../glsl";
import { cssFontFamily, makeTexture, useActiveRef } from "../../shared";
import { KIND, PartBuilder } from "./builder";

/**
 * EXIT 77: a highway sign on the right shoulder that keeps coming by with the traffic.
 * Hover it and it lights up; click it and you are in one of the cars.
 */

const P = THEMES.desert.palette;
/** Right shoulder, just outside the neon gates */
const SIGN_X = 10.7;
/** One sign every this many units of road (about every 17 s from the page) */
const SPAN = 300;
/** Where it starts, so the first one shows up soon after the page opens */
const PHASE = 175;
const PANEL_W = 4.4;
const PANEL_H = 2.2;
const PANEL_Y = 4.7;
const YAW = -0.2;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The sign face: an EXIT 77 tab on top, a car and an arrow on the green panel. */
function drawSign(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const head = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const green = ctx.createLinearGradient(0, 100, 0, 512);
  green.addColorStop(0, "#15653f");
  green.addColorStop(1, "#0b412b");

  // Exit tab
  roundRect(ctx, 312, 10, 400, 124, 24);
  ctx.fillStyle = "#11573a";
  ctx.fill();
  roundRect(ctx, 324, 22, 376, 100, 16);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f4fff8";
  ctx.stroke();
  ctx.fillStyle = "#f4fff8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 70px ${head}`;
  ctx.fillText("EXIT 77", 512, 75);

  // Main panel
  roundRect(ctx, 8, 112, 1008, 392, 36);
  ctx.fillStyle = green;
  ctx.fill();
  roundRect(ctx, 26, 130, 972, 356, 24);
  ctx.lineWidth = 12;
  ctx.stroke();

  // Car, side view
  ctx.fillStyle = "#f4fff8";
  ctx.beginPath();
  ctx.moveTo(118, 372);
  ctx.lineTo(126, 330);
  ctx.lineTo(214, 306);
  ctx.lineTo(292, 246);
  ctx.lineTo(430, 242);
  ctx.lineTo(498, 300);
  ctx.lineTo(560, 314);
  ctx.lineTo(568, 372);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0f5a3a";
  ctx.beginPath();
  ctx.moveTo(306, 262);
  ctx.lineTo(352, 262);
  ctx.lineTo(352, 300);
  ctx.lineTo(258, 300);
  ctx.closePath();
  ctx.moveTo(372, 262);
  ctx.lineTo(422, 262);
  ctx.lineTo(466, 300);
  ctx.lineTo(372, 300);
  ctx.closePath();
  ctx.fill();
  for (const x of [212, 470]) {
    ctx.fillStyle = "#f4fff8";
    ctx.beginPath();
    ctx.arc(x, 376, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0e5137";
    ctx.beginPath();
    ctx.arc(x, 376, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arrow up and to the right: take the exit
  ctx.strokeStyle = "#f4fff8";
  ctx.lineWidth = 46;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(668, 420);
  ctx.lineTo(860, 228);
  ctx.stroke();
  ctx.fillStyle = "#f4fff8";
  ctx.beginPath();
  ctx.moveTo(906, 182);
  ctx.lineTo(906, 330);
  ctx.lineTo(758, 182);
  ctx.closePath();
  ctx.fill();

  ctx.font = `700 40px ${head}`;
  ctx.fillText("NV-77", 344, 456);
}

function createPanelMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const texture = makeTexture(canvas);
  const draw = () => {
    drawSign(canvas);
    texture.needsUpdate = true;
  };
  draw();
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uMap: { value: texture },
      uHover: { value: 0 },
      uFade: { value: 1 },
      uTime: { value: 0 },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEMES.desert.fogDensity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uHover;
      uniform float uFade;
      uniform float uTime;
      varying vec2 vUv;
      varying float vDist;
      ${fogGLSL}
      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.5) discard;
        // Retroreflective paint: bright even at dusk, brighter when you point at it
        vec3 col = gl_FrontFacing ? tex.rgb * (1.25 + uHover * (0.55 + 0.25 * sin(uTime * 7.0))) : vec3(0.03, 0.035, 0.04);
        col = applyFog(col, vDist);
        col = mix(uFogColor, col, uFade);
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
  return { material, texture, draw };
}

function createHaloMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uHover: { value: 0 }, uFade: { value: 1 }, uColor: { value: new Color(P.a) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHover;
      uniform float uFade;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 q = abs(vUv - 0.5) * 2.0;
        float d = max(q.x * 0.92, q.y);
        float glow = smoothstep(1.0, 0.62, d) * 0.9;
        vec3 col = uColor * glow * uHover * uFade * 1.6;
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

function createFrameMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uFade: { value: 1 },
      uTime: { value: 0 },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEMES.desert.fogDensity },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aKind;
      varying vec3 vColor;
      varying float vKind;
      varying float vUp;
      varying float vDist;
      varying float vSide;
      void main() {
        vColor = aColor;
        vKind = aKind;
        vSide = position.x;
        vUp = normalize(mat3(modelMatrix) * normal).y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      uniform float uTime;
      varying vec3 vColor;
      varying float vKind;
      varying float vUp;
      varying float vDist;
      varying float vSide;
      ${fogGLSL}
      void main() {
        vec3 col = vKind > 0.5 && vKind < 1.5 ? vColor : vColor * (0.6 + max(vUp, 0.0) * 0.8);
        if (vKind > 2.5) {
          // Beacon: on, off, on, the left one and the right one taking turns
          float on = step(0.0, sin(uTime * 5.0 + (vSide > 0.0 ? 3.14159 : 0.0)));
          col = vColor * (0.12 + on * 3.2);
        }
        col = applyFog(col, vDist);
        col = mix(uFogColor, col, uFade);
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

/** Posts, the lamp bar under the panel and a neon strip, in sign space. */
function buildFrame() {
  const b = new PartBuilder();
  b.paint("#2b2536");
  for (const x of [-1.4, 1.4]) b.box(new Vector3(x, 1.86, -0.1), 0.17, 3.72, 0.17);
  b.box(new Vector3(0, 3.62, -0.1), 3.2, 0.12, 0.12);
  // Lamps that light the sign at night, on short arms in front of it
  b.paint("#1c1824");
  b.box(new Vector3(0, 3.42, 0.32), 3.4, 0.08, 0.1);
  for (const x of [-1.1, 0, 1.1]) {
    b.paint("#1c1824").box(new Vector3(x, 3.5, 0.12), 0.06, 0.06, 0.4);
    b.paint("#fff3dc", KIND.neon, 2.4).box(new Vector3(x, 3.48, 0.36), 0.22, 0.05, 0.08);
  }
  // Two amber beacons on top, blinking in turn so the sign catches the eye
  for (const x of [-1.95, 1.95]) {
    b.paint("#1c1824").box(new Vector3(x, PANEL_Y + PANEL_H / 2 + 0.06, 0), 0.16, 0.12, 0.16);
    b.paint("#ffb030", 3).box(new Vector3(x, PANEL_Y + PANEL_H / 2 + 0.18, 0), 0.14, 0.12, 0.14);
  }
  // A thin neon line under the panel, because this is the Synth Desert
  b.paint("#ff3f8e", KIND.neon, 2.6).box(new Vector3(0, PANEL_Y - PANEL_H / 2 + 0.03, 0.02), PANEL_W - 0.3, 0.035, 0.03);
  return b.build();
}

export function ExitSign({ active, travel }: { active: boolean; travel: RefObject<number> }) {
  const groupRef = useRef<Group>(null);
  const panelRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const frameRef = useRef<Mesh>(null);
  const activeRef = useActiveRef(active);
  const camera = useThree((state) => state.camera);
  const glow = useRef(0);

  const parts = useMemo(() => {
    const panel = createPanelMaterial();
    return {
      panelGeometry: new PlaneGeometry(PANEL_W, PANEL_H),
      haloGeometry: new PlaneGeometry(PANEL_W + 1.4, PANEL_H + 1.2),
      frameGeometry: buildFrame(),
      panel,
      halo: createHaloMaterial(),
      frame: createFrameMaterial(),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Draw the face again once the site's fonts have loaded
    document.fonts?.ready.then(() => {
      if (!cancelled) parts.panel.draw();
    });
    return () => {
      cancelled = true;
      parts.panelGeometry.dispose();
      parts.haloGeometry.dispose();
      parts.frameGeometry.dispose();
      parts.panel.material.dispose();
      parts.panel.texture.dispose();
      parts.halo.dispose();
      parts.frame.dispose();
    };
  }, [parts]);

  // Hit test for the page: does the pointer land on the sign?
  useEffect(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const plane = new Plane();
    const normal = new Vector3();
    const point = new Vector3();
    exitSign.pick = (x, y) => {
      const group = groupRef.current;
      if (!group || !activeRef.current || !group.visible) return false;
      group.updateMatrixWorld();
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      normal.set(0, 0, 1).transformDirection(group.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, point.set(0, PANEL_Y, 0).applyMatrix4(group.matrixWorld));
      if (!raycaster.ray.intersectPlane(plane, point)) return false;
      group.worldToLocal(point);
      // A little more generous than the panel itself: it is a moving target
      return Math.abs(point.x) < PANEL_W * 0.62 && Math.abs(point.y - PANEL_Y) < PANEL_H * 0.7;
    };
    return () => {
      exitSign.pick = null;
    };
  }, [camera, activeRef]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (!activeRef.current) {
      if (exitSign.hover) {
        exitSign.hover = false;
        exitSign.onHover?.(false);
      }
      return;
    }
    const offset = (((PHASE + travel.current) % SPAN) + SPAN) % SPAN;
    const z = 30 - SPAN + offset;
    group.position.set(SIGN_X, 0, z);
    const fade = Math.min(1, Math.max(0, (z + 270) / 80));

    // Hover: only on the page (not in the car), only when the pointer is not on a link or button
    const hover =
      drive.phase === "off" && exitSign.pointerFree && fade > 0.5 && (exitSign.pick?.(world.pointerX, world.pointerY) ?? false);
    if (hover !== exitSign.hover) {
      exitSign.hover = hover;
      exitSign.onHover?.(hover);
    }
    glow.current += ((hover ? 1 : 0) - glow.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 10));

    const panel = panelRef.current?.material as ShaderMaterial | undefined;
    if (panel) {
      panel.uniforms.uHover.value = glow.current;
      panel.uniforms.uFade.value = fade;
      panel.uniforms.uTime.value = state.clock.elapsedTime;
    }
    const halo = haloRef.current?.material as ShaderMaterial | undefined;
    if (halo) {
      halo.uniforms.uHover.value = glow.current;
      halo.uniforms.uFade.value = fade;
    }
    const frame = frameRef.current?.material as ShaderMaterial | undefined;
    if (frame) {
      frame.uniforms.uFade.value = fade;
      frame.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group ref={groupRef} rotation={[0, YAW, 0]} position={[SIGN_X, 0, -200]}>
      <mesh ref={frameRef} geometry={parts.frameGeometry} material={parts.frame} />
      <mesh
        ref={haloRef}
        geometry={parts.haloGeometry}
        material={parts.halo}
        position={[0, PANEL_Y, -0.06]}
        renderOrder={1}
      />
      <mesh ref={panelRef} geometry={parts.panelGeometry} material={parts.panel.material} position={[0, PANEL_Y, 0]} />
    </group>
  );
}
