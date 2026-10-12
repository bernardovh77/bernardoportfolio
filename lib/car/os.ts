import { music } from "@/lib/content";
import { localize, type Lang } from "@/lib/i18n";
import { musicStore } from "@/lib/music";
import { detectQualityTier } from "@/lib/world";
import { Breaker } from "./games/breaker";
import { Racer } from "./games/racer";
import { Snake } from "./games/snake";
import { C, H, W, backdrop, bevelRect, fontFamily, glow, loadFonts, text, withAlpha } from "./draw";
import { doom, doomKey, loadDoom, pauseDoom, releaseDoomKeys, resumeDoom, stepDoom } from "./doom";
import type { Action, Cartridge, GameHost, PointerKind } from "./types";

/**
 * NV-77 OS: the console screen in the car.
 * A boot animation, a cartridge menu, three mini games and DOOM.
 * It draws into a canvas that the 3D dashboard uses as a texture.
 */

export type OsMode = "off" | "boot" | "menu" | "game" | "doom";
export type TileId = "doom" | "racer" | "snake" | "breaker" | "radio" | "exit";

/** What the interface needs to show the right controls. */
export type OsSnapshot = { mode: OsMode; app: TileId | null; doom: "idle" | "loading" | "ready" | "error" };

const TILES: TileId[] = ["doom", "racer", "snake", "breaker", "radio", "exit"];
const TILE_W = 190;
const TILE_H = 124;
const TILE_GAP = 12;
const GRID_LEFT = (W - (TILE_W * 3 + TILE_GAP * 2)) / 2;
const GRID_TOP = 78;
const BOOT_SECONDS = 1.7;

const ACTIONS: Record<string, Action> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Enter: "a",
  NumpadEnter: "a",
  Space: "a",
  KeyZ: "a",
  KeyJ: "a",
  Escape: "b",
  Backspace: "b",
  KeyX: "b",
};

const STRINGS = {
  en: {
    arcade: "ARCADE",
    carts: "6 CARTRIDGES",
    hint: "ARROWS SELECT · ENTER PLAY · V VIEW · ESC LEAVE",
    sub: {
      doom: "id Software · 1993",
      racer: "Dodge the traffic",
      snake: "Eat. Grow. Don't crash.",
      breaker: "Smash the grid",
      radio: "",
      exit: "Back to the site",
    },
    radioOn: "On air",
    radioOff: "Off",
    radioNone: "No signal",
    best: "BEST",
    autopilot: "AUTOPILOT",
    loading: "LOADING DOOM",
    loadingNote: "First time only: about 2 MB",
    failed: "DOOM COULD NOT LOAD",
    failedNote: "Check your connection · ESC to go back",
    boot: ["autopilot ........ engaged", "radio ............ tuned", "arcade ........... 6 carts", "doom ............. found"],
  },
  pt: {
    arcade: "FLIPERAMA",
    carts: "6 CARTUCHOS",
    hint: "SETAS ESCOLHEM · ENTER JOGA · V VISTA · ESC SAIR",
    sub: {
      doom: "id Software · 1993",
      racer: "Desvie do trânsito",
      snake: "Coma. Cresça. Não bata.",
      breaker: "Quebre a grade",
      radio: "",
      exit: "Voltar ao site",
    },
    radioOn: "No ar",
    radioOff: "Desligado",
    radioNone: "Sem sinal",
    best: "RECORDE",
    autopilot: "PILOTO AUTOMÁTICO",
    loading: "CARREGANDO DOOM",
    loadingNote: "Só na primeira vez: uns 2 MB",
    failed: "O DOOM NÃO CARREGOU",
    failedNote: "Confira sua conexão · ESC para voltar",
    boot: ["piloto automático . ligado", "rádio ............ sintonizado", "fliperama ........ 6 cartuchos", "doom ............. encontrado"],
  },
} satisfies Record<Lang, unknown>;

const TITLES: Record<TileId, string> = {
  doom: "DOOM",
  racer: "NIGHT RACER",
  snake: "NEON SNAKE",
  breaker: "SYNTH BREAKER",
  radio: "RADIO",
  exit: "EXIT",
};

const ACCENTS: Record<TileId, string> = {
  doom: C.red,
  racer: C.pink,
  snake: C.cyan,
  breaker: C.orange,
  radio: C.violet,
  exit: C.haze,
};

const BEST_KEY = "bp-car-best";

