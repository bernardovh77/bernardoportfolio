"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { About } from "./About";
import { Contact } from "./Contact";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { Journey } from "./Journey";
import { RedlinePage } from "./RedlinePage";
import { Skills } from "./Skills";
import { Work } from "./Work";

/**
 * The page content. Megacity, the desert and the ocean share the same sections;
 * Redline, the racing district, has its own page.
 */
export function DistrictContent() {
  const { theme } = useExperience();
  const redline = theme === "redline";

  // The page height just changed, so everything tied to scrolling re-measures
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [redline]);

  if (redline) return <RedlinePage />;
  return (
    <>
      <main id="main" tabIndex={-1}>
        <Hero />
        <About />
        <Skills />
        <Work />
        <Journey />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
