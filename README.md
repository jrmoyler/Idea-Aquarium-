# Idea Aquarium

**A living habitat for venture concepts.**

Idea Aquarium is a frontend prototype that renders startup ideas, MVPs, and
creative concepts as abstract aquatic organisms swimming in a digital tank. Each
organism's motion, size, glow, and behavior encode strategic traits — synergy,
revenue, joy, complexity, novelty, and momentum — so the ecosystem reads as a
calm, cinematic founder intelligence habitat rather than a cute aquarium.

It feels like the child of Linear, a biotech art installation, and a founder
operating system.

## Stack

- **React + Vite + TypeScript**
- **Tailwind CSS** for the dashboard shell
- **Framer Motion** for interface animation
- **HTML5 Canvas** for the live simulation layer (no game engine)
- Seeded local mock data only — no backend

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build
npm run preview  # preview the production build
npm run lint     # tsc --noEmit
```

## Experience

- **Aquarium viewport (hero):** 16 idea organisms are rendered as soft-bodied,
  bioluminescent deep-sea lifeforms (no geometric primitives). Each strategic
  species maps to a biological body plan — **drifters** (pulsing jellyfish bells
  with trailing tendrils), **swarmers** (twitchy finned larvae), **floaters**
  (fragile glowing sacs), and **hunters** (tapered cephalopods with undulating
  fins and reaching arms). They swim via muscular pulse propulsion + fluid drag,
  wander, separate, and co-drift with related ideas (synergy). Dormant ideas
  sink and dim; high-momentum ideas pulse more often; high-revenue ideas glow
  warmer (internal amber); high-novelty ideas wear stranger silhouettes.
- **Hover** an organism and it reacts like a living thing noticing attention —
  tightening slightly and brightening from within, with a soft label.
- **Click** to select it: a calmer, more luminous "specimen" state while the
  rest of the ecosystem gently recedes. Its dossier opens on the right.
- **Drag** one organism near another and the nearby compatible creature shows
  a behavioral attraction and shared bioluminescent resonance (drifting toward
  its suitor, pulses syncing — no connector line) before surfacing a **hybrid
  candidate** in the panel.
- **Intelligence panel:** a terminal-biotech dossier with trait bars, signals,
  the best adjacent node, mutation vectors, and CTAs (_Promote to Build Queue_,
  _Crossbreed Idea_). With nothing selected it shows a calm welcome state with
  live ecosystem stats.
- **Control bar:** search, filter chips (High Synergy, Fast to Build, Weird,
  Monetizable, Dormant), a Calm / Active tempo toggle, _Spawn New Idea_, and
  ecosystem metrics.

## Project structure

```
src/
  main.tsx                 App entry
  App.tsx                  State, layout, ecosystem metrics
  types.ts                 Domain types
  index.css                Tailwind layers + base styling
  data/
    ideas.ts               16 seeded venture concepts
  lib/
    simulation.ts          Soft-body ecosystem (pulse propulsion, drag, schooling)
    organisms.ts           Biological canvas renderer (membranes, tendrils, glow)
    organism-profile.ts    Deterministic creature "anatomy" grown from traits
    noise.ts               Procedural value noise for organic deformation
    color.ts               Palette + color math (hex/rgb, mix, lighten)
    utils.ts               Math, seeded RNG, angle lerp, filters, search
    hybrid.ts              Crossbreed generator
    spawn.ts               New-idea generator for "Spawn New Idea"
  components/
    Header.tsx             Top control bar
    AquariumCanvas.tsx     Scene composition + interaction + rAF loop
    IdeaPanel.tsx          Right intelligence panel (welcome + dossier)
    MetricPill.tsx         Compact metric readout
    FilterChip.tsx         Toggleable filter chip
```

## Design language

- Deep navy `#050A18`, electric teal `#00D9B5`, amber gold `#D4A843`
- Space Grotesk throughout
- Restrained glass, precise hairlines, subtle glow, strong spacing rhythm
- Darkness and contrast over decoration — the tank is the hero

## Extending

- Add ideas in `src/data/ideas.ts` (they join the tank automatically).
- Tune behavior in `src/lib/simulation.ts` (pulse cadence, thrust, drag, schooling).
- Reshape creatures in `src/lib/organism-profile.ts` (anatomy from traits) and
  `src/lib/organisms.ts` (membranes, tendrils, internal bioluminescence); the
  palette lives in `src/lib/color.ts`.
- A backend could later replace the seeded data and the `spawn` / `hybrid`
  generators without touching the simulation or UI.
