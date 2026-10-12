import { C, H, W, glow, text, withAlpha } from "../draw";
import type { Action, Cartridge, GameHost, PointerKind } from "../types";

/**
 * NIGHT RACER: an old-school pseudo-3D road. Change lanes, dodge the traffic,
 * go as far as you can. The road bends, the sun sets, the cars get faster.
 */

const HORIZON = 170;
const FOCAL = 260;
const CAM_HEIGHT = 1;
const PLAYER_Z = 1.35;
const FAR = 70;
const LANES = [-1, 0, 1];
const PALETTE = [C.cyan, C.violet, C.orange, C.green, C.pink];

type Car = { lane: number; z: number; speed: number; color: string; truck: boolean };

export class Racer implements Cartridge {
  private state: "ready" | "run" | "crash" = "ready";
  private lane = 1;
  private x = 0;
  private speed = 16;
  private dist = 0;
  private cars: Car[] = [];
  private spawnIn = 1;
  private crashAt = 0;
  private boost = 0;
  private brake = 0;
  private best: number;
  private newRecord = false;
  private shake = 0;

  constructor(private host: GameHost) {
    this.best = host.best("racer");
  }

  private reset() {
    this.state = "run";
    this.lane = 1;
    this.x = 0;
    this.speed = 16;
    this.dist = 0;
    this.cars = [];
    this.spawnIn = 1.2;
    this.newRecord = false;
  }

  private curve(distance: number) {
    return Math.sin(distance * 0.008) * 1.3 + Math.sin(distance * 0.0031 + 1) * 0.8;
  }

  /** Sideways shift of the road at depth z (the bend), in world units. */
  private bend(z: number) {
    return this.curve(this.dist) * z * z * 0.0055;
  }

  private project(x: number, z: number) {
    const camX = this.x * 0.55;
    const scale = FOCAL / z;
    return { x: W / 2 + (x - camX + this.bend(z)) * scale, y: HORIZON + CAM_HEIGHT * scale, scale };
  }

  press(action: Action, down: boolean) {
    if (action === "up") this.boost = down ? 1 : 0;
    if (action === "down") this.brake = down ? 1 : 0;
    if (!down) return;
    if (this.state !== "run") {
      if (action === "a" && (this.state === "ready" || performance.now() - this.crashAt > 600)) this.reset();
      return;
    }
    if (action === "left") this.lane = Math.max(0, this.lane - 1);
    if (action === "right") this.lane = Math.min(2, this.lane + 1);
  }

  pointer(kind: PointerKind, x: number) {
    if (kind !== "down") return;
    if (this.state !== "run") {
      this.press("a", true);
      return;
    }
    this.press(x < W / 2 ? "left" : "right", true);
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const target = LANES[this.lane];
    this.x += (target - this.x) * (1 - Math.exp(-dt * 12));
    if (this.state !== "run") {
      // Idle: the road keeps rolling slowly behind the title
      this.dist += dt * (this.state === "ready" ? 9 : 2);
      return;
    }

    const base = Math.min(46, 16 + this.dist * 0.012);
    const wanted = base * (1 + this.boost * 0.3 - this.brake * 0.35);
    this.speed += (wanted - this.speed) * (1 - Math.exp(-dt * 2));
    this.dist += this.speed * dt;

    // Traffic
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = Math.max(0.45, 1.25 - this.dist * 0.0004) * (0.7 + Math.random() * 0.6);
      const lanes = [0, 1, 2].filter(
        (lane) => !this.cars.some((car) => car.lane === lane && car.z > FAR - 12),
      );
      // Never close all three lanes at once
      const busy = new Set(this.cars.filter((car) => car.z > FAR - 18).map((car) => car.lane));
      const open = lanes.filter((lane) => busy.size < 2 || busy.has(lane));
      if (open.length) {
        const lane = open[Math.floor(Math.random() * open.length)];
        this.cars.push({
          lane,
          z: FAR,
          // Everyone drives at about the same pace, so the gaps you see stay fair
          speed: 0.42 + Math.random() * 0.06,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          truck: Math.random() < 0.18,
        });
      }
    }
    for (const car of this.cars) car.z -= this.speed * (1 - car.speed) * dt;
    this.cars = this.cars.filter((car) => car.z > 0.4);

