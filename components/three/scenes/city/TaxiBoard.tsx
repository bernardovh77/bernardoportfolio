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
import { rideSigns } from "@/lib/rideSign";
import { THEMES } from "@/lib/themes";
import { world } from "@/lib/world";
import { fogGLSL, outputGLSL } from "../../glsl";
import { CJK_FONT_STACK, canRenderCJK, cssFontFamily, makeTexture, useActiveRef } from "../../shared";
import { KIND, PartBuilder } from "../../vehicle/builder";
import { cityFlow, type CityRide } from "./flow";

/**
 * SKY TAXI: a neon board hanging off a tower on the right of the avenue,
 * a bit different from its neighbors (bulbs chasing around its edge).
 * Point at it and it lights up; click it and a sky taxi picks you up.
 */

const P = THEMES.city.palette;
const taxiSign = rideSigns.ship;

export const BOARD_W = 2.3;
export const BOARD_H = 4.6;

/** Where the board hangs (picked from the city layout, see CityScene). */
export type BoardSpot = {
  /** Center of the board across the avenue */
  x: number;
  z: number;
  /** Height of the board's top edge */
  top: number;
  /** The tower's wall it is bolted to (|x|) */
  wall: number;
  /** The tower's block and height, so the board rides along with it */
  anchor: number;
  stack: number;
};

