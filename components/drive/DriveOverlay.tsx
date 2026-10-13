"use client";

import { type CSSProperties, type PointerEvent, useEffect, useSyncExternalStore } from "react";
import { carOSStore, getCarOS } from "@/lib/car/os";
import {
  drive,
  driveStore,
  forceLeaveRide,
  leaveRide,
  pickScreen,
  setView,
  toggleView,
  TRANSPORT_MS,
  VEHICLE_DISTRICT,
} from "@/lib/drive";
import { useMediaQuery } from "@/lib/hooks";
import { THEMES } from "@/lib/themes";
import { useExperience } from "@/components/experience/ExperienceProvider";

type PadButton = "up" | "down" | "left" | "right" | "a" | "b" | "fire" | "use" | "enter" | "escape";

/** Where a pointer event lands on the console screen (null when it misses). */
function onScreen(event: PointerEvent<HTMLElement>) {
  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = -(event.clientY / window.innerHeight) * 2 + 1;
  return pickScreen(x, y);
}

function blurAfterClick(event: { currentTarget: HTMLElement }) {
  // Keep the keyboard for the games (Space or Enter would press the button again)
  event.currentTarget.blur();
}

/**
 * Everything on top of the 3D view while riding (the desert car or the sky taxi):
 * the transport effect, the buttons to leave or look around,
 * the control hints, a touch pad on phones, and the keyboard routing.
 */
