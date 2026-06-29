import { useEffect, useRef } from "react";
import type { Idea, ViewMode } from "../types";
import { Simulation, type Organism } from "../lib/simulation";
import { WebGLAquariumRenderer } from "../lib/webgl-aquarium";
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
  // Last known pointer position (canvas-local) so hover can be re-evaluated each
  // frame — creatures swim, so a stationary cursor must still track what's under it.
  const pointerRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const dragRef = useRef<{
    org: Organism;
    moved: boolean;
    downX: number;
    downY: number;
    lastX: number;
    lastY: number;
    lastT: number;
  } | null>(null);
  const mergeCandidateRef = useRef<Organism | null>(null);
  const rendererRef = useRef<WebGLAquariumRenderer | null>(null);

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
      rendererRef.current?.resize(width, height, dpr);
    };
    applySize();

    if (!simRef.current) {
      simRef.current = new Simulation(ideas, { width, height, mode });
    } else {
      simRef.current.resize(width, height);
    }
    const sim = simRef.current;

    if (!rendererRef.current) {
      rendererRef.current = new WebGLAquariumRenderer(canvas, width, height);
    } else {
      rendererRef.current.resize(width, height, dpr);
    }
    const renderer = rendererRef.current;

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
      pointerRef.current = { x, y, inside: true };
      const hit = sim.hitTest(x, y);
      if (hit) {
        const now = performance.now();
        dragRef.current = {
          org: hit,
          moved: false,
          downX: x,
          downY: y,
          lastX: x,
          lastY: y,
          lastT: now,
        };
        hoverIdRef.current = hit.idea.id;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        canvas.style.cursor = "grabbing";
      } else {
        onSelectRef.current(null);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = getPos(e);
      pointerRef.current = { x, y, inside: true };
      const drag = dragRef.current;
      if (drag) {
        if (distance(x, y, drag.downX, drag.downY) > DRAG_THRESHOLD) {
          drag.moved = true;
        }
        const nx = clamp(x, 12, width - 12);
        const ny = clamp(y, 12, height - 12);
        // Track pointer velocity so releasing imparts a little fling — the
        // creature glides on instead of dead-stopping where you let go.
        const now = performance.now();
        const dtMs = Math.max(1, now - drag.lastT);
        drag.org.vx = clamp((nx - drag.lastX) / dtMs, -6, 6);
        drag.org.vy = clamp((ny - drag.lastY) / dtMs, -6, 6);
        drag.org.x = nx;
        drag.org.y = ny;
        drag.lastX = nx;
        drag.lastY = ny;
        drag.lastT = now;
        // Only offer the nearest as a merge candidate when it's genuinely close.
        const cand = sim.nearestTo(drag.org, MERGE_RANGE);
        mergeCandidateRef.current =
          cand && distance(drag.org.x, drag.org.y, cand.x, cand.y) <= MERGE_RANGE
            ? cand
            : null;
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
          // A tap (no real movement) selects.
          onSelectRef.current(drag.org.idea.id);
        } else {
          const cand = mergeCandidateRef.current;
          if (
            cand &&
            cand !== drag.org &&
            distance(drag.org.x, drag.org.y, cand.x, cand.y) <= MERGE_RANGE
          ) {
            onSelectRef.current(drag.org.idea.id);
            onHybridRef.current(drag.org.idea, cand.idea);
          }
        }
      }
      mergeCandidateRef.current = null;
      dragRef.current = null;
      // Re-evaluate hover/cursor at the release point.
      const p = pointerRef.current;
      const hit = p.inside ? sim.hitTest(p.x, p.y) : null;
      hoverIdRef.current = hit ? hit.idea.id : null;
      canvas.style.cursor = hit ? "pointer" : "default";
    };

    const onPointerLeave = () => {
      pointerRef.current.inside = false;
      // Keep tracking hover while dragging (pointer capture continues the drag);
      // only clear the passive hover highlight.
      if (!dragRef.current) {
        hoverIdRef.current = null;
        canvas.style.cursor = "default";
      }
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

      // Re-resolve hover every frame against the latest positions: creatures
      // swim, so what's under a still cursor changes without any pointer event.
      if (!dragRef.current && pointerRef.current.inside) {
        const p = pointerRef.current;
        const hit = sim.hitTest(p.x, p.y);
        const id = hit ? hit.idea.id : null;
        if (id !== hoverIdRef.current) {
          hoverIdRef.current = id;
          canvas.style.cursor = hit ? "pointer" : "default";
        }
      }
      renderer.render(sim.organisms, {
        now,
        selectedId: selectedRef.current,
        hoverId: hoverIdRef.current,
        mergeCandidateId: mergeId,
        draggedId: dragged,
        matching: matchingRef.current,
        filtersActive: filtersActiveRef.current,
      });

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
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full drag-none" />
    </div>
  );
}