    for (const car of this.cars) {
      if (Math.abs(car.z - PLAYER_Z) < 0.42 && Math.abs(LANES[car.lane] - this.x) < 0.62) {
        this.state = "crash";
        this.crashAt = performance.now();
        this.shake = 1;
        this.newRecord = this.host.record("racer", Math.floor(this.dist));
        this.best = this.host.best("racer");
        break;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 8 * this.shake);
    }
    this.drawSky(ctx, time);
    this.drawRoad(ctx);
    const sorted = [...this.cars].sort((a, b) => b.z - a.z);
    for (const car of sorted) this.drawCar(ctx, LANES[car.lane], car.z, car.color, car.truck, false);
    this.drawCar(ctx, this.x, PLAYER_Z, C.pink, false, true);
    ctx.restore();
    this.drawHud(ctx, time);
  }

  private drawSky(ctx: CanvasRenderingContext2D, time: number) {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, "#04020a");
    sky.addColorStop(0.6, "#1f0830");
    sky.addColorStop(1, "#4a0f44");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, HORIZON);
    // Stars
    ctx.fillStyle = withAlpha(C.ink, 0.6);
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97.3 + 13) % W;
      const sy = (i * 41.7) % (HORIZON - 40);
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.3 + i));
      ctx.globalAlpha = twinkle * 0.7;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Sun, drifting against the bends
    const sunX = W / 2 - this.curve(this.dist) * 60;
    const sunY = HORIZON - 6;
    glow(ctx, sunX, sunY, 150, C.pink, 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, 62, Math.PI, 0);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, sunY - 62, 0, sunY);
    sun.addColorStop(0, C.yellow);
    sun.addColorStop(1, C.pink);
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - 62, sunY - 62, 124, 62);
    ctx.fillStyle = "#2a0b35";
    for (let i = 0; i < 6; i++) {
      const y = sunY - 30 + i * 6;
      ctx.fillRect(sunX - 64, y, 128, 1 + i * 0.6);
    }
    ctx.restore();

    // Mountains
    const shift = -this.curve(this.dist) * 25;
    ctx.fillStyle = "#14051f";
    ctx.strokeStyle = withAlpha(C.violet, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-40, HORIZON);
    for (let i = 0; i <= 16; i++) {
      const mx = -40 + i * 45 + shift;
      const my = HORIZON - 14 - Math.abs(Math.sin(i * 1.7) * 34) - (i % 3) * 6;
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(W + 40, HORIZON);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawRoad(ctx: CanvasRenderingContext2D) {
    // Ground
    const ground = ctx.createLinearGradient(0, HORIZON, 0, H);
    ground.addColorStop(0, "#1c0629");
    ground.addColorStop(1, "#08030f");
    ctx.fillStyle = ground;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);

    // Road in slices, far to near
    const steps = 46;
    let prev: { z: number; l: { x: number; y: number }; r: { x: number; y: number } } | null = null;
    for (let i = steps; i >= 0; i--) {
      const z = 0.9 * Math.pow(FAR / 0.9, i / steps);
      const l = this.project(-1.62, z);
      const r = this.project(1.62, z);
      if (prev) {
        const stripe = Math.floor((z + this.dist) / 2.2) % 2 === 0;
        ctx.fillStyle = stripe ? "#140a1e" : "#100818";
        ctx.beginPath();
        ctx.moveTo(prev.l.x, prev.l.y);
        ctx.lineTo(prev.r.x, prev.r.y);
        ctx.lineTo(r.x, r.y);
        ctx.lineTo(l.x, l.y);
        ctx.fill();
        // Rumble strips
        const w0 = 0.09 * (FOCAL / prev.z);
        const w1 = 0.09 * (FOCAL / z);
        ctx.fillStyle = stripe ? C.pink : withAlpha(C.ink, 0.85);
        for (const side of [-1, 1]) {
          const a = side < 0 ? prev.l : prev.r;
          const b = side < 0 ? l : r;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(a.x - side * w0, a.y);
          ctx.lineTo(b.x - side * w1, b.y);
          ctx.lineTo(b.x, b.y);
          ctx.fill();
        }
        // Lane dashes
        if (Math.floor((z + this.dist) / 3) % 2 === 0) {
          ctx.fillStyle = withAlpha(C.ink, 0.75);
          for (const lx of [-0.5, 0.5]) {
            const a = this.project(lx, prev.z);
            const b = this.project(lx, z);
            const ha = 0.03 * a.scale;
            const hb = 0.03 * b.scale;
            ctx.beginPath();
            ctx.moveTo(a.x - ha, a.y);
            ctx.lineTo(a.x + ha, a.y);
            ctx.lineTo(b.x + hb, b.y);
            ctx.lineTo(b.x - hb, b.y);
            ctx.fill();
          }
        }
      }
      prev = { z, l, r };
    }
    // Haze where the road meets the sky
    const haze = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 26);
    haze.addColorStop(0, withAlpha(C.pink, 0.35));
    haze.addColorStop(1, withAlpha(C.pink, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, HORIZON, W, 26);
  }

  private drawCar(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, truck: boolean, player: boolean) {
    const p = this.project(x, z);
    const w = (truck ? 0.86 : 0.72) * p.scale;
    const h = (truck ? 0.62 : 0.34) * p.scale;
    const left = p.x - w / 2;
    const bottom = p.y;
    const fog = Math.min(1, Math.max(0, (z - 18) / (FAR - 18)));
    ctx.save();
    ctx.globalAlpha = 1 - fog * 0.85;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(left - w * 0.04, bottom - h * 0.06, w * 1.08, h * 0.12);
    // Body
    ctx.fillStyle = player ? "#1d0b2a" : "#120a1c";
    ctx.fillRect(left, bottom - h, w, h * 0.92);
    if (!truck) {
      // Cabin
      ctx.fillStyle = player ? "#2a1238" : "#1b1028";
      ctx.beginPath();
      ctx.moveTo(left + w * 0.18, bottom - h);
      ctx.lineTo(left + w * 0.28, bottom - h * 1.62);
      ctx.lineTo(left + w * 0.72, bottom - h * 1.62);
      ctx.lineTo(left + w * 0.82, bottom - h);
      ctx.fill();
      ctx.strokeStyle = withAlpha(color, 0.9);
      ctx.lineWidth = Math.max(1, p.scale * 0.012);
      ctx.stroke();
    }
    // Neon outline and taillights
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, p.scale * 0.014);
    ctx.strokeRect(left, bottom - h, w, h * 0.92);
    const lightW = w * 0.24;
    const lightH = Math.max(1.5, h * 0.14);
    const lightY = bottom - h * (truck ? 0.3 : 0.6);
    ctx.fillStyle = C.red;
    ctx.fillRect(left + w * 0.06, lightY, lightW, lightH);
    ctx.fillRect(left + w * 0.94 - lightW, lightY, lightW, lightH);
    if (p.scale > 30) {
      glow(ctx, left + w * 0.06 + lightW / 2, lightY, lightW * 1.2, C.red, 0.45);
      glow(ctx, left + w * 0.94 - lightW / 2, lightY, lightW * 1.2, C.red, 0.45);
    }
    if (player) {
      ctx.fillStyle = C.pink;
      ctx.fillRect(left + w * 0.3, bottom - h * 0.32, w * 0.4, Math.max(1, h * 0.05));
    }
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, time: number) {
    text(ctx, "NIGHT RACER", 18, 26, { size: 15, weight: 800, kind: "head", color: C.pink, spacing: 2 });
    text(ctx, `${Math.floor(this.dist)} m`, W - 18, 26, { size: 15, weight: 700, align: "right", color: C.ink });
    text(ctx, `BEST ${this.best} m`, W - 18, 44, { size: 10, align: "right", color: C.haze });
    if (this.state === "run") {
      text(ctx, `${Math.round(this.speed * 7)} KM/H`, 18, 44, { size: 10, color: C.haze });
    }
    if (this.state === "ready") {
      panel(ctx, "NIGHT RACER", ["← → CHANGE LANES", "↑ BOOST  ↓ BRAKE", "", "PRESS ENTER"], time);
    }
    if (this.state === "crash") {
      panel(
        ctx,
        "WRECKED",
        [
          `${Math.floor(this.dist)} m`,
          this.newRecord ? "NEW RECORD!" : `BEST ${this.best} m`,
          "",
          "ENTER RETRY · ESC MENU",
        ],
        time,
      );
    }
  }
}

/** Centered message box used by the games for titles and game over. */
export function panel(ctx: CanvasRenderingContext2D, title: string, lines: string[], time: number) {
  const width = 300;
  const height = 70 + lines.length * 18;
  const x = (W - width) / 2;
  const y = (H - height) / 2;
  ctx.save();
  ctx.fillStyle = "rgba(7,3,15,0.86)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = C.pink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.restore();
  text(ctx, title, W / 2, y + 38, { size: 24, weight: 800, kind: "head", align: "center", color: C.ink, spacing: 2 });
  lines.forEach((line, i) => {
    const blink = i === lines.length - 1 && Math.sin(time * 5) < -0.2;
    if (!line || blink) return;
    text(ctx, line, W / 2, y + 64 + i * 18, { size: 11, align: "center", color: i === lines.length - 1 ? C.cyan : C.haze });
  });
}