function readBest(): Record<string, number> {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export class CarOS {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** Set when the canvas changed and the 3D texture must be uploaded again */
  dirty = true;
  mode: OsMode = "off";
  lang: Lang = "en";
  /** Leaves the car (wired by the drive overlay) */
  onExit: () => void = () => {};
  /** Car speed shown in the status bar, km/h */
  speed = 0;

  private app: TileId | null = null;
  private game: Cartridge | null = null;
  private selected = 0;
  private bootAt = 0;
  private time = 0;
  private sinceDraw = 1;
  private best = readBest();
  private host: GameHost;
  private pressedAt = -10;

  constructor(scale: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(W * scale);
    this.canvas.height = Math.round(H * scale);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.host = {
      best: (id) => this.best[id] ?? 0,
      record: (id, score) => {
        if (score <= (this.best[id] ?? 0)) return false;
        this.best = { ...this.best, [id]: score };
        try {
          localStorage.setItem(BEST_KEY, JSON.stringify(this.best));
        } catch {
          // No storage (private mode): the record lasts until the tab closes
        }
        return true;
      },
    };
  }

  /* -------------------------------- state ------------------------------- */

  private emit() {
    publish({ mode: this.mode, app: this.app, doom: doom.status });
  }

  private setMode(mode: OsMode, app: TileId | null = this.app) {
    this.mode = mode;
    this.app = app;
    this.dirty = true;
    this.sinceDraw = 1;
    this.emit();
  }

  /** The screen wakes up and boots into the menu. */
  powerOn() {
    if (this.mode !== "off") return;
    loadFonts();
    this.bootAt = this.time;
    this.setMode("boot", null);
  }

  /** Leaving the car: pause everything, the screen goes dark. */
  powerOff() {
    pauseDoom();
    this.game = null;
    this.setMode("off", null);
  }

  /** Is DOOM's picture the one on screen (instead of the canvas)? */
  get showsDoom() {
    return this.mode === "doom" && doom.status === "ready";
  }

  /* -------------------------------- input ------------------------------- */

  /** Physical key from the keyboard. Returns true when the console used it. */
  key(code: string, down: boolean, repeat: boolean): boolean {
    if (this.mode === "off" || this.mode === "boot") return false;
    if (this.mode === "doom") {
      if (code === "Backquote") {
        if (down) this.toMenu();
        return true;
      }
      if (doom.status === "ready") return doomKey(code, down);
      if (down && ACTIONS[code] === "b") this.toMenu();
      return ACTIONS[code] !== undefined;
    }
    const action = ACTIONS[code];
    if (!action) return false;
    if (down && repeat && this.mode !== "menu") return true;
    this.press(action, down);
    return true;
  }

  /** Buttons of the on-screen touch pad. */
  button(name: Action | "fire" | "use" | "enter" | "escape", down: boolean) {
    if (this.mode === "doom" && doom.status === "ready") {
      const code = {
        up: "ArrowUp",
        down: "ArrowDown",
        left: "ArrowLeft",
        right: "ArrowRight",
        a: "KeyF",
        fire: "KeyF",
        b: "Space",
        use: "Space",
        enter: "Enter",
        escape: "Escape",
      }[name];
      doomKey(code, down);
      return;
    }
    const action: Action = name === "fire" || name === "enter" ? "a" : name === "use" || name === "escape" ? "b" : name;
    // On the touch pad, Back never leaves the car by accident (there is a button for that)
    if (this.mode === "menu" && action === "b") return;
    this.press(action, down);
  }

  private press(action: Action, down: boolean) {
    if (this.mode === "menu") {
      if (down) this.menuPress(action);
      return;
    }
    if (this.mode === "game" && this.game) {
      if (action === "b") {
        if (down) this.toMenu();
        return;
      }
      this.game.press(action, down);
      return;
    }
    if (this.mode === "doom" && down && action === "b") this.toMenu();
  }

  /** Pointer on the screen, in screen pixels (640 x 400). */
  pointer(kind: PointerKind, x: number, y: number) {
    if (this.mode === "menu") {
      const hit = this.tileAt(x, y);
      if (hit >= 0 && hit !== this.selected && kind === "move") {
        this.selected = hit;
        this.dirty = true;
      }
      if (hit >= 0 && kind === "down") {
        this.selected = hit;
        this.launch(TILES[hit]);
      }
      return;
    }
    if (this.mode === "game") this.game?.pointer?.(kind, x, y);
    if (this.mode === "doom" && doom.status === "ready") {
      // Click to shoot
      if (kind === "down") doomKey("MouseFire", true);
      if (kind === "up") doomKey("MouseFire", false);
    }
  }

  /** Window lost focus: let go of every key so nothing stays stuck. */
  releaseAll() {
    releaseDoomKeys();
    for (const action of ["up", "down", "left", "right", "a"] as Action[]) this.game?.press(action, false);
  }

  private tileAt(x: number, y: number) {
    for (let i = 0; i < TILES.length; i++) {
      const tx = GRID_LEFT + (i % 3) * (TILE_W + TILE_GAP);
      const ty = GRID_TOP + Math.floor(i / 3) * (TILE_H + TILE_GAP);
      if (x >= tx && x <= tx + TILE_W && y >= ty && y <= ty + TILE_H) return i;
    }
    return -1;
  }

  private menuPress(action: Action) {
    const col = this.selected % 3;
    const row = Math.floor(this.selected / 3);
    if (action === "left") this.selected = row * 3 + ((col + 2) % 3);
    if (action === "right") this.selected = row * 3 + ((col + 1) % 3);
    if (action === "up" || action === "down") this.selected = ((row + 1) % 2) * 3 + col;
    if (action === "a") this.launch(TILES[this.selected]);
    if (action === "b") this.onExit();
    this.pressedAt = this.time;
    this.dirty = true;
  }

  private launch(tile: TileId) {
    this.pressedAt = this.time;
    switch (tile) {
      case "racer":
        this.game = new Racer(this.host);
        this.setMode("game", tile);
        break;
      case "snake":
        this.game = new Snake(this.host);
        this.setMode("game", tile);
        break;
      case "breaker":
        this.game = new Breaker(this.host);
        this.setMode("game", tile);
        break;
      case "doom":
        this.game = null;
        this.setMode("doom", tile);
        if (doom.status === "ready") resumeDoom();
        else {
          if (doom.status === "error") doom.status = "idle";
          loadDoom().then(() => {
            if (this.mode === "doom") resumeDoom();
            this.dirty = true;
            this.emit();
          });
          this.emit();
        }
        break;
      case "radio":
        musicStore.toggle();
        this.dirty = true;
        break;
      case "exit":
        this.onExit();
        break;
    }
  }

  /** Back to the cartridge menu (DOOM keeps its place). */
  toMenu() {
    pauseDoom();
    this.game = null;
    this.setMode("menu", null);
  }

  /* ------------------------------- frames ------------------------------- */

  /** Runs one animation frame. Call it every frame while in the car. */
  frame(dt: number) {
    this.time += dt;
    this.sinceDraw += dt;
    if (this.mode === "off") return;

    if (this.mode === "boot") {
      if (this.time - this.bootAt > BOOT_SECONDS) this.setMode("menu", null);
      this.drawBoot();
      this.dirty = true;
      return;
    }

    if (this.mode === "doom") {
      if (doom.status === "ready") {
        stepDoom();
        // Quit from DOOM's own menu: back to the cartridges
        if (doom.status !== "ready") this.toMenu();
        return;
      }
      // Loading screen, about 30 times a second
      if (this.sinceDraw >= 1 / 30 || this.dirty) {
        this.drawDoomLoading();
        this.sinceDraw = 0;
        this.dirty = true;
      }
      return;
    }

    if (this.mode === "game" && this.game) {
      this.game.update(Math.min(dt, 0.05), this.time);
      this.game.draw(this.ctx, this.time);
      this.dirty = true;
      return;
    }

    // The menu animates gently: 30 frames a second is plenty
    if (this.sinceDraw >= 1 / 30 || this.dirty) {
      this.drawMenu();
      this.sinceDraw = 0;
      this.dirty = true;
    }
  }

  /* ------------------------------- screens ------------------------------ */

  private drawStatus() {
    const ctx = this.ctx;
    const s = STRINGS[this.lang];
    ctx.fillStyle = "rgba(7,3,15,0.92)";
    ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = withAlpha(C.pink, 0.45);
    ctx.fillRect(0, 28, W, 1);
    text(ctx, "NV-77", 14, 19, { size: 13, weight: 800, kind: "head", color: C.pink, spacing: 1 });
    const blink = Math.sin(this.time * 4) > -0.3;
    ctx.fillStyle = blink ? C.cyan : withAlpha(C.cyan, 0.3);
    ctx.beginPath();
    ctx.arc(68, 15, 3, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, s.autopilot, 77, 19, { size: 9, weight: 600, color: C.cyan });

    const status = musicStore.getSnapshot();
    const title = localize(music.title, this.lang);
    const radio = status === "playing" ? `♪ ${title}` : status === "unavailable" ? s.radioNone : `♪ ${s.radioOff}`;
    text(ctx, radio, W / 2 + 40, 19, { size: 9.5, align: "center", color: status === "playing" ? C.ink : C.haze });

    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    text(ctx, clock, W - 14, 19, { size: 10, weight: 700, align: "right" });
    text(ctx, `${Math.round(this.speed)} KM/H`, W - 60, 19, { size: 9.5, align: "right", color: C.orange });
  }

  private drawBoot() {
    const ctx = this.ctx;
    const t = this.time - this.bootAt;
    ctx.fillStyle = "#030107";
    ctx.fillRect(0, 0, W, H);
    if (t < 0.25) return;
    const k = Math.min(1, (t - 0.25) / 0.5);
    glow(ctx, W / 2, 168, 220, C.pink, 0.22 * k);
    const gradient = ctx.createLinearGradient(0, 130, 0, 200);
    gradient.addColorStop(0, C.yellow);
    gradient.addColorStop(0.5, C.orange);
    gradient.addColorStop(1, C.pink);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `900 78px ${fontFamily("head")}`;
    ctx.textAlign = "center";
    ctx.fillStyle = gradient;
    ctx.fillText("NV-77", W / 2, 196);
    ctx.restore();
    text(ctx, "NEON VELOCITY OS 7.7", W / 2, 224, { size: 11, align: "center", color: C.haze, alpha: k, spacing: 3 });

    // Progress bar
    const p = Math.min(1, Math.max(0, (t - 0.35) / (BOOT_SECONDS - 0.5)));
    ctx.fillStyle = withAlpha(C.violet, 0.25);
    ctx.fillRect(W / 2 - 110, 248, 220, 3);
    ctx.fillStyle = C.pink;
    ctx.fillRect(W / 2 - 110, 248, 220 * p, 3);

    const lines = STRINGS[this.lang].boot;
    lines.forEach((line, i) => {
      if (t > 0.45 + i * 0.22) text(ctx, `> ${line}`, 24, 318 + i * 15, { size: 9.5, color: i === lines.length - 1 ? C.red : C.dim });
    });
  }

  private drawMenu() {
    const ctx = this.ctx;
    const s = STRINGS[this.lang];
    backdrop(ctx, this.time, 250, this.time * 0.6);
    ctx.fillStyle = "rgba(7,3,15,0.55)";
    ctx.fillRect(0, 0, W, H);
    this.drawStatus();

    text(ctx, s.arcade, GRID_LEFT, 62, { size: 22, weight: 800, kind: "head", color: C.ink, spacing: 5 });
    text(ctx, s.carts, W - GRID_LEFT, 62, { size: 9, align: "right", color: C.haze, spacing: 1 });

    TILES.forEach((id, i) => {
      const x = GRID_LEFT + (i % 3) * (TILE_W + TILE_GAP);
      const y = GRID_TOP + Math.floor(i / 3) * (TILE_H + TILE_GAP);
      this.drawTile(id, x, y, i === this.selected);
    });

    text(ctx, s.hint, W / 2, 378, { size: 9, align: "center", color: C.haze, spacing: 0.5 });
  }

  private drawTile(id: TileId, x: number, y: number, selected: boolean) {
    const ctx = this.ctx;
    const s = STRINGS[this.lang];
    const accent = ACCENTS[id];
    const pop = selected ? Math.max(0, 1 - (this.time - this.pressedAt) * 6) : 0;
    const lift = selected ? -2 : 0;
    ctx.save();
    ctx.translate(0, lift);
    if (selected) glow(ctx, x + TILE_W / 2, y + TILE_H / 2, 150, accent, 0.18 + pop * 0.2);
    bevelRect(ctx, x, y, TILE_W, TILE_H, 10);
    ctx.fillStyle = selected ? "#1c0b30" : "#120822";
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? accent : withAlpha(C.line, 1);
    ctx.stroke();

    // Icon area
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 8, y + 8, TILE_W - 16, 70);
    ctx.clip();
    ctx.fillStyle = "#0a0414";
    ctx.fillRect(x + 8, y + 8, TILE_W - 16, 70);
    this.drawIcon(id, x + TILE_W / 2, y + 43, selected);
    ctx.restore();

    text(ctx, TITLES[id], x + 12, y + 97, {
      size: 14,
      weight: 800,
      kind: "head",
      color: selected ? C.ink : withAlpha(C.ink, 0.75),
      spacing: 1,
    });
    let sub = s.sub[id];
    if (id === "radio") {
      const status = musicStore.getSnapshot();
      sub = status === "playing" ? `${s.radioOn} · ${localize(music.title, this.lang)}` : status === "unavailable" ? s.radioNone : s.radioOff;
    }
    text(ctx, sub, x + 12, y + 113, { size: 8.5, color: C.haze });
    const best = this.best[id];
    if (best && (id === "racer" || id === "snake" || id === "breaker")) {
      text(ctx, `${s.best} ${best}${id === "racer" ? "m" : ""}`, x + TILE_W - 10, y + 97, {
        size: 8,
        align: "right",
        color: accent,
      });
    }
    if (id === "doom") {
      text(ctx, "SHAREWARE E1", x + TILE_W - 10, y + 97, { size: 7.5, align: "right", color: C.red });
    }
    if (selected) {
      // Corner brackets
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      const m = 4;
      const l = 10;
      ctx.beginPath();
      ctx.moveTo(x - m, y - m + l);
      ctx.lineTo(x - m, y - m);
      ctx.lineTo(x - m + l, y - m);
      ctx.moveTo(x + TILE_W + m - l, y + TILE_H + m);
      ctx.lineTo(x + TILE_W + m, y + TILE_H + m);
      ctx.lineTo(x + TILE_W + m, y + TILE_H + m - l);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawIcon(id: TileId, cx: number, cy: number, selected: boolean) {
    const ctx = this.ctx;
    const t = this.time;
    switch (id) {
      case "doom": {
        glow(ctx, cx, cy + 6, 70, C.red, selected ? 0.45 : 0.25);
        const fire = ctx.createLinearGradient(0, cy - 20, 0, cy + 18);
        fire.addColorStop(0, C.yellow);
        fire.addColorStop(0.45, C.orange);
        fire.addColorStop(1, C.red);
        ctx.save();
        ctx.translate(cx, cy + 14);
        ctx.transform(1, 0, -0.12, 1, 0, 0);
        ctx.font = `900 40px ${fontFamily("head")}`;
        ctx.textAlign = "center";
        ctx.fillStyle = fire;
        ctx.fillText("DOOM", 0, 0);
        ctx.strokeStyle = "#3a0505";
        ctx.lineWidth = 1;
        ctx.strokeText("DOOM", 0, 0);
        ctx.restore();
        // Embers
        for (let i = 0; i < 9; i++) {
          const ex = cx - 70 + ((i * 37 + t * 20) % 140);
          const ey = cy + 26 - ((t * 18 + i * 13) % 50);
          ctx.fillStyle = withAlpha(C.orange, 0.7);
          ctx.fillRect(ex, ey, 2, 2);
        }
        break;
      }
      case "racer": {
        const horizon = cy - 2;
        ctx.fillStyle = "#1a0626";
        ctx.fillRect(cx - 90, horizon, 180, 40);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, horizon, 22, Math.PI, 0);
        const sun = ctx.createLinearGradient(0, horizon - 22, 0, horizon);
        sun.addColorStop(0, C.yellow);
        sun.addColorStop(1, C.pink);
        ctx.fillStyle = sun;
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#0e0618";
        ctx.beginPath();
        ctx.moveTo(cx - 4, horizon);
        ctx.lineTo(cx + 4, horizon);
        ctx.lineTo(cx + 60, cy + 36);
        ctx.lineTo(cx - 60, cy + 36);
        ctx.fill();
        ctx.strokeStyle = C.pink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 4, horizon);
        ctx.lineTo(cx - 60, cy + 36);
        ctx.moveTo(cx + 4, horizon);
        ctx.lineTo(cx + 60, cy + 36);
        ctx.stroke();
        const phase = (t * 1.5) % 1;
        ctx.fillStyle = C.ink;
        for (let k = 0; k < 4; k++) {
          const z = (k + phase) / 4;
          const yy = horizon + z * z * 36;
          ctx.fillRect(cx - 1, yy, 2, 1 + z * 4);
        }
        ctx.fillStyle = C.red;
        ctx.fillRect(cx - 14, cy + 22, 8, 3);
        ctx.fillRect(cx + 6, cy + 22, 8, 3);
        break;
      }
      case "snake": {
        const pts = [
          [-60, 14],
          [-30, 14],
          [-30, -10],
          [10, -10],
          [10, 10],
          [40, 10],
        ];
        ctx.strokeStyle = C.cyan;
        ctx.lineWidth = 8;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(cx + px, cy + py) : ctx.moveTo(cx + px, cy + py)));
        ctx.stroke();
        const pulse = 0.7 + 0.3 * Math.sin(t * 6);
        glow(ctx, cx + 62, cy + 10, 16 * pulse, C.orange, 0.6);
        ctx.fillStyle = C.yellow;
        ctx.beginPath();
        ctx.arc(cx + 62, cy + 10, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "breaker": {
        const colors = [C.pink, C.orange, C.yellow];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 6; c++) {
            if ((r + c) % 5 === 3) continue;
            ctx.strokeStyle = colors[r];
            ctx.lineWidth = 1.2;
            ctx.strokeRect(cx - 66 + c * 22, cy - 26 + r * 10, 19, 7);
          }
        }
        const bx = cx + Math.sin(t * 2) * 40;
        const by = cy + 14 - Math.abs(Math.cos(t * 2)) * 10;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.cyan;
        ctx.fillRect(cx - 22 + Math.sin(t * 2) * 30, cy + 26, 44, 4);
        break;
      }
      case "radio": {
        const playing = musicStore.getSnapshot() === "playing";
        for (let i = 0; i < 9; i++) {
          const level = playing ? 0.3 + 0.7 * Math.abs(Math.sin(t * (2 + i * 0.7) + i)) : 0.12;
          const h = 46 * level;
          ctx.fillStyle = i % 2 ? C.violet : C.pink;
          ctx.fillRect(cx - 54 + i * 12, cy + 24 - h, 8, h);
        }
        break;
      }
      case "exit": {
        ctx.strokeStyle = C.haze;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 34, cy - 24, 30, 48);
        ctx.strokeStyle = C.pink;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy);
        ctx.lineTo(cx + 34, cy);
        ctx.moveTo(cx + 22, cy - 12);
        ctx.lineTo(cx + 34, cy);
        ctx.lineTo(cx + 22, cy + 12);
        ctx.stroke();
        break;
      }
    }
  }

  private drawDoomLoading() {
    const ctx = this.ctx;
    const s = STRINGS[this.lang];
    ctx.fillStyle = "#060203";
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, H / 2, 260, C.red, 0.18);
    if (doom.status === "error") {
      text(ctx, s.failed, W / 2, 190, { size: 20, weight: 800, kind: "head", align: "center", color: C.red, spacing: 2 });
      text(ctx, s.failedNote, W / 2, 218, { size: 10, align: "center", color: C.haze });
      return;
    }
    text(ctx, s.loading, W / 2, 170, { size: 22, weight: 800, kind: "head", align: "center", color: C.ink, spacing: 3 });
    const p = doom.progress;
    ctx.fillStyle = withAlpha(C.red, 0.25);
    ctx.fillRect(W / 2 - 140, 190, 280, 6);
    ctx.fillStyle = C.orange;
    ctx.fillRect(W / 2 - 140, 190, 280 * p, 6);
    text(ctx, `${Math.round(p * 100)}%`, W / 2, 218, { size: 11, align: "center", color: C.orange });
    text(ctx, s.loadingNote, W / 2, 240, { size: 9, align: "center", color: C.haze });
    text(ctx, "DOOM © 1993 id Software · shareware episode", W / 2, 348, { size: 8.5, align: "center", color: C.dim });
    text(ctx, "Engine: Linux DOOM 1.10 (GPL-2.0) · WebAssembly port by C. Diekmann", W / 2, 362, {
      size: 8.5,
      align: "center",
      color: C.dim,
    });
  }
}

/* ------------------------------------------------------------------ */
/* The one console                                                     */
/* ------------------------------------------------------------------ */

const OFF: OsSnapshot = { mode: "off", app: null, doom: "idle" };
let snapshot: OsSnapshot = OFF;
const listeners = new Set<() => void>();

function publish(next: OsSnapshot) {
  if (next.mode === snapshot.mode && next.app === snapshot.app && next.doom === snapshot.doom) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Lets the interface follow what the console shows (for the control hints). */
export const carOSStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => OFF,
};

let instance: CarOS | null = null;

/** The console of the car, created the first time someone gets in. */
export function getCarOS() {
  // A sharper canvas on capable machines (it is uploaded to the GPU every frame)
  if (!instance) instance = new CarOS(detectQualityTier() === "high" ? 1.5 : 1);
  return instance;
}
