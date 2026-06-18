import { useEffect, useRef } from "react";
import type { Idea, ViewMode } from "../types";
import { Organism, Simulation } from "../lib/simulation";
import { drawOrganism } from "../lib/organisms";
import { PALETTE, rgba } from "../lib/color";
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

const MERGE_RANGE = 92;
const DRAG_THRESHOLD = 5;

/** Suspended marine snow — drifting particulate, not orbiting decoration. */
interface Mote {
  x: number;
  y: number;
  z: number; // depth 0..1 -> size & speed
  drift: number;
  warm: boolean;
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

  const selectedRef = useRef<string | null>(selectedId);
  const matchingRef = useRef<Set<string>>(matchingIds);
  const filtersActiveRef = useRef<boolean>(filtersActive);
  const modeRef = useRef<ViewMode>(mode);
  const onSelectRef = useRef(onSelect);
  const onHybridRef = useRef(onHybrid);

  const hoverIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    org: Organism;
    moved: boolean;
    downX: number;
    downY: number;
  } | null>(null);
  const mergeCandidateRef = useRef<Organism | null>(null);
  const motesRef = useRef<Mote[]>([]);

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

  useEffect(() => {
    simRef.current?.reconcile(ideas);
  }, [ideas]);

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

    if (motesRef.current.length === 0) {
      const count = 90;
      motesRef.current = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        drift: Math.random() * Math.PI * 2,
        warm: i % 9 === 0,
      }));
    }

    const ro = new ResizeObserver(() => {
      applySize();
      sim.resize(width, height);
    });
    ro.observe(container);

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
          /* synthetic pointer */
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
        mergeCandidateRef.current = sim.nearestTo(drag.org, MERGE_RANGE);
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
          onSelectRef.current(drag.org.idea.id);
        } else {
          const cand = mergeCandidateRef.current;
          if (cand && distance(drag.org.x, drag.org.y, cand.x, cand.y) <= MERGE_RANGE) {
            onSelectRef.current(drag.org.idea.id);
            onHybridRef.current(drag.org.idea, cand.idea);
          }
        }
      }
      mergeCandidateRef.current = null;
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

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      let dt = (now - last) / 16.667;
      last = now;
      dt = clamp(dt, 0, 3);

      const dragged = dragRef.current?.org.idea.id ?? null;
      const mergeId = mergeCandidateRef.current?.idea.id ?? null;
      sim.step(dt, selectedRef.current, dragged, mergeId);

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
        motesRef.current,
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
// Scene composition (atmosphere + creatures). The creatures themselves are
// drawn entirely by the biological renderer in lib/organisms.ts.
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
  motes: Mote[],
) {
  const { width, height, now } = s;

  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, width, height, now);
  paintMarineSnow(ctx, motes, width, height, s.dt);

  const anySelected = s.selectedId !== null;

  // Ease transient render states toward targets — slow easing keeps the
  // ecosystem composed and lifelike.
  for (const o of sim.organisms) {
    const isHover = o.idea.id === s.hoverId;
    const isSelected = o.idea.id === s.selectedId;
    o.hover += ((isHover ? 1 : 0) - o.hover) * 0.12;
    o.selectGlow += ((isSelected ? 1 : 0) - o.selectGlow) * 0.08;

    // Spotlight: when one creature holds focus, the rest gently recede.
    const focused = isSelected || isHover || o.idea.id === s.draggedId;
    const target = !anySelected || focused ? 1 : 0.34;
    o.presence += (target - o.presence) * 0.06;

    // Merge resonance: the candidate and its suitor brighten together — a
    // shared bioluminescent attraction, never a drawn connector.
    const inResonance =
      o === s.mergeCandidate ||
      (s.draggedId === o.idea.id && s.mergeCandidate !== null);
    o.resonance += ((inResonance ? 1 : 0) - o.resonance) * 0.12;

    // Birth flush fades naturally.
    if (o.mergeGlow > 0) {
      o.mergeGlow *= 0.94;
      if (o.mergeGlow < 0.01) o.mergeGlow = 0;
    }
  }

  // Draw recessed creatures first, focused ones last (on top).
  const ordered = [...sim.organisms].sort((a, b) => {
    const av = a.idea.id === s.selectedId ? 2 : a.hover;
    const bv = b.idea.id === s.selectedId ? 2 : b.hover;
    return av - bv;
  });

  for (const o of ordered) {
    const dimmed =
      s.filtersActive && s.matching.size > 0 && !s.matching.has(o.idea.id);
    drawOrganism(ctx, o, { now, dt: s.dt, dimmed });
  }

  // Soft labels over focused/hovered creatures.
  for (const o of sim.organisms) {
    const a = Math.max(o.hover, o.selectGlow);
    const dimmed =
      s.filtersActive && s.matching.size > 0 && !s.matching.has(o.idea.id);
    if (a > 0.05 && !dimmed) drawLabel(ctx, o, a);
  }

  paintVignette(ctx, width, height);
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
) {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#070D20");
  base.addColorStop(0.5, "#050A18");
  base.addColorStop(1, "#02050D");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const breath = 0.5 + 0.5 * Math.sin(now * 0.00035);
  const topGlow = ctx.createRadialGradient(
    w * 0.5,
    -h * 0.32,
    0,
    w * 0.5,
    -h * 0.32,
    h * 1.25,
  );
  topGlow.addColorStop(0, rgba(PALETTE.teal, 0.07 + breath * 0.03));
  topGlow.addColorStop(0.5, rgba(PALETTE.teal, 0.018));
  topGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, w, h);

  const floorGlow = ctx.createRadialGradient(
    w * 0.5,
    h * 1.2,
    0,
    w * 0.5,
    h * 1.2,
    h * 0.95,
  );
  floorGlow.addColorStop(0, rgba(PALETTE.amber, 0.045));
  floorGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floorGlow;
  ctx.fillRect(0, 0, w, h);

  // Two slow diffuse currents add depth without reading as bands.
  for (let i = 0; i < 2; i++) {
    const cx = w * (0.32 + i * 0.4) + Math.sin(now * 0.0002 + i * 2) * w * 0.08;
    const cy = h * (0.35 + i * 0.32);
    const rad = Math.max(w, h) * 0.5;
    const sweep = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    sweep.addColorStop(0, rgba(PALETTE.teal, 0.018));
    sweep.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, w, h);
  }

  // Subtle depth stratification — faint horizontal haze bands at different
  // depths simulate water layers with varying particulate density.
  for (let i = 0; i < 3; i++) {
    const depthFrac = 0.28 + i * 0.22;
    const depthY = h * depthFrac;
    const bandH = h * 0.10;
    const hazeAlpha = 0.006 + Math.sin(now * 0.00012 + i * 2.3) * 0.0025;
    const haze = ctx.createLinearGradient(0, depthY - bandH, 0, depthY + bandH);
    haze.addColorStop(0, "rgba(0,0,0,0)");
    haze.addColorStop(0.5, rgba(PALETTE.teal, hazeAlpha));
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, depthY - bandH, w, bandH * 2);
  }

  ctx.restore();
}

