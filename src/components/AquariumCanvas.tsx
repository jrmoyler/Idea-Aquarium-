import { useEffect, useRef } from "react";
import type { Idea, ViewMode } from "../types";
import { Organism, Simulation } from "../lib/simulation";
import { lighten, PALETTE, rgba } from "../lib/color";
import { clamp, distance } from "../lib/utils";

interface AquariumCanvasProps {
  ideas: Idea[];
  selectedId: string | null;
  matchingIds: Set<string>;
  filtersActive: boolean;
  mode: ViewMode;
  onSelect: (id: string | null) => void;
  onHybrid: (a: Idea, b: Idea) => void;
}

const MERGE_RANGE = 70;
const DRAG_THRESHOLD = 5;
const TRAIL_LEN = 16;

interface AmbientParticle {
  x: number;
  y: number;
  z: number; // depth 0..1 -> size & speed
  drift: number;
}

export function AquariumCanvas({
  ideas,
  selectedId,
  matchingIds,
  filtersActive,
  mode,
  onSelect,
  onHybrid,
}: AquariumCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);

  // Mutable refs read inside the animation loop (avoid re-creating the loop).
  const selectedRef = useRef<string | null>(selectedId);
  const matchingRef = useRef<Set<string>>(matchingIds);
  const filtersActiveRef = useRef<boolean>(filtersActive);
  const modeRef = useRef<ViewMode>(mode);
  const onSelectRef = useRef(onSelect);
  const onHybridRef = useRef(onHybrid);

  // Interaction state.
  const hoverIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    org: Organism;
    moved: boolean;
    downX: number;
    downY: number;
  } | null>(null);
  const mergeCandidateRef = useRef<Organism | null>(null);
  const trailsRef = useRef<Map<string, number[]>>(new Map());
  const particlesRef = useRef<AmbientParticle[]>([]);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    matchingRef.current = matchingIds;
  }, [matchingIds]);
  useEffect(() => {
    filtersActiveRef.current = filtersActive;
  }, [filtersActive]);
  useEffect(() => {
    modeRef.current = mode;
    simRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onHybridRef.current = onHybrid;
  });

  // Reconcile organisms when the idea list changes (spawn / promote).
  useEffect(() => {
    simRef.current?.reconcile(ideas);
  }, [ideas]);

  // Main setup: simulation, animation loop, listeners, resize. Runs once.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = container.clientWidth;
    let height = container.clientHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const applySize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize();

    if (!simRef.current) {
      simRef.current = new Simulation(ideas, { width, height, mode });
    } else {
      simRef.current.resize(width, height);
    }
    const sim = simRef.current;

    // Seed ambient dust.
    if (particlesRef.current.length === 0) {
      const count = 70;
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        drift: Math.random() * Math.PI * 2,
      }));
    }

    const ro = new ResizeObserver(() => {
      applySize();
      sim.resize(width, height);
    });
    ro.observe(container);

    // ---- Pointer interaction ----
    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      const { x, y } = getPos(e);
      const hit = sim.hitTest(x, y);
      if (hit) {
        dragRef.current = { org: hit, moved: false, downX: x, downY: y };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic / unsupported pointer — drag still tracked via window */
        }
      } else {
        onSelectRef.current(null);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = getPos(e);
      const drag = dragRef.current;
      if (drag) {
        if (distance(x, y, drag.downX, drag.downY) > DRAG_THRESHOLD) {
          drag.moved = true;
        }
        drag.org.x = clamp(x, 12, width - 12);
        drag.org.y = clamp(y, 12, height - 12);
        drag.org.vx = 0;
        drag.org.vy = 0;
        // Find a merge candidate within range.
        const near = sim.nearestTo(drag.org, MERGE_RANGE);
        if (mergeCandidateRef.current && mergeCandidateRef.current !== near) {
          mergeCandidateRef.current.mergeGlow = 0;
        }
        mergeCandidateRef.current = near;
        canvas.style.cursor = "grabbing";
      } else {
        const hit = sim.hitTest(x, y);
        hoverIdRef.current = hit ? hit.idea.id : null;
        canvas.style.cursor = hit ? "pointer" : "default";
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        if (!drag.moved) {
          // Treat as a click -> select.
          onSelectRef.current(drag.org.idea.id);
        } else {
          const cand = mergeCandidateRef.current;
          if (cand && distance(drag.org.x, drag.org.y, cand.x, cand.y) <= MERGE_RANGE) {
            onSelectRef.current(drag.org.idea.id);
            onHybridRef.current(drag.org.idea, cand.idea);
          }
        }
      }
      if (mergeCandidateRef.current) {
        mergeCandidateRef.current.mergeGlow = 0;
        mergeCandidateRef.current = null;
      }
      dragRef.current = null;
      canvas.style.cursor = "default";
    };

    const onPointerLeave = () => {
      hoverIdRef.current = null;
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // ---- Animation loop ----
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      let dt = (now - last) / 16.667;
      last = now;
      dt = clamp(dt, 0, 3);

      const dragged = dragRef.current?.org.idea.id ?? null;
      sim.step(dt, selectedRef.current, dragged);

      draw(
        ctx,
        sim,
        {
          width,
          height,
          dt,
          now,
          selectedId: selectedRef.current,
          hoverId: hoverIdRef.current,
          mergeCandidate: mergeCandidateRef.current,
          draggedId: dragged,
          matching: matchingRef.current,
          filtersActive: filtersActiveRef.current,
        },
        trailsRef.current,
        particlesRef.current,
      );

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full drag-none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface DrawState {
  width: number;
  height: number;
  dt: number;
  now: number;
  selectedId: string | null;
  hoverId: string | null;
  mergeCandidate: Organism | null;
  draggedId: string | null;
  matching: Set<string>;
  filtersActive: boolean;
}

function draw(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  s: DrawState,
  trails: Map<string, number[]>,
  particles: AmbientParticle[],
) {
  const { width, height, now } = s;

  // Base wash.
  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, width, height, now);
  paintParticles(ctx, particles, width, height, s.dt);
  paintSynergyLinks(ctx, sim, s);

  // Ease transient render states toward targets.
  for (const o of sim.organisms) {
    const isHover = o.idea.id === s.hoverId;
    const isSelected = o.idea.id === s.selectedId;
    o.hover += ((isHover ? 1 : 0) - o.hover) * 0.18;
    o.selectGlow += ((isSelected ? 1 : 0) - o.selectGlow) * 0.12;
    if (o.mergeGlow > 0 && o !== s.mergeCandidate) {
      o.mergeGlow *= 0.9;
      if (o.mergeGlow < 0.01) o.mergeGlow = 0;
    }
    if (o === s.mergeCandidate) {
      o.mergeGlow += (1 - o.mergeGlow) * 0.2;
    }
  }

  // Draw non-selected first, selected last (on top, cinematic).
  const ordered = [...sim.organisms].sort((a, b) => {
    const av = a.idea.id === s.selectedId ? 1 : a.hover;
    const bv = b.idea.id === s.selectedId ? 1 : b.hover;
    return av - bv;
  });

  for (const o of ordered) {
    const dimmed =
      s.filtersActive && s.matching.size > 0 && !s.matching.has(o.idea.id);
    drawOrganism(ctx, o, s, dimmed, trails);
  }

  paintVignette(ctx, width, height);
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
) {
  // Deep vertical gradient.
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#060C1E");
  base.addColorStop(0.55, "#050A18");
  base.addColorStop(1, "#03060F");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Teal light from above, slowly breathing.
  const breath = 0.5 + 0.5 * Math.sin(now * 0.0004);
  const topGlow = ctx.createRadialGradient(
    w * 0.5,
    -h * 0.2,
    0,
    w * 0.5,
    -h * 0.2,
    h * 1.1,
  );
  topGlow.addColorStop(0, rgba(PALETTE.teal, 0.1 + breath * 0.05));
  topGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, w, h);

  // Warm amber undercurrent near the floor.
  const floorGlow = ctx.createRadialGradient(
    w * 0.5,
    h * 1.15,
    0,
    w * 0.5,
    h * 1.15,
    h * 0.9,
  );
  floorGlow.addColorStop(0, rgba(PALETTE.amber, 0.06));
  floorGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floorGlow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Faint horizontal depth bands.
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < 5; i++) {
    const y = (h / 5) * i;
    ctx.fillStyle = rgba("#8FA0BF", 0.015);
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}

