import { ExperienceProvider } from "@/components/experience/ExperienceProvider";
import { SmoothScroll } from "@/components/experience/SmoothScroll";
import { DistrictContent } from "@/components/sections/DistrictContent";
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
        <DistrictContent />
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
