import { C, H, W, glow, text, withAlpha } from "../draw";
import type { Action, Cartridge, GameHost, PointerKind } from "../types";
import { panel } from "./racer";

/** SYNTH BREAKER: paddle, ball, a wall of sunset-colored bricks. */

const COLS = 10;
const ROWS = 6;
const BRICK_W = 56;
const BRICK_H = 16;
const GAP = 4;
const LEFT = (W - (COLS * BRICK_W + (COLS - 1) * GAP)) / 2;
const TOP = 66;
const PADDLE_Y = 372;
const PADDLE_H = 9;
const BALL_R = 5.5;
const ROW_COLORS = [C.pink, "#ff5d7c", "#ff7f63", C.orange, C.yellow, C.violet];

type Brick = { x: number; y: number; row: number; alive: boolean; hitAt: number };

export class Breaker implements Cartridge {
  private state: "ready" | "serve" | "run" | "over" | "clear" = "ready";
  private bricks: Brick[] = [];
  private paddle = W / 2;
  private paddleW = 92;
  private ball = { x: W / 2, y: PADDLE_Y - 12, vx: 0, vy: 0 };
  private speed = 300;
  private lives = 3;
  private level = 1;
  private score = 0;
  private best: number;
  private newRecord = false;
  private move = 0;
  private aimX: number | null = null;
  private stateAt = 0;
  private trail: { x: number; y: number }[] = [];

  constructor(private host: GameHost) {
    this.best = host.best("breaker");
    this.buildWall();
  }

