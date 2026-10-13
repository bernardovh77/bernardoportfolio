"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useRef } from "react";
import { showPhoto } from "@/lib/drive";
import { useExperience } from "@/components/experience/ExperienceProvider";

/**
 * The photo from the car's pendant or the ship's dash frame, zoomed in from where
 * it was clicked, with a purple heart beside it. Mounted for the whole ride (so the
 * picture is already loaded), shown only while open. A click anywhere or Esc closes it.
 */
export function PhotoView({ open, from }: { open: boolean; from: { x: number; y: number } }) {
  const { t } = useExperience();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button once the dialog is visible (a hidden element can't take
  // focus, and the open style lands with this render), so Enter/Esc/Tab work at once
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const close = () => showPhoto(false);

  return (
    <div
      className="drive-photo"
      data-open={open || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t.drive.photo.label}
      aria-hidden={!open}
      onClick={close}
    >
      <figure className="drive-photo__card" style={{ "--from-x": `${from.x}px`, "--from-y": `${from.y}px` } as CSSProperties}>
        <Image
          className="drive-photo__img"
          src="/images/keepsake.jpg"
          alt={t.drive.photo.alt}
          width={1280}
          height={960}
          loading="eager"
          sizes="(max-width: 720px) 84vw, 64vw"
        />
        <svg className="drive-photo__heart" viewBox="0 0 32 29" aria-hidden="true">
          <path d="M16 28.2C9.4 23.4 1 16.6 1 9.2 1 4.6 4.6 1 9 1c2.9 0 5.4 1.5 7 3.9C17.6 2.5 20.1 1 23 1c4.4 0 8 3.6 8 8.2 0 7.4-8.4 14.2-15 19z" />
        </svg>
      </figure>
      <button
        ref={closeRef}
        type="button"
        className="drive__button drive-photo__close"
        tabIndex={open ? 0 : -1}
        onClick={(event) => {
          event.stopPropagation();
          close();
        }}
      >
        {t.drive.photo.close} <kbd>Esc</kbd>
      </button>
    </div>
  );
}
