# Bernardo's portfolio

A cyberpunk portfolio built with Next.js, React Three Fiber and GSAP. The background is a live 3D world with four districts visitors can travel between:

- **Megacity**: rain, towers, neon signs and flying traffic over a wet street
- **Synth Desert**: a neon highway into a striped sun, with wireframe mountains
- **Data Ocean**: glowing waves, code-rain towers and a holographic moon
- **The Underworks**: a half-built, half-abandoned hall under the city, with failing neon, welding sparks and holograms of projects still being built. While you are here, the Work section shows projects under development

The site is available in English and Portuguese.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Edit your content

Almost everything you will want to change lives in **`lib/content.ts`**: your intro, bio, skills, projects, journey and links. Each text has an English (`en`) and Portuguese (`pt`) version.

Projects you are still building go in `wipProjects` (same file). Each one has a status (`blueprint`, `building` or `testing`), a progress from 0 to 100 and an ETA, and they appear in the Work section while the visitor is in the Underworks.

Interface text (menu labels, buttons, the terminal) is in `lib/i18n.ts`.

## Where things are

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Puts the page together |
| `app/globals.css` | All the styles, including the colors of each district |
| `components/sections/` | Hero, About, Skills, Work, Journey, Contact, Footer |
| `components/ui/` | Top bar, district switcher, boot screen, cursor, HUD |
| `components/three/` | The 3D world and the four district scenes |
| `lib/themes.ts` | District colors used by the 3D scenes |

## Keyboard shortcuts

Press `1` to `4` to travel between districts. The terminal in the Contact section accepts commands too; type `help`.

## Deploy

Every push to `main` deploys automatically on Vercel.

Fonts: Tektur and Martian Mono, both under the SIL Open Font License (see `app/fonts/`).
