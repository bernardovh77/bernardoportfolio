import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
} from "three";
import { createRandom } from "@/lib/random";
import { type CanvasAtlas, cssFontFamily, makeTexture } from "../../shared";

/**
 * A small tiling noise texture, generated once, that every shader samples
 * instead of computing noise per pixel (much cheaper on the GPU).
 *   R: soft clouds (smog, grime)   G: distance to cracks (lava crust)
 *   B: finer clouds                A: unused
 */
export function createNoiseTexture(size = 256) {
  const rnd = createRandom(1234);
  const data = new Uint8Array(size * size * 4);

  const lattices = new Map<number, Float32Array>();
  const lattice = (period: number) => {
    let grid = lattices.get(period);
    if (!grid) {
      grid = new Float32Array(period * period);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd.next();
      lattices.set(period, grid);
    }
    return grid;
  };
  const value = (x: number, y: number, period: number, offset: number) => {
    const grid = lattice(period + offset);
    const p = period + offset;
    const u = (x / size) * period;
    const v = (y / size) * period;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fx = u - i;
    const fy = v - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number) =>
      grid[(((b % period) + period) % period) * p + (((a % period) + period) % period)];
    const top = at(i, j) * (1 - sx) + at(i + 1, j) * sx;
    const bottom = at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };

  // Worley cells for the cracks in the lava crust
  const cells = 8;
  const points = Array.from({ length: cells * cells }, () => [rnd.next(), rnd.next()]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r =
        value(x, y, 4, 0) * 0.5 +
        value(x, y, 8, 0) * 0.25 +
        value(x, y, 16, 0) * 0.15 +
        value(x, y, 32, 0) * 0.1;
      const b =
        value(x, y, 8, 1) * 0.45 +
        value(x, y, 16, 1) * 0.28 +
        value(x, y, 32, 1) * 0.17 +
        value(x, y, 64, 0) * 0.1;
      const cx = (x / size) * cells;
      const cy = (y / size) * cells;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      let f1 = 9;
      let f2 = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = ix + dx;
          const gy = iy + dy;
          const [px, py] = points[((gy + cells) % cells) * cells + ((gx + cells) % cells)];
          const d = Math.hypot(gx + px - cx, gy + py - cy);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
      const g = Math.min(1, (f2 - f1) * 1.6);
      const i = (y * size + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, (r - 0.18) * 1.6)) * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, (b - 0.18) * 1.6)) * 255);
      data[i + 3] = 255;
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Cells of the sign atlas (4x4 grid): [u, v, width, height] in texture space. */
const cell = (col: number, row: number, cols = 1): [number, number, number, number] => [
  col / 4,
  1 - (row + 1) / 4,
  cols / 4,
  1 / 4,
];

export const SIGN_CELLS = {
  site: (index: number) => cell(index % 4, Math.floor(index / 4) % 2),
  sector: cell(0, 2, 2),
  voltage: cell(2, 2),
  lift: cell(3, 2),
  down: cell(0, 3),
};

