"use client";

import { Component, type ReactNode, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { onScrollProgress } from "@/lib/scroll";
import { markWorldReady } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";

const World = dynamic(() => import("@/components/three/World"), { ssr: false });

type BoundaryProps = { children: ReactNode };

/** If WebGL is unavailable, keep the CSS backdrop instead of crashing the page. */
class WebGLBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("3D background disabled:", error);
    markWorldReady();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The fixed 3D world behind the whole page. */
export function Backdrop() {
  const { theme } = useExperience();
  const dimRef = useRef<HTMLDivElement>(null);

  // Dim the world a little once you scroll past the hero, so text stays readable
  useEffect(() => {
    const update = () => {
      const vh = window.innerHeight;
      const dim = Math.min(1, Math.max(0, (window.scrollY - vh * 0.3) / (vh * 0.6)));
      dimRef.current?.style.setProperty("--dim", dim.toFixed(3));
    };
    update();
    return onScrollProgress(update);
  }, []);

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__fallback" />
      <WebGLBoundary>
        <World theme={theme} />
      </WebGLBoundary>
      <div className="backdrop__scrim" />
      <div ref={dimRef} className="backdrop__dim" />
    </div>
  );
}
