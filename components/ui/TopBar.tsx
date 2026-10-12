"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { profile } from "@/lib/content";
import { lockScroll, onScrollProgress, scrollToTarget } from "@/lib/scroll";
import { THEMES } from "@/lib/themes";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ArrowUpIcon, CloseIcon, LogoMark, MenuIcon } from "./Icons";
import { LangSwitch } from "./LangSwitch";

export const SECTION_IDS = ["about", "skills", "work", "journey", "contact"] as const;
type SectionId = (typeof SECTION_IDS)[number];

/** Highlights the nav link of the section currently in view. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<SectionId | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id as SectionId);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5] },
    );
    elements.forEach((el) => observer.observe(el));
    const onTop = () => {
      if (window.scrollY < window.innerHeight * 0.5) setActive(null);
    };
    window.addEventListener("scroll", onTop, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onTop);
    };
  }, [enabled]);
  return active;
}

export function TopBar() {
  const { t, theme, traveling, returnToSurface } = useExperience();
  // Down in the Underworks there are no sections to jump to, only the way back up
  const underworks = theme === "underworks";
  const active = useActiveSection(!underworks);
  const [menuOpen, setMenuOpen] = useState(false);
  const open = menuOpen && !underworks;
  const headerRef = useRef<HTMLElement>(null);

  // Solid background once the page scrolls
  useEffect(() => {
    const update = () => {
      headerRef.current?.toggleAttribute("data-scrolled", window.scrollY > 24);
    };
    update();
    return onScrollProgress(update);
  }, []);

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      lockScroll(false);
    };
  }, [open]);

  const goTo = (id: string) => {
    setMenuOpen(false);
    // Wait a frame so the scroll lock from the menu is released first
    requestAnimationFrame(() => scrollToTarget(`#${id}`));
  };

  return (
    <header ref={headerRef} className="topbar" data-menu={open ? "open" : "closed"}>
      <a
        className="skip-link"
        href="#main"
        onClick={() => document.getElementById("main")?.focus({ preventScroll: true })}
      >
        {t.skipToContent}
      </a>
      <a
        className="topbar__brand"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          setMenuOpen(false);
          requestAnimationFrame(() => scrollToTarget(0));
        }}
      >
        <LogoMark size={28} />
        {underworks ? (
          <span className="topbar__sector">{THEMES.underworks.code}</span>
        ) : (
          <span className="topbar__name">{profile.name}</span>
        )}
      </a>

      <nav className="topbar__nav" aria-label="Main" hidden={underworks}>
        <ul>
          {SECTION_IDS.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="topbar__link"
                aria-current={active === id ? "location" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  goTo(id);
                }}
              >
                {t.nav[id]}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="topbar__tools">
        <LangSwitch />
        {underworks ? (
          <button
            type="button"
            className="topbar__surface"
            onClick={returnToSurface}
            disabled={Boolean(traveling)}
            aria-label={t.underworks.surface}
          >
            <ArrowUpIcon size={16} />
            <span className="topbar__surface-long" aria-hidden="true">
              {t.underworks.surface}
            </span>
            <span className="topbar__surface-short" aria-hidden="true">
              {t.underworks.surfaceShort}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="topbar__menu-button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
            <span className="sr-only">{open ? t.nav.close : t.nav.menu}</span>
          </button>
        )}
      </div>

      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        <nav aria-label="Mobile">
          <ul>
            {SECTION_IDS.map((id, index) => (
              <li key={id} style={{ "--i": index } as CSSProperties}>
                <a
                  href={`#${id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    goTo(id);
                  }}
                >
                  {t.nav[id]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <LangSwitch className="mobile-menu__lang" />
      </div>
    </header>
  );
}
