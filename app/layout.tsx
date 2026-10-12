import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { preferencesInitScript } from "@/lib/preferences";
import "./globals.css";

// Display face: angular, with a width axis we animate (the "neon sign" in the hero)
const tektur = localFont({
  src: "./fonts/tektur-variable.woff2",
  variable: "--font-tektur",
  weight: "400 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "75% 100%" }],
});

// Interface and body face
const martian = localFont({
  src: "./fonts/martian-mono-variable.woff2",
  variable: "--font-martian",
  weight: "100 800",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "75% 112.5%" }],
});

export const metadata: Metadata = {
  title: "Bernardo | Fullstack Developer",
  description:
    "Portfolio of Bernardo, a fullstack developer and Computer Science student. Explore four 3D districts, from neon streets to the foundry underneath.",
};

export const viewport: Viewport = {
  themeColor: "#04060f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="city"
      data-lang="en"
      className={`${tektur.variable} ${martian.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
