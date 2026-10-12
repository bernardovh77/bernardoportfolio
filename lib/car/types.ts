/** Buttons every cartridge understands (keyboard arrows/WASD, touch pad). */
export type Action = "up" | "down" | "left" | "right" | "a" | "b";

export type PointerKind = "down" | "move" | "up";

/** Services the console offers to the games. */
export type GameHost = {
  /** Best score saved for a game */
  best: (id: string) => number;
  /** Saves a score; returns true if it is a new record */
  record: (id: string, score: number) => boolean;
};

/** A mini game running on the console screen (640 x 400). */
export interface Cartridge {
  update(dt: number, time: number): void;
  draw(ctx: CanvasRenderingContext2D, time: number): void;
  press(action: Action, down: boolean): void;
  pointer?(kind: PointerKind, x: number, y: number): void;
}
