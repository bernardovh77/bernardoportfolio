"use client";

import { useEffect, useRef } from "react";
import { useFinePointer, useReducedMotion } from "@/lib/hooks";

const INTERACTIVE = "a, button, [role='button'], input, textarea, label, [data-cursor]";

/** A targeting reticle that follows the mouse and locks onto interactive elements. */
export function Cursor() {
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = finePointer && !reduced;
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    const root = document.documentElement;
    root.classList.add("has-cursor");

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;
    let visible = false;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      if (!visible) {
        visible = true;
        rx = x;
        ry = y;
        root.classList.add("cursor-visible");
      }
      const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null;
      ring.classList.toggle("is-locked", Boolean(target));
      const text = target?.matches("input, textarea") ?? false;
      ring.classList.toggle("is-text", text);
      dot.classList.toggle("is-text", text);
    };
    const onLeave = () => {
      visible = false;
      root.classList.remove("cursor-visible");
    };
    const onDown = () => ring.classList.add("is-pressed");
    const onUp = () => ring.classList.remove("is-pressed");

    const loop = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      root.classList.remove("has-cursor", "cursor-visible");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="cursor" aria-hidden="true">
      <div ref={ringRef} className="cursor__ring">
        <span className="cursor__tick cursor__tick--tl" />
        <span className="cursor__tick cursor__tick--tr" />
        <span className="cursor__tick cursor__tick--bl" />
        <span className="cursor__tick cursor__tick--br" />
      </div>
      <div ref={dotRef} className="cursor__dot" />
    </div>
  );
}