function paintParticles(
  ctx: CanvasRenderingContext2D,
  particles: AmbientParticle[],
  w: number,
  h: number,
  dt: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    p.drift += 0.01 * dt;
    p.y -= (0.05 + p.z * 0.18) * dt;
    p.x += Math.sin(p.drift) * 0.15 * dt;
    if (p.y < -4) {
      p.y = h + 4;
      p.x = Math.random() * w;
    }
    if (p.x < -4) p.x = w + 4;
    if (p.x > w + 4) p.x = -4;
    const r = 0.4 + p.z * 1.6;
    ctx.fillStyle = rgba(PALETTE.teal, 0.05 + p.z * 0.12);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintSynergyLinks(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  s: DrawState,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1;
  for (const o of sim.organisms) {
    if (o.synergyFactor < 0.6) continue;
    for (const id of o.idea.adjacentNodes) {
      const t = sim.getById(id);
      if (!t) continue;
      // draw each pair once
      if (o.idea.id > t.idea.id) continue;
      const d = distance(o.x, o.y, t.x, t.y);
      if (d > 300) continue;
      const near =
        o.idea.id === s.selectedId ||
        t.idea.id === s.selectedId ||
        o.idea.id === s.hoverId ||
        t.idea.id === s.hoverId;
      const strength = (1 - d / 300) * (near ? 0.5 : 0.16);
      ctx.strokeStyle = rgba(PALETTE.teal, strength * o.synergyFactor);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawOrganism(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  s: DrawState,
  dimmed: boolean,
  trails: Map<string, number[]>,
) {
  const idea = o.idea;
  const baseAlpha = dimmed ? 0.16 : 1;
  const pulse = 1 + Math.sin(o.pulsePhase) * 0.04 * o.joyFactor;
  const r = o.radius * pulse;
  const focus = o.selectGlow;
  const hover = o.hover;
  const merge = o.mergeGlow;

  // ---- Trail ----
  const trail = trails.get(idea.id) ?? [];
  trail.push(o.x, o.y);
  while (trail.length > TRAIL_LEN * 2) trail.splice(0, 2);
  trails.set(idea.id, trail);

  if (!dimmed && o.idea.status !== "dormant") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < trail.length - 2; i += 2) {
      const t = i / trail.length;
      const tr = r * 0.18 * t;
      ctx.fillStyle = rgba(o.baseColor, 0.05 * t * baseAlpha);
      ctx.beginPath();
      ctx.arc(trail[i], trail[i + 1], Math.max(tr, 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(o.x, o.y);

  // ---- Outer halo (joy + states) ----
  const haloR =
    r * (1.9 + o.joyFactor * 0.6 + focus * 1.2 + hover * 0.35 + merge * 0.9);
  const dormantDim = o.idea.status === "dormant" ? 0.55 : 1;
  const haloA =
    (0.26 + o.joyFactor * 0.1 + focus * 0.28 + hover * 0.12) *
    baseAlpha *
    dormantDim;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const haloColor = merge > 0.05 ? PALETTE.amberGlow : o.baseColor;
  const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, haloR);
  halo.addColorStop(0, rgba(haloColor, haloA));
  halo.addColorStop(0.45, rgba(haloColor, haloA * 0.4));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- Orbiting rings (complexity = denser, slower) ----
  const ringCount = 1 + Math.round((idea.complexity / 100) * 2);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < ringCount; i++) {
    const rr = r * (1.18 + i * 0.22);
    const rot = o.spinPhase * (i % 2 === 0 ? 1 : -1) + i;
    ctx.strokeStyle = rgba(o.baseColor, (0.16 + hover * 0.18 + focus * 0.2) * baseAlpha);
    ctx.lineWidth = 1;
    const arc = Math.PI * (0.9 + (i % 2) * 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, rr, rot, rot + arc);
    ctx.stroke();
  }
  ctx.restore();

  // ---- Soft body ----
  // Squash slightly along velocity for an organic glide.
  const speed = Math.hypot(o.vx, o.vy);
  const angle = Math.atan2(o.vy, o.vx);
  ctx.save();
  ctx.rotate(angle);
  const squash = 1 + Math.min(speed * 0.18, 0.22);
  ctx.scale(squash, 1 / squash);

  const body = ctx.createRadialGradient(
    -r * 0.28,
    -r * 0.28,
    r * 0.05,
    0,
    0,
    r,
  );
  // Luminous, translucent body — glows in its own hue rather than going dark.
  body.addColorStop(0, rgba(lighten(o.baseColor, 0.45), 0.92 * baseAlpha));
  body.addColorStop(0.5, rgba(o.baseColor, 0.62 * baseAlpha));
  body.addColorStop(1, rgba(o.baseColor, 0.1 * baseAlpha));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim light.
  ctx.strokeStyle = rgba(
    merge > 0.05 ? PALETTE.amberGlow : o.baseColor,
    (0.5 + hover * 0.4 + focus * 0.4 + merge * 0.5) * baseAlpha,
  );
  ctx.lineWidth = 1.2 + focus * 0.8 + merge;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore(); // undo rotate/scale

  // ---- Inner core ----
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const coreR = r * (0.5 + o.joyFactor * 0.08);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  core.addColorStop(0, rgba(lighten(o.baseColor, 0.75), 0.85 * baseAlpha));
  core.addColorStop(0.5, rgba(lighten(o.baseColor, 0.2), 0.25 * baseAlpha));
  core.addColorStop(1, rgba(o.baseColor, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- Novelty particles ----
  if (idea.novelty > 70 && !dimmed) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pc = 3 + Math.round((idea.novelty - 70) / 12);
    for (let i = 0; i < pc; i++) {
      const a = o.spinPhase * 1.6 + (i / pc) * Math.PI * 2;
      const orbit = r * (1.45 + Math.sin(o.pulsePhase + i) * 0.12);
      const px = Math.cos(a) * orbit;
      const py = Math.sin(a) * orbit;
      ctx.fillStyle = rgba(PALETTE.tealGlow, 0.5 * baseAlpha);
      ctx.beginPath();
      ctx.arc(px, py, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Cinematic focus brackets ----
  if (focus > 0.02) {
    drawFocusFrame(ctx, r, focus, s.now);
  }

  ctx.restore();

  // ---- Label (hover / selected) ----
  if ((hover > 0.05 || focus > 0.05) && !dimmed) {
    drawLabel(ctx, o, r, Math.max(hover, focus));
  }
}

function drawFocusFrame(
  ctx: CanvasRenderingContext2D,
  r: number,
  focus: number,
  now: number,
) {
  const fr = r * 1.95 + 6;
  ctx.save();
  ctx.globalAlpha = focus;
  ctx.rotate(now * 0.0003);
  ctx.strokeStyle = rgba(PALETTE.teal, 0.6);
  ctx.lineWidth = 1.2;
  const seg = Math.PI * 0.18;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(0, 0, fr, a - seg, a + seg);
    ctx.stroke();
  }
  ctx.restore();

  // Pulsing thin ring.
  ctx.save();
  const p = 0.5 + 0.5 * Math.sin(now * 0.004);
  ctx.globalAlpha = focus * (0.3 + p * 0.4);
  ctx.strokeStyle = rgba(PALETTE.tealGlow, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, fr + 5 + p * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  r: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.font =
    "500 12px 'Space Grotesk', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = o.idea.name;
  const ty = o.y - r - 16;

  const metrics = ctx.measureText(label);
  const padX = 8;
  const boxW = metrics.width + padX * 2;
  const boxH = 20;
  ctx.fillStyle = rgba("#03060F", 0.7);
  roundRect(ctx, o.x - boxW / 2, ty - boxH / 2, boxW, boxH, 5);
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.teal, 0.25);
  ctx.lineWidth = 1;
  roundRect(ctx, o.x - boxW / 2, ty - boxH / 2, boxW, boxH, 5);
  ctx.stroke();

  ctx.fillStyle = "#D7E0F0";
  ctx.fillText(label, o.x, ty + 0.5);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paintVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const v = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    Math.min(w, h) * 0.35,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.75,
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(2,4,10,0.7)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