function paintMarineSnow(
  ctx: CanvasRenderingContext2D,
  motes: Mote[],
  w: number,
  h: number,
  dt: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of motes) {
    p.drift += 0.006 * dt;
    p.y -= (0.02 + p.z * 0.08) * dt;
    p.x += Math.sin(p.drift) * 0.08 * dt;
    if (p.y < -4) {
      p.y = h + 4;
      p.x = Math.random() * w;
    }
    if (p.x < -4) p.x = w + 4;
    if (p.x > w + 4) p.x = -4;
    const r = 0.4 + p.z * 1.4;
    const color = p.warm ? PALETTE.amber : PALETTE.teal;
    // Soft, blurred particulate (radial fade), not crisp dots.
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
    g.addColorStop(0, rgba(color, 0.05 + p.z * 0.08));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, o: Organism, alpha: number) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1) * o.presence;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const label = o.idea.name;
  const kind = o.archetype.toUpperCase();
  const ty = o.y - o.radius - 26;

  ctx.font = "500 12px 'Space Grotesk', system-ui, sans-serif";
  const nameW = ctx.measureText(label).width;
  ctx.font = "500 8px 'Space Grotesk', system-ui, sans-serif";
  const kindW = ctx.measureText(kind).width * 1.2;
  const boxW = Math.max(nameW, kindW) + 22;
  const boxH = 32;
  const bx = o.x - boxW / 2;
  const by = ty - boxH / 2;

  // Soft, glowing backing — no crisp stroked ring.
  ctx.shadowColor = rgba(PALETTE.teal, 0.18 * alpha);
  ctx.shadowBlur = 14;
  ctx.fillStyle = rgba("#040A14", 0.72);
  roundRect(ctx, bx, by, boxW, boxH, 9);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#E6EDF8";
  ctx.font = "500 12px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(label, o.x, ty - 5);

  ctx.fillStyle = rgba(PALETTE.teal, 0.7);
  ctx.font = "500 8px 'Space Grotesk', system-ui, sans-serif";
  drawSpacedText(ctx, kind, o.x, ty + 8, 1.8);
  ctx.restore();
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let x = cx - total / 2;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i];
  }
  ctx.textAlign = "center";
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

function paintVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Radial vignette — darkens edges for a contained, cinematic feel.
  const v = ctx.createRadialGradient(
    w * 0.5,
    h * 0.44,
    Math.min(w, h) * 0.28,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.85,
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(0.62, rgba("#02050D", 0.28));
  v.addColorStop(0.85, rgba("#01030A", 0.60));
  v.addColorStop(1, rgba("#010208", 0.92));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  // Additional top-edge darkening — the water surface sits above the frame.
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.12);
  top.addColorStop(0, rgba("#010208", 0.55));
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.12);
}