/** Stencilled metal plates: site numbers, the sector sign, warnings. */
export function createSignAtlas(): CanvasAtlas {
  const size = 512;
  const c = size / 4;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rnd = createRandom(77);
    const font = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
    ctx.clearRect(0, 0, size, size);

    const plate = (x: number, y: number, w: number, h: number, color = "#3a332c") => {
      ctx.fillStyle = color;
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
      ctx.fillStyle = "#6b5f52";
      for (const [rx, ry] of [
        [x + 13, y + 13],
        [x + w - 13, y + 13],
        [x + 13, y + h - 13],
        [x + w - 13, y + h - 13],
      ]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    // Chips and scratches where the paint came off
    const wear = (x: number, y: number, w: number, h: number, amount: number) => {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "#2a241f";
      for (let i = 0; i < amount; i++) {
        const px = x + rnd.range(8, w - 8);
        const py = y + rnd.range(8, h - 8);
        ctx.fillRect(px, py, rnd.range(2, 9), rnd.range(1, 4));
      }
      ctx.restore();
    };
    const stencil = (
      text: string,
      x: number,
      y: number,
      w: number,
      h: number,
      color: string,
      px: number,
    ) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let fontSize = px;
      ctx.font = `800 ${fontSize}px ${font}`;
      while (ctx.measureText(text).width > w - 30 && fontSize > 12) {
        fontSize -= 2;
        ctx.font = `800 ${fontSize}px ${font}`;
      }
      ctx.fillText(text, x + w / 2, y + h / 2 + 4);
      // Stencil bridges
      ctx.fillStyle = "#3a332c";
      ctx.fillRect(x + 12, y + h / 2 - 2, w - 24, 3);
      ctx.restore();
    };

    // Site numbers
    for (let i = 0; i < 8; i++) {
      const x = (i % 4) * c;
      const y = Math.floor(i / 4) * c;
      plate(x, y, c, c);
      stencil(String(i + 1).padStart(2, "0"), x, y, c, c, "#c9963a", 78);
      wear(x, y, c, c, 26);
    }

    // Sector sign
    {
      const x = 0;
      const y = 2 * c;
      plate(x, y, 2 * c, c, "#332c26");
      ctx.fillStyle = "#c9963a";
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        ctx.moveTo(x + 14 + k * 28, y + c - 14);
        ctx.lineTo(x + 28 + k * 28, y + c - 14);
        ctx.lineTo(x + 42 + k * 28, y + c - 26);
        ctx.lineTo(x + 28 + k * 28, y + c - 26);
        ctx.fill();
      }
      stencil("B-04", x, y - 10, 2 * c, c, "#d9cdb8", 82);
      wear(x, y, 2 * c, c, 60);
    }

    // High voltage
    {
      const x = 2 * c;
      const y = 2 * c;
      ctx.fillStyle = "#c9963a";
      ctx.beginPath();
      ctx.moveTo(x + c / 2, y + 12);
      ctx.lineTo(x + c - 10, y + c - 16);
      ctx.lineTo(x + 10, y + c - 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1c1814";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = "#1c1814";
      ctx.beginPath();
      ctx.moveTo(x + c / 2 + 6, y + 38);
      ctx.lineTo(x + c / 2 - 12, y + 76);
      ctx.lineTo(x + c / 2 + 2, y + 74);
      ctx.lineTo(x + c / 2 - 6, y + 100);
      ctx.lineTo(x + c / 2 + 14, y + 64);
      ctx.lineTo(x + c / 2, y + 66);
      ctx.closePath();
      ctx.fill();
      wear(x, y, c, c, 30);
    }

    // Broken lift: red and white bands with a cross
    {
      const x = 3 * c;
      const y = 2 * c;
      plate(x, y, c, c, "#8a2a1c");
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 10, y + 10, c - 20, c - 20);
      ctx.clip();
      ctx.fillStyle = "#cfc4b2";
      for (let k = -4; k < 8; k++) {
        ctx.beginPath();
        ctx.moveTo(x + k * 24, y + c);
        ctx.lineTo(x + k * 24 + 12, y + c);
        ctx.lineTo(x + k * 24 + 12 + c, y);
        ctx.lineTo(x + k * 24 + c, y);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = "#1c1814";
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(x + 30, y + 30);
      ctx.lineTo(x + c - 30, y + c - 30);
      ctx.moveTo(x + c - 30, y + 30);
      ctx.lineTo(x + 30, y + c - 30);
      ctx.stroke();
      wear(x, y, c, c, 40);
    }

    // Arrow down
    {
      const x = 0;
      const y = 3 * c;
      plate(x, y, c, c);
      ctx.fillStyle = "#d9cdb8";
      ctx.beginPath();
      ctx.moveTo(x + c / 2 - 14, y + 22);
      ctx.lineTo(x + c / 2 + 14, y + 22);
      ctx.lineTo(x + c / 2 + 14, y + 66);
      ctx.lineTo(x + c / 2 + 34, y + 66);
      ctx.lineTo(x + c / 2, y + 106);
      ctx.lineTo(x + c / 2 - 34, y + 66);
      ctx.lineTo(x + c / 2 - 14, y + 66);
      ctx.closePath();
      ctx.fill();
      wear(x, y, c, c, 30);
    }
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}