export function DriveOverlay() {
  const { t, lang, theme } = useExperience();
  const { phase, view, vehicle } = useSyncExternalStore(
    driveStore.subscribe,
    driveStore.getSnapshot,
    driveStore.getServerSnapshot,
  );
  const os = useSyncExternalStore(carOSStore.subscribe, carOSStore.getSnapshot, carOSStore.getServerSnapshot);
  const touch = useMediaQuery("(pointer: coarse)");
  const active = phase !== "off";
  const vocab = t.drive.vehicles[vehicle];

  // Each ride belongs to its district: travelling elsewhere drops you out
  useEffect(() => {
    if (drive.phase !== "off" && theme !== VEHICLE_DISTRICT[drive.vehicle]) forceLeaveRide();
  }, [theme]);

  useEffect(() => {
    if (active) getCarOS().lang = lang;
  }, [active, lang]);

  // Keyboard: while in the car, keys go to the console first
  useEffect(() => {
    if (!active) return;
    const carOS = getCarOS();
    const onKey = (event: KeyboardEvent) => {
      const down = event.type === "keydown";
      if (drive.phase !== "inside") {
        // Swallow game keys during the transport so the page does not scroll
        if (/^(Arrow|Space|Page|Home|End)/.test(event.code)) event.preventDefault();
        return;
      }
      if (event.metaKey) return; // browser shortcuts stay the browser's
      const doomOn = carOS.mode === "doom";
      if (down && !event.repeat && !doomOn) {
        if (event.code === "KeyV") {
          toggleView();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.code === "Escape" && carOS.mode !== "game") {
          leaveRide();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      if (event.ctrlKey && !doomOn) return;
      if (carOS.key(event.code, down, event.repeat)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onBlur = () => carOS.releaseAll();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
      carOS.releaseAll();
    };
  }, [active]);

  if (!active) return null;

  const transporting = phase === "entering" || phase === "leaving";
  const playingDoom = os.mode === "doom" && os.doom === "ready";
  const hintKey =
    os.mode === "doom"
      ? playingDoom
        ? "doom"
        : "doomLoading"
      : os.mode === "game"
        ? (os.app ?? "menu")
        : os.mode === "menu"
          ? "menu"
          : "boot";
  // The view and menu hints depend on the vehicle
  const base = t.drive.hints[hintKey] ?? [];
  const extra: [string, string][] = hintKey === "menu" ? [["V", vocab.view]] : hintKey === "doom" ? [["`", vocab.menu]] : [];
  const hints = view === "screen" || hintKey === "doom" ? [...base, ...extra] : [];

  const onPointer = (kind: "down" | "move" | "up") => (event: PointerEvent<HTMLDivElement>) => {
    if (drive.phase !== "inside") return;
    const point = onScreen(event);
    const carOS = getCarOS();
    if (kind === "down") {
      if (point) {
        event.currentTarget.setPointerCapture(event.pointerId);
        carOS.pointer("down", point.x, point.y);
      } else if (drive.view === "road") {
        // Click anywhere while looking at the road: look back at the screen
        setView("screen", true);
      }
      return;
    }
    if (kind === "move") {
      if (point) carOS.pointer("move", point.x, point.y);
      return;
    }
    carOS.pointer("up", point?.x ?? -1, point?.y ?? -1);
  };

  const pad = (name: PadButton) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      getCarOS().button(name, true);
    },
    onPointerUp: () => getCarOS().button(name, false),
    onPointerCancel: () => getCarOS().button(name, false),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });

  return (
    <div
      className="drive"
      data-phase={phase}
      data-view={view}
      data-mode={os.mode}
      style={{ "--transport": `${TRANSPORT_MS}ms` } as CSSProperties}
    >
      <div
        className="drive__hit"
        onPointerDown={onPointer("down")}
        onPointerMove={onPointer("move")}
        onPointerUp={onPointer("up")}
        onPointerCancel={onPointer("up")}
      />

      {phase === "inside" && (
        <>
          <div className="drive__bar">
            <p className="drive__badge">
              <span className="drive__dot" aria-hidden="true" />
              {vocab.name} · {t.drive.autopilot}
            </p>
            <div className="drive__actions">
              {os.mode === "doom" && (
                <button
                  type="button"
                  className="drive__button"
                  onClick={(event) => {
                    getCarOS().toMenu();
                    blurAfterClick(event);
                  }}
                >
                  {vocab.menu} <kbd>`</kbd>
                </button>
              )}
              <button
                type="button"
                className="drive__button"
                onClick={(event) => {
                  toggleView();
                  blurAfterClick(event);
                }}
              >
                {view === "screen" ? vocab.lookOut : t.drive.lookScreen}
                {os.mode !== "doom" && <kbd>V</kbd>}
              </button>
              <button
                type="button"
                className="drive__button drive__button--leave"
                onClick={(event) => {
                  blurAfterClick(event);
                  leaveRide();
                }}
              >
                {vocab.leave}
                {os.mode !== "doom" && os.mode !== "game" && <kbd>Esc</kbd>}
              </button>
            </div>
          </div>

          {!touch && hints.length > 0 && (
            <ul className="drive__hints" aria-label={t.drive.controls}>
              {hints.map(([keys, label]) => (
                <li key={label}>
                  {keys && <kbd>{keys}</kbd>}
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          )}

          {os.mode === "doom" && (
            <p className="drive__credit">
              {t.drive.doomCredit} ·{" "}
              <a href="/games/doom/README.txt" target="_blank" rel="noopener noreferrer">
                {t.drive.doomSource}
              </a>
            </p>
          )}

          {touch && view === "screen" && (
            <div className="drive__pad" data-doom={playingDoom || undefined}>
              <div className="drive__dpad">
                <button type="button" className="drive__key drive__key--up" aria-label="Up" {...pad("up")} />
                <button type="button" className="drive__key drive__key--left" aria-label="Left" {...pad("left")} />
                <button type="button" className="drive__key drive__key--right" aria-label="Right" {...pad("right")} />
                <button type="button" className="drive__key drive__key--down" aria-label="Down" {...pad("down")} />
              </div>
              <div className="drive__ab">
                {playingDoom ? (
                  <>
                    <button type="button" className="drive__key drive__key--round" {...pad("escape")}>
                      {t.drive.touch.menu}
                    </button>
                    <button type="button" className="drive__key drive__key--round" {...pad("enter")}>
                      {t.drive.touch.ok}
                    </button>
                    <button type="button" className="drive__key drive__key--round" {...pad("use")}>
                      {t.drive.touch.use}
                    </button>
                    <button type="button" className="drive__key drive__key--round drive__key--main" {...pad("fire")}>
                      {t.drive.touch.fire}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="drive__key drive__key--round" {...pad("b")}>
                      {t.drive.touch.back}
                    </button>
                    <button type="button" className="drive__key drive__key--round drive__key--main" {...pad("a")}>
                      {t.drive.touch.ok}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {transporting && (
        <div className="drive-fx" key={phase} data-dir={phase === "entering" ? "in" : "out"} role="status">
          <div className="drive-fx__bands" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
          <div className="drive-fx__center">
            <p className="drive-fx__label">{phase === "entering" ? t.drive.linking : t.drive.unlinking}</p>
            <p className="drive-fx__name">{phase === "entering" ? vocab.name : THEMES[theme].code}</p>
            <div className="drive-fx__bar" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
