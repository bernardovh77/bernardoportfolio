# Bernardo's portfolio

A cyberpunk portfolio built with Next.js, React Three Fiber and GSAP. The background is a live 3D world with three districts visitors can travel between:

- **Megacity**: rain, towers, neon signs and flying traffic over a wet street
- **Synth Desert**: a neon highway into a striped sun, with wireframe mountains
- **Data Ocean**: glowing waves, code-rain towers and a holographic moon

The site is available in English and Portuguese.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Edit your content

Almost everything you will want to change lives in **`lib/content.ts`**: your intro, bio, skills, projects, journey and links. Each text has an English (`en`) and Portuguese (`pt`) version.

Interface text (menu labels, buttons, the terminal) is in `lib/i18n.ts`.

## Where things are

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Puts the page together |
| `app/globals.css` | All the styles, including the colors of each district |
| `components/sections/` | Hero, About, Skills, Work, Journey, Contact, Footer |
| `components/ui/` | Top bar, district switcher, boot screen, cursor, HUD |
| `components/three/` | The 3D world and the three district scenes |
| `lib/themes.ts` | District colors used by the 3D scenes |

## Keyboard shortcuts

Press `1`, `2` or `3` to travel between districts. The terminal in the Contact section accepts commands too; type `help`.

## Deploy

Every push to `main` deploys automatically on Vercel.

Fonts: Tektur and Martian Mono, both under the SIL Open Font License (see `app/fonts/`).
