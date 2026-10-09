"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { profile } from "@/lib/content";
import { lockScroll, onScrollProgress, scrollToTarget } from "@/lib/scroll";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CloseIcon, LogoMark, MenuIcon } from "./Icons";
import { LangSwitch } from "./LangSwitch";

export const SECTION_IDS = ["about", "skills", "work", "journey", "contact"] as const;
type SectionId = (typeof SECTION_IDS)[number];

/** Highlights the nav link of the section currently in view. */
function useActiveSection() {
  const [active, setActive] = useState<SectionId | null>(null);
  useEffect(() => {
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
  }, []);
  return active;
}

export function TopBar() {
  const { t } = useExperience();
  const active = useActiveSection();
  const [menuOpen, setMenuOpen] = useState(false);
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
    if (!menuOpen) return;
    lockScroll(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      lockScroll(false);
    };
  }, [menuOpen]);

  const goTo = (id: string) => {
    setMenuOpen(false);
    // Wait a frame so the scroll lock from the menu is released first
    requestAnimationFrame(() => scrollToTarget(`#${id}`));
  };

  return (
    <header ref={headerRef} className="topbar" data-menu={menuOpen ? "open" : "closed"}>
      <a
        className="skip-link"
        href="#main"
        onClick={() => document.getElementById("main")?.focus({ preventScroll: true })}
      >
        {t.skipToContent}
      </a>
      <a
        className="topbar__brand"
        href="#top"
        onClick={(event) => {
          event.preventDefault();
          goTo("top");
        }}
      >
        <LogoMark size={28} />
        <span className="topbar__name">{profile.name}</span>
      </a>

      <nav className="topbar__nav" aria-label="Main">
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
        <button
          type="button"
          className="topbar__menu-button"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          <span className="sr-only">{menuOpen ? t.nav.close : t.nav.menu}</span>
        </button>
      </div>

      <div id="mobile-menu" className="mobile-menu" hidden={!menuOpen}>
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
