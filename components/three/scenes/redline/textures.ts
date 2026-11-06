import { type CanvasAtlas, cssFontFamily, makeTexture } from "../../shared";

/*
 * Canvas textures for Redline. Glyphs are drawn white; the shaders tint them.
 */

/** Words on the boards around the circuit, one per cell (2 columns, 4 rows). */
export const BOARD_TEXTS = [
  "REDLINE",
  "REV-BENCH",
  "LIGHTS OUT",
  "FULL THROTTLE",
  "BERNARDO",
  "PIT LANE",
  "D-04",
  "BOOST",
] as const;
export const BOARD = Object.fromEntries(BOARD_TEXTS.map((text, i) => [text, i])) as Record<
  (typeof BOARD_TEXTS)[number],
  number
>;

export function createBoardAtlas(): CanvasAtlas {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    BOARD_TEXTS.forEach((text, i) => {
      const x = (i % 2) * 512;
      const y = Math.floor(i / 2) * 128;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 84;
      ctx.font = `italic 800 ${size}px ${font}`;
      while (ctx.measureText(text).width > 452 && size > 24) {
        size -= 2;
        ctx.font = `italic 800 ${size}px ${font}`;
      }
      ctx.fillText(text, x + 256, y + 68);
      ctx.restore();
    });
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}

/** Where the tachometer's sweep starts and ends, in radians from 12 o'clock (clockwise). */
export const TACH_START = (-135 * Math.PI) / 180;
export const TACH_END = (135 * Math.PI) / 180;

/**
 * The tachometer's printed face: the numbers 0-8 (x1000 rpm) around the sweep and
 * the small print. The needle, the lit arc and the shift lights are drawn by its shader.
 */
export function createDialAtlas(): CanvasAtlas {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
    const mono = cssFontFamily("--font-martian", "monospace");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    const at = (x: number, y: number) => [size / 2 + (x * size) / 2, size / 2 - (y * size) / 2];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let n = 0; n <= 8; n++) {
      const angle = TACH_START + ((TACH_END - TACH_START) * n) / 8;
      const [x, y] = at(Math.sin(angle) * 0.6, Math.cos(angle) * 0.6);
      // Red numbers in the red zone (the shader tints by the red channel)
      ctx.fillStyle = n >= 7 ? "#f00" : "#fff";
      ctx.font = `italic 800 92px ${font}`;
      ctx.fillText(String(n), x, y);
    }
    ctx.fillStyle = "#fff";
    ctx.font = `600 30px ${mono}`;
    let [x, y] = at(0, -0.36);
    ctx.fillText("x1000 r/min", x, y);
    ctx.font = `italic 800 40px ${font}`;
    [x, y] = at(0, 0.3);
    ctx.fillText("REV-BENCH", x, y);
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}

/** Gear indicator glyphs: N, then 1 to 6, one 128px cell each. */
export function createGearAtlas(): CanvasAtlas {
  const cell = 128;
  const canvas = document.createElement("canvas");
  canvas.width = cell * 7;
  canvas.height = cell;
  const texture = makeTexture(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = cssFontFamily("--font-tektur", '"Arial Narrow", Arial, sans-serif');
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 112px ${font}`;
    ["N", "1", "2", "3", "4", "5", "6"].forEach((glyph, i) => {
      ctx.fillText(glyph, i * cell + cell / 2, cell / 2 + 6);
    });
    texture.needsUpdate = true;
  };

  draw();
  return { texture, redraw: draw };
}
