/**
 * StaveViewer.tsx  –  Interactive Grand Staff
 *
 * Two-layer architecture:
 *   1. VexFlow <div> (pointer-events: none)   → stave lines, clef, time-sig, formatted note glyphs
 *   2. Transparent SVG overlay (same size)    → hit-areas + live drag ghost
 *
 * Workflow:
 *   - After VexFlow renders, we read each note's SVG bounding box to find its
 *     screen position and store it in notePositions (a React ref).
 *   - A second pass stores those positions in notePositions state so the overlay
 *     can render selection rings / hit-areas at exactly the right place.
 *   - When the user presses down on a hit-area, we hide the VexFlow glyph (opacity 0),
 *     show a smooth ghost note head on the overlay, and track the cursor.
 *   - On pointerUp we commit the final pitch and clef via onNoteChange().
 *     VexFlow re-renders and the ghost disappears.
 *   - A tone is played on every pitch change.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
  StaveConnector,
} from "vexflow";
import type { NoteEvent } from "./types";
import { getPitchFromY } from "./utils";
import { ensureAudioContext, playToneNote } from "./ToneSynthesizer";

/* ─────────────────────────────────────────────────────────────────────────── */

const SVG_W = 700;
const SVG_H = 280;

// VexFlow layout constants (must match Stave() calls below)
const TREBLE_TOP  = 40;   // Y of top line of treble staff
const BASS_TOP    = 160;  // Y of top line of bass staff
const LINE_GAP    = 10;   // pixels between staff lines

