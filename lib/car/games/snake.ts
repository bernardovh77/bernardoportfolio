import { C, H, W, glow, text, withAlpha } from "../draw";
import type { Action, Cartridge, GameHost, PointerKind } from "../types";
import { panel } from "./racer";

/** NEON SNAKE: the classic. Eat, grow, don't hit the walls or yourself. */

const CELL = 20;
const COLS = 32;
const ROWS = 17;
const TOP = 52;

type Point = { x: number; y: number };
const DIRS: Record<"up" | "down" | "left" | "right", Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class Snake implements Cartridge {
  private state: "ready" | "run" | "over" = "ready";
  private body: Point[] = [];
  private dir: Point = DIRS.right;
  private queue: Point[] = [];
  private food: Point = { x: 20, y: 8 };
  private step = 0.12;
  private clock = 0;
  private score = 0;
  private best: number;
  private newRecord = false;
  private overAt = 0;
  private eatenAt = -10;

  constructor(private host: GameHost) {
    this.best = host.best("snake");
    this.resetBody();
  }

  private resetBody() {
    this.body = [
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 },
      { x: 5, y: 8 },
    ];
    this.dir = DIRS.right;
    this.queue = [];
  }

  private reset() {
    this.state = "run";
    this.resetBody();
    this.score = 0;
    this.step = 0.12;
    this.clock = 0;
    this.newRecord = false;
    this.placeFood();
  }

  private placeFood() {
    for (let tries = 0; tries < 500; tries++) {
      const spot = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!this.body.some((part) => part.x === spot.x && part.y === spot.y)) {
        this.food = spot;
        return;
      }
    }
  }

  press(action: Action, down: boolean) {
    if (!down) return;
    if (this.state !== "run") {
      if (action === "a" && (this.state === "ready" || performance.now() - this.overAt > 500)) this.reset();
      return;
    }
    if (action === "a" || action === "b") return;
    const next = DIRS[action];
    const last = this.queue[this.queue.length - 1] ?? this.dir;
    // No turning back on yourself
    if (next.x === -last.x && next.y === -last.y) return;
    if (next.x === last.x && next.y === last.y) return;
    if (this.queue.length < 3) this.queue.push(next);
  }

  pointer(kind: PointerKind, x: number, y: number) {
    if (kind !== "down") return;
    if (this.state !== "run") {
      this.press("a", true);
      return;
    }
    // Tap a side of the screen relative to the head to turn that way
    const head = this.body[0];
    const hx = head.x * CELL + CELL / 2;
    const hy = TOP + head.y * CELL + CELL / 2;
    const dx = x - hx;
    const dy = y - hy;
    if (this.dir.x !== 0) this.press(dy < 0 ? "up" : "down", true);
    else this.press(dx < 0 ? "left" : "right", true);
  }

  update(dt: number) {
    if (this.state !== "run") return;
    this.clock += dt;
    while (this.clock >= this.step && this.state === "run") {
      this.clock -= this.step;
      this.advance();
    }
  }

  private advance() {
    if (this.queue.length) this.dir = this.queue.shift()!;
    const head = this.body[0];
    const next = { x: head.x + this.dir.x, y: head.y + this.dir.y };
    const hitWall = next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS;
    const eating = next.x === this.food.x && next.y === this.food.y;
    // The tail moves away this step, unless we grow
    const body = eating ? this.body : this.body.slice(0, -1);
    const hitSelf = body.some((part) => part.x === next.x && part.y === next.y);
    if (hitWall || hitSelf) {
      this.state = "over";
      this.overAt = performance.now();
      this.newRecord = this.host.record("snake", this.score);
      this.best = this.host.best("snake");
      return;
    }
    this.body = [next, ...body];
    if (eating) {
      this.score += 10;
      this.eatenAt = performance.now() / 1000;
      this.step = Math.max(0.055, this.step * 0.97);
      this.placeFood();
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    // Arena
    const arenaW = COLS * CELL;
    const arenaH = ROWS * CELL;
    ctx.fillStyle = "#0c0517";
    ctx.fillRect(0, TOP, arenaW, arenaH);
    ctx.fillStyle = withAlpha(C.violet, 0.22);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) ctx.fillRect(x * CELL + CELL / 2 - 1, TOP + y * CELL + CELL / 2 - 1, 2, 2);
    }
    ctx.strokeStyle = C.pink;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, TOP - 1, arenaW - 2, arenaH + 2);

    // Food
    const fx = this.food.x * CELL + CELL / 2;
    const fy = TOP + this.food.y * CELL + CELL / 2;
    const pulse = 0.75 + 0.25 * Math.sin(time * 6);
    glow(ctx, fx, fy, 22 * pulse, C.orange, 0.55);
    ctx.fillStyle = C.yellow;
    ctx.beginPath();
    ctx.arc(fx, fy, 5 * pulse + 1, 0, Math.PI * 2);
    ctx.fill();

    // Snake, cyan head fading to violet
    const count = this.body.length;
    const flash = Math.max(0, 1 - (time - this.eatenAt) * 4);
    this.body.forEach((part, i) => {
      const k = i / Math.max(1, count - 1);
      const inset = 2 + k * 2;
      ctx.fillStyle = i === 0 ? C.cyan : mixHex(C.cyan, C.violet, k);
      ctx.globalAlpha = 1 - k * 0.35;
      ctx.fillRect(part.x * CELL + inset, TOP + part.y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
    });
    ctx.globalAlpha = 1;
    const head = this.body[0];
    glow(ctx, head.x * CELL + CELL / 2, TOP + head.y * CELL + CELL / 2, 26 + flash * 20, C.cyan, 0.35 + flash * 0.3);
    // Eyes
    ctx.fillStyle = C.bg;
    const ex = head.x * CELL + CELL / 2 + this.dir.x * 4;
    const ey = TOP + head.y * CELL + CELL / 2 + this.dir.y * 4;
    ctx.fillRect(ex - 1.5 + this.dir.y * 4, ey - 1.5 + this.dir.x * 4, 3, 3);
    ctx.fillRect(ex - 1.5 - this.dir.y * 4, ey - 1.5 - this.dir.x * 4, 3, 3);

    text(ctx, "NEON SNAKE", 18, 32, { size: 15, weight: 800, kind: "head", color: C.cyan, spacing: 2 });
    text(ctx, `SCORE ${this.score}`, W - 18, 26, { size: 13, weight: 700, align: "right" });
    text(ctx, `BEST ${this.best}`, W - 18, 42, { size: 10, align: "right", color: C.haze });

    if (this.state === "ready") panel(ctx, "NEON SNAKE", ["ARROWS / WASD TO STEER", "EAT THE LIGHT, DON'T CRASH", "", "PRESS ENTER"], time);
    if (this.state === "over") {
      panel(
        ctx,
        "GAME OVER",
        [`SCORE ${this.score}`, this.newRecord ? "NEW RECORD!" : `BEST ${this.best}`, "", "ENTER RETRY · ESC MENU"],
        time,
      );
    }
  }
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
