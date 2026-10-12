/**
 * Drawing helpers for the car's console screen (a 2D canvas).
 * Everything is laid out on a 640 x 400 grid; the canvas itself can be
 * bigger (sharper text), the context is scaled to match.
 */

export const W = 640;
export const H = 400;

export const C = {
  bg: "#07030f",
  bg2: "#12061f",
  panel: "#150a26",
  line: "#3a2152",
  pink: "#ff3f8e",
  orange: "#ffa62b",
  yellow: "#ffd23f",
  violet: "#b07cff",
  cyan: "#19f3ff",
  red: "#ff2340",
  green: "#3dff9a",
  ink: "#f6ecff",
  haze: "#a08cbf",
  dim: "#5d4a78",
};

const fonts = {
  head: '"Arial Narrow", Arial, sans-serif',
  mono: "ui-monospace, Menlo, Consolas, monospace",
};

/** Reads the site's web fonts (next/font exposes their family names as CSS variables). */
export function loadFonts() {
  const read = (variable: string, fallback: string) => {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
      return value ? `${value}, ${fallback}` : fallback;
    } catch {
      return fallback;
    }
  };
  fonts.head = read("--font-tektur", '"Arial Narrow", Arial, sans-serif');
  fonts.mono = read("--font-martian", "ui-monospace, Menlo, Consolas, monospace");
}

/** Font family list for a canvas `font` string. */
export function fontFamily(kind: "head" | "mono") {
  return fonts[kind];
}

export type TextOptions = {
  size?: number;
  weight?: number;
  kind?: "head" | "mono";
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  spacing?: number;
  alpha?: number;
};

export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, o: TextOptions = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 600} ${o.size ?? 12}px ${fonts[o.kind ?? "mono"]}`;
  ctx.fillStyle = o.color ?? C.ink;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.baseline ?? "alphabetic";
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.spacing) {
    // letterSpacing is not in every browser yet; it only makes titles look nicer
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${o.spacing}px`;
  }
  ctx.fillText(value, x, y);
  ctx.restore();
}

export function measure(ctx: CanvasRenderingContext2D, value: string, size: number, weight = 600, kind: "head" | "mono" = "mono") {
  ctx.save();
  ctx.font = `${weight} ${size}px ${fonts[kind]}`;
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}

/** A soft round glow (cheaper than canvas shadows). */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 0.5) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, withAlpha(color, alpha));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** "#rrggbb" + alpha → "rgba(...)" */
export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** A rectangle with the corners cut off, like the site's panels. */
export function bevelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut = 8) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

/** The synthwave backdrop shared by the menu and the games. */
export function backdrop(ctx: CanvasRenderingContext2D, time: number, horizon = 250, scroll = time * 0.5) {
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#05020c");
  sky.addColorStop(1, "#2a0b35");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  const ground = ctx.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, "#1a0626");
  ground.addColorStop(1, "#07030f");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, H - horizon);

  // Perspective grid on the ground
  ctx.save();
  ctx.strokeStyle = withAlpha(C.pink, 0.32);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -12; i <= 12; i++) {
    ctx.moveTo(W / 2 + i * 6, horizon);
    ctx.lineTo(W / 2 + i * 110, H);
  }
  const phase = scroll % 1;
  for (let k = 0; k < 14; k++) {
    const z = k + 1 - phase;
    const y = horizon + 150 / z;
    if (y > H) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}
