import type { SVGProps } from "react";
import type { ThemeId } from "@/lib/themes";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

/** Generic "code" glyph used for source-code links. */
export function CodeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  );
}

/** Generic "profile" glyph used for the professional network link. */
export function ProfileIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 5h18v14H3z" />
      <circle cx="9" cy="11" r="2.2" />
      <path d="M5.5 16.5c.6-1.8 2-2.6 3.5-2.6s2.9.8 3.5 2.6M15 10h3.5M15 13h3.5" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 5h18v14H3z" />
      <path d="m3 6 9 7 9-7" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 9h11v11H9z" />
      <path d="M5 15H4V4h11v1" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v6H4V6h6" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v16" />
      <path d="m6 14 6 6 6-6" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20V4" />
      <path d="m6 10 6-6 6 6" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h10M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Small pictograms for each district, used by the travel dock. */
export function DistrictIcon({ theme, ...props }: IconProps & { theme: ThemeId }) {
  if (theme === "city") {
    return (
      <svg {...base(props)}>
        <path d="M3 21V11h4v10M7 21V5h5v16M12 21V9h4v12M16 21V3h5v18" />
        <path d="M9 8h1M9 11h1M9 14h1M18 6h1M18 9h1M18 12h1" />
      </svg>
    );
  }
  if (theme === "desert") {
    return (
      <svg {...base(props)}>
        <path d="M5 13a7 7 0 0 1 14 0" />
        <path d="M6.5 10h11M5.5 12h13" />
        <path d="M2 16h20M5 19h14M12 16v5" />
      </svg>
    );
  }
  if (theme === "underworks") {
    // A striped road barrier with a warning light on top
    return (
      <svg {...base(props)}>
        <path d="M3 10h18v4.5H3z" />
        <path d="m8 10-2.6 4.5M13 10l-2.6 4.5M18 10l-2.6 4.5" />
        <path d="M6 14.5V20M18 14.5V20M4.5 20h3M16.5 20h3" />
        <path d="M10.2 10V8.4a1.8 1.8 0 0 1 3.6 0V10M12 3.5v1.2M8.6 5l.8.8M15.4 5l-.8.8" />
      </svg>
    );
  }
  return (
    <svg {...base(props)}>
      <circle cx="17" cy="6" r="3" />
      <path d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
      <path d="M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
    </svg>
  );
}

/** The site's mark: a beveled frame around a split "B". */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden focusable={false}>
      <path d="M8 2h22v22l-6 6H2V8z" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M11 8.5h7.2a3.6 3.6 0 0 1 0 7.2H11zM11 15.7h8.3a3.9 3.9 0 0 1 0 7.8H11z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.2 8.5v15" stroke="var(--b)" strokeWidth="1.8" />
    </svg>
  );
}
