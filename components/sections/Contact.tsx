"use client";

import { useEffect, useRef, useState } from "react";
import { links } from "@/lib/content";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CheckIcon, CodeIcon, CopyIcon, MailIcon, ProfileIcon } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { Terminal } from "./Terminal";

export function Contact() {
  const { t } = useExperience();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(links.email);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${links.email}`;
    }
  };

  return (
    <section id="contact" className="section contact" aria-labelledby="contact-title">
      <div className="container contact__grid">
        <div className="contact__copy">
          <ScrambleText
            as="h2"
            id="contact-title"
            className="contact__title"
            text={t.contact.title}
          />
          <p className="section-intro">{t.contact.intro}</p>
          <div className="contact__actions">
            <a className="btn btn--primary" href={`mailto:${links.email}`}>
              <MailIcon size={18} />
              <span>{t.contact.email}</span>
            </a>
            <button type="button" className="btn btn--ghost" onClick={copy} aria-live="polite">
              {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
              <span>{copied ? t.contact.copied : t.contact.copy}</span>
            </button>
          </div>
          <ul className="contact__links">
            <li>
              <a href={links.github} target="_blank" rel="noreferrer">
                <CodeIcon size={18} />
                <span>GitHub</span>
              </a>
            </li>
            <li>
              <a href={links.linkedin} target="_blank" rel="noreferrer">
                <ProfileIcon size={18} />
                <span>LinkedIn</span>
              </a>
            </li>
          </ul>
        </div>
        <Terminal />
      </div>
    </section>
  );
}
