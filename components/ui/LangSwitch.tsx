"use client";

import { LANGS } from "@/lib/i18n";
import { useExperience } from "@/components/experience/ExperienceProvider";

/** EN / PT toggle. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useExperience();
  return (
    <div
      className={`lang-switch ${className}`}
      role="group"
      aria-label={t.nav.language}
      data-active={lang}
    >
      <span className="lang-switch__thumb" aria-hidden="true" />
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className="lang-switch__option"
          aria-pressed={lang === code}
          lang={code === "pt" ? "pt-BR" : "en"}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
