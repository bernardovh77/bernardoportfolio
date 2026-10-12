/**
 * The original DOOM (id Software, 1993) running on the car's console.
 *
 * Engine: id Software's Linux DOOM 1.10 source (GPL-2.0), compiled to
 * WebAssembly by Cornelius Diekmann (github.com/diekmann/wasm-fizzbuzz).
 * The shareware Episode 1 WAD is built into the binary, unmodified.
 * See public/games/doom/README.txt for credits and source links.
 *
 * The binary is only downloaded the first time someone picks DOOM.
 */

const WASM_URL = "/games/doom/doom.wasm";
/** Size of the binary, for the progress bar (the download may be compressed). */
const WASM_BYTES = 6_843_809;

export const DOOM_WIDTH = 640;
export const DOOM_HEIGHT = 400;

export type DoomStatus = "idle" | "loading" | "ready" | "error";

type DoomExports = {
  main: () => void;
  doom_loop_step: () => void;
  add_browser_event: (type: number, key: number) => void;
};

export const doom = {
  status: "idle" as DoomStatus,
  /** Download progress, 0..1 */
  progress: 0,
  /** True while the game is the one on screen (its clock only runs then) */
  running: false,
  /** Latest frame: 640 x 400 RGBA, top row first (a view into the game's memory) */
  frame: null as Uint8Array | null,
  /** Goes up every time DOOM draws a new frame */
  frameVersion: 0,
};

let game: DoomExports | null = null;
// DOOM's clock stands still while the game is paused (in the car menu)
let clockOffset = 0;
let pausedAt = 0;

function clock() {
  return (doom.running ? performance.now() : pausedAt) - clockOffset;
}

async function readWithProgress(response: Response) {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    doom.progress = Math.min(0.99, received / WASM_BYTES);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// The compiled engine is kept, so starting again after quitting is instant
let compiled: WebAssembly.Module | null = null;

async function engine() {
  if (compiled) return compiled;
  const response = await fetch(WASM_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = await readWithProgress(response);
  compiled = await WebAssembly.compile(bytes);
  return compiled;
}

/** Downloads (the first time) and starts DOOM. Safe to call again while it loads. */
export async function loadDoom() {
  if (doom.status === "loading" || doom.status === "ready") return;
  doom.status = "loading";
  doom.progress = compiled ? 1 : 0;
  try {
    const wasm = await engine();
    const mem = new WebAssembly.Memory({ initial: 108 });
    const quiet = () => {};
    const instance = await WebAssembly.instantiate(wasm, {
      js: {
        js_console_log: quiet,
        js_stdout: quiet,
        js_stderr: quiet,
        js_milliseconds_since_start: clock,
        js_draw_screen: (pointer: number) => {
          // A fresh view each time: the memory may have grown (and moved) since
          doom.frame = new Uint8Array(mem.buffer, pointer, DOOM_WIDTH * DOOM_HEIGHT * 4);
          doom.frameVersion += 1;
        },
      },
      env: { memory: mem },
    });
    game = instance.exports as unknown as DoomExports;
    clockOffset = performance.now();
    doom.running = true;
    game.main();
    doom.running = false;
    pausedAt = performance.now();
    doom.status = "ready";
    doom.progress = 1;
  } catch (error) {
    console.warn("DOOM failed to load:", error);
    game = null;
    doom.status = "error";
  }
}

/**
 * Runs DOOM's game loop once (call every animation frame while it is on screen).
 * Choosing "Quit Game" in DOOM ends the engine (it stops with an error in this
 * port): then it is simply reset, and the next launch starts a new game.
 */
export function stepDoom() {
  if (!game || !doom.running) return;
  try {
    game.doom_loop_step();
  } catch {
    held.clear();
    game = null;
    doom.running = false;
    doom.frame = null;
    doom.status = "idle";
  }
}

export function resumeDoom() {
  if (!game || doom.running) return;
  clockOffset += performance.now() - pausedAt;
  doom.running = true;
}

export function pauseDoom() {
  if (!doom.running) return;
  releaseDoomKeys();
  doom.running = false;
  pausedAt = performance.now();
}

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */

// Key codes from DOOM's doomdef.h
const K = {
  right: 0xae,
  left: 0xac,
  up: 0xad,
  down: 0xaf,
  fire: 0x80 + 0x1d, // right ctrl
  use: 32, // space
  run: 0x80 + 0x36, // right shift
  strafe: 0x80 + 0x38, // right alt
  strafeLeft: 44, // ,
  strafeRight: 46, // .
  escape: 27,
  enter: 13,
  tab: 9,
  backspace: 127,
  pause: 0xff,
  minus: 45,
  equals: 61,
};

const MAPPED: Record<string, number> = {
  ArrowUp: K.up,
  ArrowDown: K.down,
  ArrowLeft: K.left,
  ArrowRight: K.right,
  KeyW: K.up,
  KeyS: K.down,
  KeyA: K.strafeLeft,
  KeyD: K.strafeRight,
  Comma: K.strafeLeft,
  Period: K.strafeRight,
  ControlLeft: K.fire,
  ControlRight: K.fire,
  KeyF: K.fire,
  KeyJ: K.fire,
  MouseFire: K.fire,
  Space: K.use,
  KeyE: K.use,
  ShiftLeft: K.run,
  ShiftRight: K.run,
  AltLeft: K.strafe,
  AltRight: K.strafe,
  Escape: K.escape,
  Enter: K.enter,
  NumpadEnter: K.enter,
  Tab: K.tab,
  Backspace: K.backspace,
  Pause: K.pause,
  Minus: K.minus,
  NumpadSubtract: K.minus,
  Equal: K.equals,
  NumpadAdd: K.equals,
};

// Cheat codes still work: while you type one, letters go to DOOM as letters
const CHEATS = [
  "iddqd",
  "idkfa",
  "idfa",
  "idclip",
  "idspispopd",
  "idchoppers",
  "idclev",
  "idmypos",
  "idmus",
  ...["v", "s", "i", "r", "a", "l"].map((power) => `idbehold${power}`),
];
let cheat = "";

const held = new Map<string, number>();

function send(down: boolean, key: number) {
  game?.add_browser_event(down ? 0 : 1, key);
}

function translate(code: string): number | null {
  const letter = /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase();
  if (letter) {
    const typed = cheat + letter;
    if (CHEATS.some((name) => name.startsWith(typed))) {
      cheat = typed;
      return letter.charCodeAt(0);
    }
    cheat = letter === "i" ? "i" : "";
  }
  if (code in MAPPED) return MAPPED[code];
  if (letter) return letter.charCodeAt(0);
  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  if (digit) return digit.charCodeAt(0);
  const fn = /^F([0-9]{1,2})$/.exec(code)?.[1];
  // F1-F10 (F11 stays the browser's full screen, F12 its dev tools)
  if (fn && Number(fn) <= 10) return 0x80 + 0x3a + Number(fn);
  return null;
}

/** Sends a key to DOOM. Returns true when DOOM used it. */
export function doomKey(code: string, down: boolean): boolean {
  if (!game) return false;
  if (!down) {
    const sent = held.get(code);
    if (sent === undefined) return false;
    held.delete(code);
    send(false, sent);
    return true;
  }
  if (held.has(code)) return true; // key repeat: DOOM already knows it is held
  const key = translate(code);
  if (key === null) return false;
  held.set(code, key);
  send(true, key);
  return true;
}

/** Lets go of every key (focus lost, back to the car menu). */
export function releaseDoomKeys() {
  held.forEach((key) => send(false, key));
  held.clear();
}
