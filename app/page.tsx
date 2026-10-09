import { ExperienceProvider } from "@/components/experience/ExperienceProvider";
import { SmoothScroll } from "@/components/experience/SmoothScroll";
import { About } from "@/components/sections/About";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { Journey } from "@/components/sections/Journey";
import { Skills } from "@/components/sections/Skills";
import { Work } from "@/components/sections/Work";
import { Backdrop } from "@/components/ui/Backdrop";
import { BootScreen } from "@/components/ui/BootScreen";
import { Cursor } from "@/components/ui/Cursor";
import { DepthMeter, HudReadout } from "@/components/ui/Hud";
import { MusicPlayer } from "@/components/ui/MusicPlayer";
import { TopBar } from "@/components/ui/TopBar";
import { TravelDock } from "@/components/ui/TravelDock";
import { TravelOverlay } from "@/components/ui/TravelOverlay";

/** Shared SVG patterns used by the generated project covers. */
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1.2" fill="#000" opacity="0.45" />
        </pattern>
      </defs>
    </svg>
  );
}

export default function Home() {
  return (
    <ExperienceProvider>
      <SmoothScroll />
      <Backdrop />
      <SvgDefs />
      <TopBar />
      <div className="page">
        <main id="main" tabIndex={-1}>
          <Hero />
          <About />
          <Skills />
          <Work />
          <Journey />
          <Contact />
        </main>
        <Footer />
      </div>
      <HudReadout />
      <MusicPlayer />
      <DepthMeter />
      <TravelDock />
      <TravelOverlay />
      <div className="scanlines" aria-hidden="true" />
      <Cursor />
      <BootScreen />
    </ExperienceProvider>
  );
}
