"use client";

import { useEffect, useRef } from "react";
import { drive, enterCar } from "@/lib/drive";
import { exitSign } from "@/lib/exitSign";
import { useExperience } from "@/components/experience/ExperienceProvider";

/** Things on the page that keep their own clicks (the road sign is only behind empty space or text). */
const OWN_CLICKS =
  "a, button, input, textarea, select, label, [role='button'], [data-cursor], .terminal, .topbar, .dock, .music, .drive";

function blocked(target: EventTarget | null) {
  return target instanceof Element && target.closest(OWN_CLICKS) !== null;
}

/** The sign only answers around the top of the page, where it is part of the view (not behind the sections). */
function nearTop() {
  return window.scrollY < window.innerHeight * 0.6;
}

function toNdc(event: MouseEvent) {
  return [(event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1] as const;
}

/**
 * The page side of the EXIT 77 road sign (the sign itself is in the 3D desert):
 * it tells the sign where the pointer is, shows a small label while you point
 * at it, and puts you in the car when you click it.
 */
export function HitchSign() {
  const { t, theme, traveling } = useExperience();
  const tipRef = useRef<HTMLDivElement>(null);
  const desert = theme === "desert";

  useEffect(() => {
    if (!desert || traveling) return;
    const root = document.documentElement;
    const tip = tipRef.current;

    const onMove = (event: PointerEvent) => {
      exitSign.pointerFree =
        event.pointerType === "mouse" && !blocked(event.target) && drive.phase === "off" && nearTop();
      if (tip) tip.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    };
    const onLeave = () => {
      exitSign.pointerFree = false;
    };
    const onScroll = () => {
      if (!nearTop()) exitSign.pointerFree = false;
    };
    const onClick = (event: MouseEvent) => {
      if (drive.phase !== "off" || blocked(event.target) || !nearTop()) return;
      // Selecting text over the sign is not a click on it
      if (window.getSelection()?.toString()) return;
      const [x, y] = toNdc(event);
      if (exitSign.pick?.(x, y)) enterCar();
    };
    exitSign.onHover = (hover) => {
      root.classList.toggle("is-sign-hover", hover);
      tip?.toggleAttribute("data-show", hover);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("click", onClick);
      exitSign.onHover = null;
      exitSign.pointerFree = false;
      exitSign.hover = false;
      root.classList.remove("is-sign-hover");
      tip?.removeAttribute("data-show");
    };
  }, [desert, traveling]);

  if (!desert) return null;
  return (
    <div ref={tipRef} className="sign-tip" aria-hidden="true">
      <span>{t.drive.signTip}</span>
    </div>
  );
}
