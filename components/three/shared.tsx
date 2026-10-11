"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  type ShaderMaterial,
  SRGBColorSpace,
} from "three";
import { createRandom } from "@/lib/random";
import { hashGLSL, outputGLSL } from "./glsl";

export type SceneProps = {
  active: boolean;
  tier: "high" | "low";
};

/** Keeps the latest `active` flag in a ref so frame callbacks can read it cheaply. */
export function useActiveRef(active: boolean) {
  const ref = useRef(active);
  useEffect(() => {
    ref.current = active;
  }, [active]);
  return ref;
}

/* ------------------------------------------------------------------ */
/* Text rendering helpers for canvas textures                          */
/* ------------------------------------------------------------------ */

let cjkCache: boolean | null = null;

/**
 * Checks whether the visitor has a font that can draw Japanese characters.
 * If not, signs and code rain fall back to Latin characters instead of boxes.
 */
export function canRenderCJK(): boolean {
  if (cjkCache !== null) return cjkCache;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return (cjkCache = false);
    ctx.font = `32px ${CJK_FONT_STACK}`;
    const missing = ctx.measureText("￿").width;
    const glyph = ctx.measureText("未").width;
    const kana = ctx.measureText("コ").width;
    cjkCache = glyph > 0 && Math.abs(glyph - missing) > 0.5 && Math.abs(kana - missing) > 0.5;
  } catch {
    cjkCache = false;
  }
  return cjkCache;
}

export const CJK_FONT_STACK =
  '"Yu Gothic", "YuGothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP", "Meiryo", sans-serif';

/** Reads a font-family list that next/font exposes as a CSS variable. */
export function cssFontFamily(variable: string, fallback: string) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return value ? `${value}, ${fallback}` : fallback;
  } catch {
    return fallback;
  }
}

export function makeTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export type CanvasAtlas = {
  texture: CanvasTexture;
  /** Draws the atlas again (call it once web fonts finish loading). */
  redraw: () => void;
};

/**
 * Builds one texture holding every neon sign of the city.
 * Top half: 8 vertical signs (128x512). Bottom half: 8 horizontal signs (512x128).
 * Glyphs are drawn white; the shader tints each sign with its own color.
 */
export function createSignAtlas(): CanvasAtlas {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);

    const cjk = canRenderCJK();
    const latin = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
    const vertical = cjk
      ? ["未来都市", "電脳", "サイバー", "コード", "夜光", "ネオン", "接続中", "開発者"]
      : ["NEON", "CODE", "OPEN", "DEV", "SYNC", "NODE", "LIVE", "BYTE"];
    const horizontal = [
      "BERNARDO",
      "FULLSTACK",
      "NEXT.JS",
      "OPEN 24/7",
      "DEV MODE",
      "SYS ONLINE",
      "HELLO WORLD",
      "TYPESCRIPT",
    ];

    const drawFrame = (x: number, y: number, w: number, h: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 6;
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = 10;
      ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.strokeRect(x + 20, y + 20, w - 40, h - 40);
      ctx.restore();
    };

    for (let i = 0; i < 8; i++) {
      const x = i * 128;
      drawFrame(x, 0, 128, 512);
      const chars = Array.from(vertical[i]);
      const step = Math.min(96, 440 / chars.length);
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.floor(step * 0.82)}px ${cjk ? CJK_FONT_STACK : latin}`;
      const startY = 256 - (step * (chars.length - 1)) / 2;
      chars.forEach((char, c) => ctx.fillText(char, x + 64, startY + c * step));
      ctx.restore();
    }

    for (let i = 0; i < 8; i++) {
      const x = (i % 2) * 512;
      const y = 512 + Math.floor(i / 2) * 128;
      drawFrame(x, y, 512, 128);
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 16;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let fontSize = 64;
      ctx.font = `800 ${fontSize}px ${latin}`;
      while (ctx.measureText(horizontal[i]).width > 440 && fontSize > 20) {
        fontSize -= 2;
        ctx.font = `800 ${fontSize}px ${latin}`;
      }
      ctx.fillText(horizontal[i], x + 256, y + 66);
      ctx.restore();
    }
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}

/** An 8x8 grid of glyphs used by the code-rain pillars in the ocean. */
export function createGlyphAtlas(): CanvasAtlas {
  const size = 512;
  const cell = size / 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    const cjk = canRenderCJK();
    const pool = cjk
      ? "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ0123456789<>{}=+*"
      : "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>{}[]=+*/#$%&@!?;:~^";
    const chars = Array.from(pool);
    const mono = cssFontFamily("--font-martian", "monospace");
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.floor(cell * 0.72)}px ${cjk ? CJK_FONT_STACK : mono}`;
    for (let i = 0; i < 64; i++) {
      const char = chars[i % chars.length];
      const cx = (i % 8) * cell + cell / 2;
      const cy = Math.floor(i / 8) * cell + cell / 2;
      ctx.save();
      // Mirror the glyphs, like the classic digital rain
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.fillText(char, 0, 2);
      ctx.restore();
    }
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}

