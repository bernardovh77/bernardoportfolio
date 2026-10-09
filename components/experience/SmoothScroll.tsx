"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { emitScroll, setLenis } from "@/lib/scroll";
import { world } from "@/lib/world";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scrolling (Lenis) kept in sync with GSAP ScrollTrigger,
 * and the scroll progress shared with the 3D world.
 */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 0.95,
      anchors: { offset: -72 },
      stopInertiaOnNavigate: true,
    });
    setLenis(lenis);

    const onScroll = () => {
      const progress = Number.isFinite(lenis.progress) ? lenis.progress : 0;
      world.scroll = Math.min(1, Math.max(0, progress));
      world.velocity = lenis.velocity;
      emitScroll(world.scroll, lenis.velocity);
      ScrollTrigger.update();
    };
    const unsubscribe = lenis.on("scroll", onScroll);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Keep velocity decaying to zero when scrolling stops
    const settle = gsap.ticker.add(() => {
      if (!lenis.isScrolling) world.velocity *= 0.9;
    });

    onScroll();
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);

    return () => {
      window.removeEventListener("load", refresh);
      unsubscribe();
      gsap.ticker.remove(tick);
      gsap.ticker.remove(settle);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  return null;
}
