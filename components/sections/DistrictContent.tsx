"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { About } from "./About";
import { Contact } from "./Contact";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { Journey } from "./Journey";
import { Skills } from "./Skills";
import { UnderworksPage } from "./UnderworksPage";
import { Work } from "./Work";

/**
 * The page content. The three surface districts share the same sections;
 * the Underworks is a different place, with its own page.
 */
export function DistrictContent() {
  const { theme } = useExperience();
  const underworks = theme === "underworks";

  // The page height just changed, so everything tied to scrolling re-measures
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [underworks]);

  if (underworks) return <UnderworksPage />;
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
