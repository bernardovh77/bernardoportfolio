# Bernardo's portfolio

A cyberpunk portfolio built with Next.js, React Three Fiber and GSAP. The background is a live 3D world with four districts visitors can travel between:

- **Megacity**: rain, towers, neon signs and flying traffic over a wet street
- **Synth Desert**: a neon highway into a striped sun, with wireframe mountains
- **Data Ocean**: glowing waves, code-rain towers and a holographic moon
- **The Underworks**: a foundry shaft under the city, full of smog, gears, sparks and failing lights, with a pool of molten metal at the bottom. It is a separate place with its own page: only the projects still under development, each one next to its construction site

The site is available in English and Portuguese.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Edit your content

Almost everything you will want to change lives in **`lib/content.ts`**: your intro, bio, skills, projects, journey and links. Each text has an English (`en`) and Portuguese (`pt`) version.

Projects you are still building go in `wipProjects` (same file). Each one has a status (`blueprint`, `building` or `testing`), a progress from 0 to 100, an ETA and a drawing (`tower`, `dome` or `gear`). Each project gets its own work order in the Underworks and its own construction site in the 3D shaft, built as far as its progress. Add or remove projects and the shaft grows or shrinks with them.

Interface text (menu labels, buttons, the terminal) is in `lib/i18n.ts`.

## Where things are

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Puts the page together |
| `app/globals.css` | All the styles, including the colors of each district |
| `components/sections/` | Hero, About, Skills, Work, Journey, Contact, Footer, and the Underworks page |
| `components/ui/` | Top bar, district switcher, boot screen, cursor, HUD |
| `components/three/` | The 3D world and the four district scenes (the Underworks is split into `scenes/underworks/`) |
| `lib/themes.ts` | District colors used by the 3D scenes |
| `lib/underworks.ts` | Layout shared by the Underworks page and its 3D shaft |

## Keyboard shortcuts

Press `1` to `4` to travel between districts. The terminal in the Contact section accepts commands too; type `help`.

## Deploy

Every push to `main` deploys automatically on Vercel.

Fonts: Tektur and Martian Mono, both under the SIL Open Font License (see `app/fonts/`).