/** Map a staff-line Y back to the note-head Y for a given clef */
function clefCentreY(clef: "treble" | "bass") {
  return clef === "treble"
    ? TREBLE_TOP + 2 * LINE_GAP   // B4 line (middle of treble staff)
    : BASS_TOP  + 2 * LINE_GAP;   // D3 line (middle of bass staff)
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

interface StaveViewerProps {
  notes: NoteEvent[];
  timeSignature: {
    type: string;
    beatsPerMeasure: number;
    beatValue: number;
    ticksPerMeasure: number;
  };
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onNoteChange?: (id: string, newKeys: string[], newClef: "treble" | "bass") => void;
  onNoteDelete?: (id: string) => void;
}

interface NotePos {
  x: number;  // SVG units
  y: number;  // SVG units
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Ghost note head SVG                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function GhostHead({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
      {/* stem */}
      <line x1={5} y1={-1} x2={5} y2={-34} stroke="#1d4ed8" strokeWidth={2} />
      {/* head */}
      <ellipse
        cx={0} cy={0} rx={8} ry={5.5}
        fill="#1d4ed8"
        transform="rotate(-18)"
        style={{ filter: "drop-shadow(0 0 6px rgba(29,78,216,.7))" }}
      />
    </g>
  );
}

function pitchLabel(p: string) {
  const [name, oct] = p.split("/");
  return `${name.replace("#","♯").toUpperCase()}${oct}`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Component                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

export const StaveViewer: React.FC<StaveViewerProps> = ({
  notes,
  timeSignature,
  onDrop,
  onDragOver,
  onDragLeave,
  onNoteChange,
  onNoteDelete,
}) => {
  const vfDivRef     = useRef<HTMLDivElement>(null);   // VexFlow container
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);

  // Rendered positions per note (in SVG units)
  const [positions, setPositions] = useState<Record<string, NotePos>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Drag state — ref to avoid re-renders during pointer move
  const dragRef = useRef<{
    noteId: string;
    pointerId: number;
    ghostX: number;
    ghostY: number;
    pitch: string;
    clef: "treble" | "bass";
  } | null>(null);

  // Ghost state — useState so the ghost renders smoothly
  const [ghost, setGhost] = useState<{
    x: number; y: number; pitch: string; clef: "treble" | "bass";
  } | null>(null);

  /* ───────── helpers ───────── */

  /** Convert client coords → SVG coordinate-space coords */
  const toSvgCoords = useCallback((clientX: number, clientY: number): NotePos => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width)  * SVG_W,
      y: ((clientY - rect.top)  / rect.height) * SVG_H,
    };
  }, []);

  /* ───────── VexFlow render ───────── */

  useEffect(() => {
    const div = vfDivRef.current;
    if (!div) return;

    div.innerHTML = "";

    const renderer = new Renderer(div, Renderer.Backends.SVG);
    renderer.resize(SVG_W, SVG_H);
    const ctx = renderer.getContext();
    ctx.setFont("Arial", 10);

    const trebleStave = new Stave(20, TREBLE_TOP, SVG_W - 40);
    trebleStave.addClef("treble").addTimeSignature(timeSignature.type);
    trebleStave.setContext(ctx).draw();

    const bassStave = new Stave(20, BASS_TOP, SVG_W - 40);
    bassStave.addClef("bass").addTimeSignature(timeSignature.type);
    bassStave.setContext(ctx).draw();

    new StaveConnector(trebleStave, bassStave).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
    new StaveConnector(trebleStave, bassStave).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    new StaveConnector(trebleStave, bassStave).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();

    // Disable pointer events on VexFlow SVG so overlay gets them
    const svgEl = div.querySelector("svg");
    if (svgEl) {
      svgEl.style.pointerEvents = "none";
      svgEl.style.userSelect = "none";
    }

    if (notes.length === 0) {
      setPositions({});
      return;
    }

    try {
      const vfNotes = notes.map((n) => {
        let keys = n.keys.length ? n.keys : ["b/4"];
        if (n.isRest) keys = n.clef === "bass" ? ["d/3"] : ["b/4"];

        const sn = new StaveNote({ clef: n.clef, keys, duration: n.duration });
        sn.setAttribute("id", `vf-${n.id}`);  // prefix so querySelector is unambiguous

        if (!n.isRest) {
          keys.forEach((k, i) => {
            if (k.includes("#")) sn.addModifier(new Accidental("#"), i);
          });
        }

        sn.setStave(n.clef === "bass" ? bassStave : trebleStave);
        return sn;
      });

      const voice = new Voice({
        num_beats: timeSignature.beatsPerMeasure,
        beat_value: timeSignature.beatValue,
      });
      voice.setStrict(false);
      voice.addTickables(vfNotes);
      new Formatter().joinVoices([voice]).format([voice], SVG_W - 120);
      vfNotes.forEach((vn) => vn.setContext(ctx).draw());

      // ── After paint: read bounding boxes ──
      requestAnimationFrame(() => {
        const newPositions: Record<string, NotePos> = {};
        notes.forEach((n) => {
          const el = div.querySelector<SVGGElement>(`g[id="vf-${n.id}"]`);
          if (!el) return;
          try {
            const bbox = el.getBBox();
            newPositions[n.id] = {
              x: bbox.x + bbox.width / 2,
              // Use the clef's centre Y so selection ring is centred on the note head
              y: n.clef === "bass"
                ? BASS_TOP  + 2 * LINE_GAP
                : TREBLE_TOP + 2 * LINE_GAP,
            };
          } catch {
            // getBBox can throw in JSDOM – ignore
          }
        });
        setPositions(newPositions);
      });
    } catch (err) {
      console.error("VexFlow Error:", err);
    }
  }, [notes, timeSignature]);

  /* ───────── Overlay pointer events ───────── */

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = toSvgCoords(e.clientX, e.clientY);

    // Find the nearest note hit area
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, pos] of Object.entries(positions)) {
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist < bestDist && dist < 30) {
        bestDist = dist;
        bestId = id;
      }
    }

    if (!bestId) {
      // Clicked empty space → deselect
      setSelectedId(null);
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    overlaySvgRef.current?.setPointerCapture(e.pointerId);

    setSelectedId(bestId);
    const note = notes.find((n) => n.id === bestId)!;
    const pos = positions[bestId];

    // Hide the vexflow glyph
    const vfEl = vfDivRef.current?.querySelector<HTMLElement>(`g[id="vf-${bestId}"]`);
    if (vfEl) vfEl.style.opacity = "0";

    const pitchInfo = getPitchFromY(pos.y);

    dragRef.current = {
      noteId: bestId,
      pointerId: e.pointerId,
      ghostX: pos.x,
      ghostY: pos.y,
      pitch: pitchInfo.pitch,
      clef: pitchInfo.clef,
    };

    setGhost({ x: pos.x, y: pos.y, pitch: pitchInfo.pitch, clef: pitchInfo.clef });
  }, [positions, notes, toSvgCoords]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();

    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    const pitchInfo = getPitchFromY(y);

    dragRef.current.ghostX = x;
    dragRef.current.ghostY = y;
    dragRef.current.pitch = pitchInfo.pitch;
    dragRef.current.clef = pitchInfo.clef;

    setGhost({ x, y, pitch: pitchInfo.pitch, clef: pitchInfo.clef });
  }, [toSvgCoords]);

  const commitDrag = useCallback(async () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;

    // Restore VexFlow glyph opacity (it will be re-rendered at new position anyway)
    const vfEl = vfDivRef.current?.querySelector<HTMLElement>(`g[id="vf-${d.noteId}"]`);
    if (vfEl) vfEl.style.opacity = "1";

    setGhost(null);

    // Commit change to parent
    if (onNoteChange) {
      onNoteChange(d.noteId, [d.pitch], d.clef);
    }

    // Play the new pitch
    const note = notes.find((n) => n.id === d.noteId);
    if (note && !note.isRest) {
      await ensureAudioContext();
      playToneNote([d.pitch], note.duration);
    }
  }, [notes, onNoteChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    overlaySvgRef.current?.releasePointerCapture(e.pointerId);
    commitDrag();
  }, [commitDrag]);

  /* ───────── Keyboard: Delete selected ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        onNoteDelete?.(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onNoteDelete]);

  /* ───────── HTML drag-drop from palette ───────── */

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    onDragOver?.(e);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    setIsDragOver(false);
    onDragLeave?.(e);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e);
  };

  /* ───────── Render ───────── */

  return (
    <div
      ref={wrapperRef}
      className={`stave-container ${isDragOver ? "drag-over" : ""}`}
      style={{
        position: "relative",
        touchAction: "none",
        minHeight: SVG_H,
        width: "100%",
        background: "white",
        borderRadius: 8,
        overflow: "hidden",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Layer 1 – VexFlow (non-interactive) */}
      <div
        ref={vfDivRef}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
        }}
      />

      {/* Layer 2 – Interactive SVG overlay */}
      <svg
        ref={overlaySvgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          cursor: ghost ? "grabbing" : "default",
          overflow: "visible",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(e) => {
          overlaySvgRef.current?.releasePointerCapture(e.pointerId);
          const d = dragRef.current;
          if (d) {
            const vfEl = vfDivRef.current?.querySelector<HTMLElement>(`g[id="vf-${d.noteId}"]`);
            if (vfEl) vfEl.style.opacity = "1";
          }
          dragRef.current = null;
          setGhost(null);
        }}
      >
        {/* ── Hit-areas + selection rings for every placed note ── */}
        {notes.map((n) => {
          const pos = positions[n.id];
          if (!pos) return null;
          const isSel = n.id === selectedId;
          const isDragging = ghost && dragRef.current?.noteId === n.id;

          return (
            <g key={n.id}>
              {/* Pulsing selection ring (only when not actively dragging) */}
              {isSel && !isDragging && (
                <>
                  <circle cx={pos.x} cy={pos.y} r={16}
                    fill="rgba(29,78,216,0.10)"
                    stroke="#1d4ed8"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  {/* Pitch tooltip above selection */}
                  <rect x={pos.x - 20} y={pos.y - 30} width={40} height={16} rx={4}
                    fill="rgba(29,78,216,0.85)" />
                  <text x={pos.x} y={pos.y - 18}
                    textAnchor="middle" fill="white"
                    fontSize={9} fontWeight={700} fontFamily="Arial">
                    {n.keys.map(pitchLabel).join("+")}
                  </text>
                </>
              )}

              {/* Invisible grab handle */}
              <circle
                cx={pos.x} cy={pos.y} r={22}
                fill="transparent"
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
              />
            </g>
          );
        })}

        {/* ── Live ghost while dragging ── */}
        {ghost && (
          <g>
            {/* Horizontal guide line across the full stave */}
            <line
              x1={22} x2={SVG_W - 22}
              y1={ghost.y} y2={ghost.y}
              stroke="rgba(29,78,216,0.30)"
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            {/* Pitch chip */}
            <rect x={ghost.x - 24} y={ghost.y - 28} width={48} height={18} rx={5}
              fill="rgba(29,78,216,0.90)"
              style={{ filter: "drop-shadow(0 2px 6px rgba(29,78,216,0.4))" }}
            />
            <text x={ghost.x} y={ghost.y - 14}
              textAnchor="middle" fill="white"
              fontSize={10} fontWeight={700} fontFamily="Arial">
              {pitchLabel(ghost.pitch)}
            </text>
            {/* Ghost note head */}
            <GhostHead x={ghost.x} y={ghost.y} />
          </g>
        )}

        {/* ── Footer hint ── */}
        {selectedId && !ghost && (
          <text
            x={SVG_W / 2} y={SVG_H - 6}
            textAnchor="middle" fill="#94a3b8"
            fontSize={9} fontFamily="Arial">
            Drag up/down to change pitch · Delete key to remove
          </text>
        )}
      </svg>
    </div>
  );
};
