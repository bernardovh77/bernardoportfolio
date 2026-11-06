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
