"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Lang, ui, type UiStrings } from "@/lib/i18n";
import { applyPreferencesToDocument, preferencesStore } from "@/lib/preferences";
import { THEME_IDS, type ThemeId } from "@/lib/themes";
import { TRAVEL_DURATION, TRAVEL_SWAP_AT, world } from "@/lib/world";

type ExperienceValue = {
  /** District currently shown */
  theme: ThemeId;
  lang: Lang;
  /** Interface strings for the current language */
  t: UiStrings;
  /** Destination while a travel transition is running */
  traveling: ThemeId | null;
  travelTo: (theme: ThemeId) => void;
  setLang: (lang: Lang) => void;
};

const ExperienceContext = createContext<ExperienceValue | null>(null);

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const prefs = useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    preferencesStore.getServerSnapshot,
  );
  const [traveling, setTraveling] = useState<ThemeId | null>(null);
  const timers = useRef<number[]>([]);
  const travelingRef = useRef<ThemeId | null>(null);

  // React's dev remount can clear attributes set by the inline script, so re-apply them.
  // Read from the store (not `prefs`), which still holds the server default during hydration.
  useLayoutEffect(() => {
    applyPreferencesToDocument(preferencesStore.getSnapshot());
  }, [prefs]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      world.reducedMotion = media.matches;
      document.documentElement.dataset.motion = media.matches ? "reduced" : "full";
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const travelTo = useCallback((next: ThemeId) => {
    const current = preferencesStore.getSnapshot().theme;
    if (travelingRef.current || next === current) return;

    if (prefersReducedMotion()) {
      preferencesStore.set({ theme: next });
      return;
    }

    travelingRef.current = next;
    setTraveling(next);
    world.travelStart = performance.now();
    timers.current.push(
      window.setTimeout(
        () => preferencesStore.set({ theme: next }),
        TRAVEL_DURATION * TRAVEL_SWAP_AT,
      ),
      window.setTimeout(() => {
        travelingRef.current = null;
        setTraveling(null);
      }, TRAVEL_DURATION),
    );
  }, []);

  const setLang = useCallback((lang: Lang) => {
    preferencesStore.set({ lang });
  }, []);

  // Keyboard shortcuts: the number keys travel between districts (1 = first one)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < THEME_IDS.length) {
        travelTo(THEME_IDS[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [travelTo]);

  const value = useMemo<ExperienceValue>(
    () => ({
      theme: prefs.theme,
      lang: prefs.lang,
      t: ui[prefs.lang],
      traveling,
      travelTo,
      setLang,
    }),
    [prefs, traveling, travelTo, setLang],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside <ExperienceProvider>");
  return value;
}
