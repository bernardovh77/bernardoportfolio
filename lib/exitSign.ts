/**
 * The EXIT 77 road sign in the Synth Desert: a 3D sign by the highway that
 * puts you in a car when you click it. The 3D scene owns the sign; the page
 * listens to the pointer. This small store connects the two.
 */
export const exitSign = {
  /** The pointer is over the page's background (not a link, a button or the terminal) */
  pointerFree: false,
  /** The pointer is over the sign right now (kept up to date by the 3D sign) */
  hover: false,
  /** Does a pointer at these normalized device coordinates (-1..1) land on the sign? */
  pick: null as ((x: number, y: number) => boolean) | null,
  /** Called by the 3D sign when `hover` changes (the page shows a label and locks the cursor) */
  onHover: null as ((hover: boolean) => void) | null,
};
