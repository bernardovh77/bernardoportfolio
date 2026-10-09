"use client";

import { profile } from "@/lib/content";
import { scrollToTarget } from "@/lib/scroll";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ArrowUpIcon } from "@/components/ui/Icons";

export function Footer() {
  const { t } = useExperience();
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <p>
          © 2026 {profile.name}. {t.footer.built}
        </p>
        <button type="button" className="footer__top" onClick={() => scrollToTarget(0)}>
          <ArrowUpIcon size={16} />
          <span>{t.footer.top}</span>
        </button>
      </div>
    </footer>
  );
}
