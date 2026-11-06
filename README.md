# Bernardo's portfolio

A cyberpunk portfolio built with Next.js, React Three Fiber and GSAP. The background is a live 3D world with four districts visitors can travel between:

- **Megacity**: rain, towers, neon signs and flying traffic over a wet street
- **Synth Desert**: a neon highway into a striped sun, with wireframe mountains
- **Data Ocean**: glowing waves, code-rain towers and a holographic moon
- **Redline**: a night race circuit with floodlights, a grandstand and cars lapping as light trails. It is a separate place with its own page, one lap of the track, with REV-BENCH, the project on the dyno. It has no music for now: the song fades out while you're there

The site is available in English and Portuguese.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Edit your content

Almost everything you will want to change lives in **`lib/content.ts`**: your intro, bio, skills, projects, journey and links. Each text has an English (`en`) and Portuguese (`pt`) version.

Redline's page reads `revBench` from the same file (the project on the dyno: its status, how many roadmap stages are done, the phases ahead, what works today and its dyno numbers). Update `revBench.stages` and `revBench.updated` as the project moves along. To give Redline a song, set `redlineMusic.src` to a file in `public/music/`.

Interface text (menu labels, buttons, the terminal) is in `lib/i18n.ts`.

## Where things are

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Puts the page together |
| `app/globals.css` | All the styles, including the colors of each district |
| `components/sections/` | Hero, About, Skills, Work, Journey, Contact, Footer, and the Redline page |
| `components/ui/` | Top bar, district switcher, boot screen, cursor, HUD |
| `components/three/` | The 3D world and the four district scenes (Redline's circuit is in `scenes/redline/`) |
| `lib/themes.ts` | District colors used by the 3D scenes |
| `lib/redline.ts` | Redline's lap: the stops the page and the 3D camera share |
| `lib/drive.ts`, `lib/car/` | The secret car ride: its states, the cabin layout, the console OS, its games and DOOM |
| `components/drive/` | The page side of the road sign, and everything shown on top of the 3D view while riding |
| `components/three/scenes/desert/` | The 3D car (cabin, mirrors), the traffic and the EXIT 77 sign |

## Keyboard shortcuts

Press `1` to `4` to travel between districts. The terminal in the Contact section accepts commands too; type `help`.

## The secret rides

In the Synth Desert, an **EXIT 77** sign keeps coming by on the side of the highway. Click it (or type `drive` in the terminal) and you are inside one of the cars, cruising in the left lane with the traffic. You take in the cockpit and the road for a few seconds, then the driver turns to the console screen, which runs NV-77 OS: Night Racer, Neon Snake, Synth Breaker, a radio button for the music, and the original DOOM. The mirrors show the road behind you, the gates you passed and the lights of the cars following.

In the Megacity, a **SKY TAXI** board hangs off a tower on the right of the avenue, bulbs chasing around its edge. Click it (or type `taxi` or `fly`) and you are in the pilot's seat of a small ship, in the spirit of No Man's Sky: a bubble canopy, a holographic head-up display, radar and systems displays, a flight stick. You fly between the towers in a lane of sky traffic, at the same height and speed as the ships around you, while the city flows past. The console screen is the same NV-77 OS, DOOM included.

DOOM is id Software's Linux DOOM 1.10 source (GPL-2.0), compiled to WebAssembly by Cornelius Diekmann, with the free shareware Episode 1 built in. It only downloads when someone picks it. Credits and source links are in `public/games/doom/README.txt`.

## Deploy

Every push to `main` deploys automatically on Vercel.

Fonts: Tektur and Martian Mono, both under the SIL Open Font License (see `app/fonts/`).