  private buildWall() {
    this.bricks = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        this.bricks.push({
          x: LEFT + col * (BRICK_W + GAP),
          y: TOP + row * (BRICK_H + GAP),
          row,
          alive: true,
          hitAt: -10,
        });
      }
    }
  }

  private newGame() {
    this.lives = 3;
    this.level = 1;
    this.score = 0;
    this.speed = 300;
    this.newRecord = false;
    this.buildWall();
    this.serve();
  }

  private serve() {
    this.state = "serve";
    this.stateAt = performance.now();
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.trail = [];
  }

  private launch() {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    this.ball.vx = Math.cos(angle) * this.speed;
    this.ball.vy = Math.sin(angle) * this.speed;
    this.state = "run";
  }

  press(action: Action, down: boolean) {
    if (action === "left") this.move = down ? -1 : this.move === -1 ? 0 : this.move;
    if (action === "right") this.move = down ? 1 : this.move === 1 ? 0 : this.move;
    if (action === "left" || action === "right") this.aimX = null;
    if (!down || action !== "a") return;
    if (this.state === "ready") this.newGame();
    else if (this.state === "serve") this.launch();
    else if ((this.state === "over" || this.state === "clear") && performance.now() - this.stateAt > 500) {
      if (this.state === "over") this.newGame();
      else {
        this.level += 1;
        this.speed = 300 + (this.level - 1) * 40;
        this.buildWall();
        this.serve();
      }
    }
  }

  pointer(kind: PointerKind, x: number) {
    this.aimX = x;
    if (kind === "down") this.press("a", true);
  }

  update(dt: number) {
    const half = this.paddleW / 2;
    if (this.aimX !== null) this.paddle += (this.aimX - this.paddle) * (1 - Math.exp(-dt * 18));
    else this.paddle += this.move * 460 * dt;
    this.paddle = Math.min(W - half - 4, Math.max(half + 4, this.paddle));

    if (this.state === "serve" || this.state === "ready") {
      this.ball.x = this.paddle;
      this.ball.y = PADDLE_Y - BALL_R - 2;
      return;
    }
    if (this.state !== "run") return;

    // Move in small steps so the ball never skips through a brick
    const steps = Math.ceil((Math.hypot(this.ball.vx, this.ball.vy) * dt) / 4);
    const h = dt / steps;
    for (let s = 0; s < steps && this.state === "run"; s++) this.stepBall(h);
    this.trail.push({ x: this.ball.x, y: this.ball.y });
    if (this.trail.length > 8) this.trail.shift();
  }

  private stepBall(dt: number) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < BALL_R + 2) {
      b.x = BALL_R + 2;
      b.vx = Math.abs(b.vx);
    }
    if (b.x > W - BALL_R - 2) {
      b.x = W - BALL_R - 2;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < BALL_R + 50) {
      b.y = BALL_R + 50;
      b.vy = Math.abs(b.vy);
    }

    // Paddle: the further from the middle you hit, the steeper the bounce
    const half = this.paddleW / 2;
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 6 && Math.abs(b.x - this.paddle) <= half + BALL_R) {
      const offset = (b.x - this.paddle) / half;
      const angle = -Math.PI / 2 + offset * 1.05;
      const speed = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      b.y = PADDLE_Y - BALL_R;
    }

    if (b.y > H + 20) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.state = "over";
        this.stateAt = performance.now();
        this.newRecord = this.host.record("breaker", this.score);
        this.best = this.host.best("breaker");
      } else {
        this.serve();
      }
      return;
    }

    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const nearestX = Math.max(brick.x, Math.min(b.x, brick.x + BRICK_W));
      const nearestY = Math.max(brick.y, Math.min(b.y, brick.y + BRICK_H));
      const dx = b.x - nearestX;
      const dy = b.y - nearestY;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
      brick.alive = false;
      brick.hitAt = performance.now() / 1000;
      this.score += (ROWS - brick.row) * 10;
      // Bounce off the side we came through
      const overlapX = Math.min(b.x + BALL_R - brick.x, brick.x + BRICK_W - (b.x - BALL_R));
      const overlapY = Math.min(b.y + BALL_R - brick.y, brick.y + BRICK_H - (b.y - BALL_R));
      if (overlapX < overlapY) b.vx = -b.vx;
      else b.vy = -b.vy;
      const speed = Math.hypot(b.vx, b.vy);
      const faster = Math.min(speed * 1.012, 560) / speed;
      b.vx *= faster;
      b.vy *= faster;
      if (this.bricks.every((other) => !other.alive)) {
        this.state = "clear";
        this.stateAt = performance.now();
        this.record();
      }
      break;
    }
  }

  private record() {
    this.newRecord = this.host.record("breaker", this.score) || this.newRecord;
    this.best = this.host.best("breaker");
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0414");
    bg.addColorStop(1, "#1a0626");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Faint grid
    ctx.strokeStyle = withAlpha(C.violet, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 32) {
      ctx.moveTo(x, 50);
      ctx.lineTo(x, H);
    }
    for (let y = 50; y <= H; y += 32) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();

    const now = performance.now() / 1000;
    for (const brick of this.bricks) {
      const color = ROW_COLORS[brick.row];
      if (brick.alive) {
        ctx.fillStyle = withAlpha(color, 0.28);
        ctx.fillRect(brick.x, brick.y, BRICK_W, BRICK_H);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(brick.x + 0.75, brick.y + 0.75, BRICK_W - 1.5, BRICK_H - 1.5);
        ctx.fillStyle = withAlpha(color, 0.9);
        ctx.fillRect(brick.x + 4, brick.y + 3, BRICK_W - 8, 2);
      } else if (now - brick.hitAt < 0.25) {
        const k = (now - brick.hitAt) / 0.25;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = color;
        ctx.strokeRect(brick.x - k * 6, brick.y - k * 4, BRICK_W + k * 12, BRICK_H + k * 8);
        ctx.globalAlpha = 1;
      }
    }

    // Paddle
    const half = this.paddleW / 2;
    glow(ctx, this.paddle, PADDLE_Y + 4, 70, C.cyan, 0.25);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(this.paddle - half, PADDLE_Y, this.paddleW, PADDLE_H);
    ctx.fillStyle = C.ink;
    ctx.fillRect(this.paddle - half + 6, PADDLE_Y + 2, this.paddleW - 12, 2);

    // Ball and its trail
    this.trail.forEach((point, i) => {
      ctx.globalAlpha = (i / this.trail.length) * 0.4;
      ctx.fillStyle = C.yellow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, BALL_R * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    glow(ctx, this.ball.x, this.ball.y, 24, C.yellow, 0.5);
    ctx.fillStyle = "#fff8e0";
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    // HUD
    ctx.fillStyle = withAlpha(C.bg, 0.9);
    ctx.fillRect(0, 0, W, 48);
    ctx.fillStyle = withAlpha(C.orange, 0.5);
    ctx.fillRect(0, 48, W, 1);
    text(ctx, "SYNTH BREAKER", 18, 30, { size: 15, weight: 800, kind: "head", color: C.orange, spacing: 2 });
    text(ctx, `SCORE ${this.score}`, W - 18, 24, { size: 13, weight: 700, align: "right" });
    text(ctx, `BEST ${this.best} · LVL ${this.level}`, W - 18, 40, { size: 10, align: "right", color: C.haze });
    for (let i = 0; i < this.lives; i++) {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(200 + i * 22, 24, 16, 5);
    }

    if (this.state === "ready") {
      panel(ctx, "SYNTH BREAKER", ["← → OR MOUSE TO MOVE", "SPACE / CLICK TO LAUNCH", "", "PRESS ENTER"], time);
    } else if (this.state === "serve" && performance.now() - this.stateAt > 300) {
      if (Math.sin(time * 5) > -0.2) {
        text(ctx, "SPACE / CLICK TO LAUNCH", W / 2, 300, { size: 11, align: "center", color: C.cyan });
      }
    } else if (this.state === "over") {
      panel(
        ctx,
        "GAME OVER",
        [`SCORE ${this.score}`, this.newRecord ? "NEW RECORD!" : `BEST ${this.best}`, "", "ENTER RETRY · ESC MENU"],
        time,
      );
    } else if (this.state === "clear") {
      panel(ctx, "GRID CLEARED", [`SCORE ${this.score}`, `LEVEL ${this.level + 1} IS FASTER`, "", "PRESS ENTER"], time);
    }
  }
}