/** Redraws canvas atlases once the web fonts are available. */
export function useFontsReady(atlas: CanvasAtlas) {
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) atlas.redraw();
    });
    return () => {
      cancelled = true;
      atlas.texture.dispose();
    };
  }, [atlas]);
}

/* ------------------------------------------------------------------ */
/* Sky dome                                                            */
/* ------------------------------------------------------------------ */

type SkyDomeProps = {
  zenith: string;
  horizon: string;
  glow: string;
  glowStrength?: number;
  glowHeight?: number;
  radius?: number;
};

/** A big inverted sphere with a vertical gradient and a soft glow at the horizon. */
export function SkyDome({
  zenith,
  horizon,
  glow,
  glowStrength = 0.6,
  glowHeight = 0.18,
  radius = 900,
}: SkyDomeProps) {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new Color(zenith) },
      uHorizon: { value: new Color(horizon) },
      uGlow: { value: new Color(glow) },
      uGlowStrength: { value: glowStrength },
      uGlowHeight: { value: glowHeight },
    }),
    [zenith, horizon, glow, glowStrength, glowHeight],
  );

  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 24]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uGlow;
          uniform float uGlowStrength;
          uniform float uGlowHeight;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
            float glow = exp(-abs(h) / max(uGlowHeight, 0.001));
            col += uGlow * glow * uGlowStrength;
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
/* Twinkling stars                                                     */
/* ------------------------------------------------------------------ */

type StarfieldProps = {
  count: number;
  radius?: number;
  minHeight?: number;
  color?: string;
  size?: number;
  seed?: number;
  active: boolean;
};

export function Starfield({
  count,
  radius = 700,
  minHeight = 0.06,
  color = "#ffffff",
  size = 2.2,
  seed = 7,
  active,
}: StarfieldProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const activeRef = useActiveRef(active);

  const geometry = useMemo(() => {
    const rnd = createRandom(seed);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Random direction on the upper hemisphere
      const u = rnd.range(minHeight, 1);
      const theta = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = u * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius;
      seeds[i] = rnd.next();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    return g;
  }, [count, radius, minHeight, seed]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uSize: { value: size },
    }),
    [color, size],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!activeRef.current || !materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={-9}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={
          /* glsl */ `
          uniform float uTime;
          uniform float uSize;
          attribute float aSeed;
          varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.5) + aSeed * 40.0);
            vAlpha = twinkle * (0.35 + aSeed * 0.65);
            gl_PointSize = uSize * (0.6 + aSeed * 0.9);
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
            float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha;
            gl_FragColor = vec4(uColor * a * 1.6, a);
            ${outputGLSL}
          }
        `
        }
      />
    </points>
  );
}

/** Small helper so every scene can share the same hash functions. */
export const sharedHash = hashGLSL;
