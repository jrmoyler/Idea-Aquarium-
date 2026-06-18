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

- **Aquarium viewport (hero):** 16 idea organisms drift with steering-lite
  behavior — wander, gentle separation, and synergy-driven cohesion that pulls
  related ideas into loose schools. Dormant ideas sink and laze; high-momentum
  ideas move faster; high-revenue ideas glow warmer (amber); high-novelty ideas
  spawn orbiting particles.
- **Hover** an organism to highlight it with a glow, rings, and a label.
- **Click** to select it and open its dossier (cinematic focus state).
- **Drag** one organism near another to surface a **hybrid candidate** — a
  speculative crossbreed shown in the panel.
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
    simulation.ts          Steering ecosystem (positions, forces, hit-test)
    color.ts               Palette + color math (hex/rgb, mix, lighten)
    utils.ts               Math, seeded RNG, filters, search
    hybrid.ts              Crossbreed generator
    spawn.ts               New-idea generator for "Spawn New Idea"
  components/
    Header.tsx             Top control bar
    AquariumCanvas.tsx     Canvas renderer + interaction + rAF loop
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
- Tune behavior in `src/lib/simulation.ts` (forces, tempo, schooling).
- Adjust visuals in `AquariumCanvas.tsx` (`drawOrganism`) and the palette in
  `src/lib/color.ts`.
- A backend could later replace the seeded data and the `spawn` / `hybrid`
  generators without touching the simulation or UI.