/** The board's face: a ship in a ring, SKY, and TAXI down the middle. */
function drawBoard(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const head = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
  ctx.fillStyle = "#04030a";
  ctx.fillRect(0, 0, w, h);

  const neon = (color: string, blur: number) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  };

  // Double tube frame
  ctx.save();
  neon(P.signal, 18);
  ctx.lineWidth = 10;
  ctx.strokeRect(34, 34, w - 68, h - 68);
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(52, 52, w - 104, h - 104);
  ctx.restore();

  // A ship (seen from above) inside a ring, engines glowing
  const cx = w / 2;
  const cy = 200;
  ctx.save();
  neon(P.a, 20);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(cx, cy, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e8fbff";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 86);
  ctx.lineTo(cx + 22, cy - 22);
  ctx.lineTo(cx + 78, cy + 34);
  ctx.lineTo(cx + 74, cy + 52);
  ctx.lineTo(cx + 24, cy + 40);
  ctx.lineTo(cx + 16, cy + 62);
  ctx.lineTo(cx - 16, cy + 62);
  ctx.lineTo(cx - 24, cy + 40);
  ctx.lineTo(cx - 74, cy + 52);
  ctx.lineTo(cx - 78, cy + 34);
  ctx.lineTo(cx - 22, cy - 22);
  ctx.closePath();
  ctx.fill();
  // Canopy
  ctx.fillStyle = "#06121a";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 18, 9, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  neon(P.b, 22);
  ctx.beginPath();
  ctx.arc(cx - 9, cy + 74, 9, 0, Math.PI * 2);
  ctx.arc(cx + 9, cy + 74, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // SKY across, TAXI down
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  neon(P.a, 16);
  ctx.font = `800 96px ${head}`;
  ctx.fillText("SKY", cx, 384);
  neon(P.signal, 22);
  ctx.font = `800 132px ${head}`;
  ["T", "A", "X", "I"].forEach((letter, i) => ctx.fillText(letter, cx, 512 + i * 118));
  ctx.restore();

  // Up, up: chevrons (or "sky" in Japanese when the fonts allow it)
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  neon(P.b, 18);
  if (canRenderCJK()) {
    ctx.font = `700 62px ${CJK_FONT_STACK}`;
    ctx.fillText("空タクシー", cx, 962);
  } else {
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    for (const dy of [0, 26]) {
      ctx.beginPath();
      ctx.moveTo(cx - 44, 984 - dy);
      ctx.lineTo(cx, 950 - dy);
      ctx.lineTo(cx + 44, 984 - dy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function createFaceMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const texture = makeTexture(canvas);
  const draw = () => {
    drawBoard(canvas);
    texture.needsUpdate = true;
  };
  draw();
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uMap: { value: texture },
      uHover: { value: 0 },
      uTime: { value: 0 },
      uChase: { value: 0 },
      uBulb: { value: new Color(P.signal).multiplyScalar(2.2) },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEMES.city.fogDensity },
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
      uniform float uTime;
      uniform float uChase;
      uniform vec3 uBulb;
      varying vec2 vUv;
      varying float vDist;
      ${fogGLSL}

      // Marquee bulbs around the edge, every third one lit, chasing around
      float bulbs(vec2 uv) {
        const vec2 size = vec2(${BOARD_W.toFixed(2)}, ${BOARD_H.toFixed(2)});
        const float inset = 0.085;
        const float spacing = 0.21;
        vec2 p = uv * size - inset;
        vec2 box = size - 2.0 * inset;
        // Position along the edge (counter-clockwise from the bottom left) and distance from it
        float dl = abs(p.x), dr = abs(p.x - box.x), db = abs(p.y), dt = abs(p.y - box.y);
        float s;
        float d;
        if (min(db, dt) < min(dl, dr)) {
          d = min(db, dt);
          s = db < dt ? clamp(p.x, 0.0, box.x) : 2.0 * box.x + box.y - clamp(p.x, 0.0, box.x);
        } else {
          d = min(dl, dr);
          s = dr < dl ? box.x + clamp(p.y, 0.0, box.y) : 2.0 * (box.x + box.y) - clamp(p.y, 0.0, box.y);
        }
        float k = floor(s / spacing + 0.5);
        float along = s - k * spacing;
        float dot = 1.0 - smoothstep(0.03, 0.055, length(vec2(along, d)));
        float lit = step(fract(k / 3.0 - uChase), 0.34);
        return dot * mix(0.12, 1.0, lit);
      }

      void main() {
        if (!gl_FrontFacing) {
          gl_FragColor = vec4(applyFog(vec3(0.02, 0.022, 0.035), vDist), 1.0);
          ${outputGLSL}
          return;
        }
        vec3 tex = texture2D(uMap, vUv).rgb;
        float pulse = 0.88 + 0.12 * sin(uTime * 2.4);
        float scan = 0.9 + 0.1 * sin(vUv.y * 420.0 - uTime * 6.0);
        vec3 col = tex * (2.5 + uHover * (1.4 + 0.3 * sin(uTime * 9.0))) * pulse * scan;
        col += uBulb * bulbs(vUv) * (1.0 + uHover * 0.8);
        col = applyFog(col, vDist);
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
    uniforms: { uHover: { value: 0 }, uColor: { value: new Color(P.signal) }, uEdge: { value: new Color(P.a) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHover;
      uniform vec3 uColor;
      uniform vec3 uEdge;
      varying vec2 vUv;
      void main() {
        vec2 q = abs(vUv - 0.5) * 2.0;
        float d = max(q.x, q.y * 0.96);
        float glow = smoothstep(1.0, 0.55, d);
        vec3 col = mix(uEdge, uColor, smoothstep(0.55, 0.9, d)) * glow * uHover * 1.3;
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}

function createFrameMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEMES.city.fogDensity },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aKind;
      varying vec3 vColor;
      varying float vKind;
      varying float vUp;
      varying float vDist;
      void main() {
        vColor = aColor;
        vKind = aKind;
        vUp = normalize(mat3(modelMatrix) * normal).y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vKind;
      varying float vUp;
      varying float vDist;
      ${fogGLSL}
      void main() {
        vec3 col = vKind > 0.5 ? vColor : vColor * (0.55 + abs(vUp) * 0.5);
        gl_FragColor = vec4(applyFog(col, vDist), 1.0);
        ${outputGLSL}
      }
    `,
  });
}

/** Brackets from the tower's wall to the board, in board space (x toward the wall). */
function buildFrame(gap: number) {
  const b = new PartBuilder();
  const edge = BOARD_W / 2;
  const wall = edge + gap;
  b.paint("#2a2f3f");
  for (const y of [BOARD_H / 2 - 0.3, -BOARD_H / 2 + 0.3]) {
    b.box(new Vector3((edge + wall) / 2 - 0.05, y, 0), wall - edge + 0.1, 0.09, 0.09);
    // Plate on the wall
    b.box(new Vector3(wall - 0.03, y, 0), 0.06, 0.34, 0.3);
  }
  // Thin edge around the board (its housing)
  b.paint("#11131c");
  b.box(new Vector3(0, BOARD_H / 2 + 0.04, -0.04), BOARD_W + 0.12, 0.08, 0.1);
  b.box(new Vector3(0, -BOARD_H / 2 - 0.04, -0.04), BOARD_W + 0.12, 0.08, 0.1);
  b.box(new Vector3(-edge - 0.04, 0, -0.04), 0.08, BOARD_H + 0.16, 0.1);
  b.box(new Vector3(edge + 0.04, 0, -0.04), 0.08, BOARD_H + 0.16, 0.1);
  // A cable hanging down to a junction box
  b.paint("#0c0e15").beam(new Vector3(wall - 0.08, -BOARD_H / 2 + 0.3, -0.12), new Vector3(wall - 0.06, -BOARD_H / 2 - 0.9, -0.12), 0.03);
  b.paint("#1d2130").box(new Vector3(wall - 0.08, -BOARD_H / 2 - 1.0, -0.12), 0.12, 0.2, 0.12);
  b.paint(P.b, KIND.neon, 2).box(new Vector3(wall - 0.14, -BOARD_H / 2 - 1.0, -0.12), 0.012, 0.05, 0.05);
  return b.build();
}

export function TaxiBoard({ active, ride, spot }: { active: boolean; ride: RefObject<CityRide>; spot: BoardSpot }) {
  const groupRef = useRef<Group>(null);
  const faceRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const activeRef = useActiveRef(active);
  const camera = useThree((state) => state.camera);
  const glow = useRef(0);
  const chase = useRef(0);
  const centerY = spot.top - BOARD_H / 2;

  const parts = useMemo(() => {
    const face = createFaceMaterial();
    return {
      faceGeometry: new PlaneGeometry(BOARD_W, BOARD_H),
      haloGeometry: new PlaneGeometry(BOARD_W + 1.6, BOARD_H + 1.6),
      frameGeometry: buildFrame(Math.max(0.15, spot.wall - (spot.x + BOARD_W / 2))),
      face,
      halo: createHaloMaterial(),
      frame: createFrameMaterial(),
    };
  }, [spot]);

  useEffect(() => {
    let cancelled = false;
    // Draw the face again once the site's fonts have loaded
    document.fonts?.ready.then(() => {
      if (!cancelled) parts.face.draw();
    });
    return () => {
      cancelled = true;
      parts.faceGeometry.dispose();
      parts.haloGeometry.dispose();
      parts.frameGeometry.dispose();
      parts.face.material.dispose();
      parts.face.texture.dispose();
      parts.halo.dispose();
      parts.frame.dispose();
    };
  }, [parts]);

  // Hit test for the page: does the pointer land on the board?
  useEffect(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const plane = new Plane();
    const normal = new Vector3();
    const point = new Vector3();
    taxiSign.pick = (x, y) => {
      const group = groupRef.current;
      if (!group || !activeRef.current || !group.visible) return false;
      group.updateMatrixWorld();
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      normal.set(0, 0, 1).transformDirection(group.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, point.setFromMatrixPosition(group.matrixWorld));
      if (!raycaster.ray.intersectPlane(plane, point)) return false;
      group.worldToLocal(point);
      // A little more generous than the board itself
      return Math.abs(point.x) < BOARD_W * 0.62 && Math.abs(point.y) < BOARD_H * 0.58;
    };
    return () => {
      taxiSign.pick = null;
    };
  }, [camera, activeRef]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (!activeRef.current) {
      if (taxiSign.hover) {
        taxiSign.hover = false;
        taxiSign.onHover?.(false);
      }
      return;
    }
    // Riding, the board flies past with its tower
    const r = ride.current;
    const flow = cityFlow(spot.anchor, r.travel, r.riding);
    group.position.set(spot.x, centerY - (1 - flow.rise) * (spot.stack + 2), spot.z + flow.shift);

    // Hover: only on the page, only when the pointer is not on a link or a button
    const hover =
      drive.phase === "off" && taxiSign.pointerFree && (taxiSign.pick?.(world.pointerX, world.pointerY) ?? false);
    if (hover !== taxiSign.hover) {
      taxiSign.hover = hover;
      taxiSign.onHover?.(hover);
    }
    const dt = Math.min(delta, 0.1);
    glow.current += ((hover ? 1 : 0) - glow.current) * (1 - Math.exp(-dt * 10));
    chase.current += dt * (world.reducedMotion ? 0 : 2.2 + glow.current * 4);

    const face = faceRef.current?.material as ShaderMaterial | undefined;
    if (face) {
      face.uniforms.uHover.value = glow.current;
      face.uniforms.uTime.value = state.clock.elapsedTime;
      face.uniforms.uChase.value = chase.current;
    }
    const halo = haloRef.current?.material as ShaderMaterial | undefined;
    if (halo) halo.uniforms.uHover.value = glow.current;
  });

  return (
    <group ref={groupRef} position={[spot.x, centerY, spot.z]}>
      <mesh geometry={parts.frameGeometry} material={parts.frame} />
      <mesh ref={haloRef} geometry={parts.haloGeometry} material={parts.halo} position={[0, 0, -0.08]} renderOrder={1} />
      <mesh ref={faceRef} geometry={parts.faceGeometry} material={parts.face.material} />
    </group>
  );
}
