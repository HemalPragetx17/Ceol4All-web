import React, { useState, useRef, useEffect } from "react";
import * as Tone from "tone";

type NoteType = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "rest";

type OrnamentType =
  | "triplet"
  | "cran"
  | "slide"
  | "vibrato";

interface Note {
  id: number;
  pitch: string;
  x: number;
  y: number;
  type: NoteType;
  ornaments?: OrnamentType[];

  // ✅ NEW
  cranGraceNotes?: string[];

  // Triplet visual grouping: four underlying note pitches
  // and which adjacent pair (0-2) gets the short second beam.
  tripletPitches?: string[];
  tripletSecondaryPairIndex?: number;
}

const CRAN_MAP: Record<string, string[]> = {
  "D4": ["E4", "F#4", "G4"],
  "E4": ["F#4", "G4", "A4"],
  "F#4": ["G4", "A4", "B4"],
  "G4": ["A4", "B4", "C#5"],
  "A4": ["B4", "C#5", "D5"],

  "D5": ["E5", "F#5", "G5"], // upper octave support
};

const PITCH_HEIGHTS = [
  // Octave 10 (partial)
  { pitch: "D10", y: 65 },
  { pitch: "C#10", y: 70 },
  { pitch: "B9", y: 75 },
  { pitch: "A9", y: 80 },
  { pitch: "G9", y: 85 },
  { pitch: "F#9", y: 90 },
  { pitch: "E9", y: 95 },
  // Octave 9
  { pitch: "D9", y: 100 },
  { pitch: "C#9", y: 105 },
  { pitch: "B8", y: 110 },
  { pitch: "A8", y: 115 },
  { pitch: "G8", y: 120 },
  { pitch: "F#8", y: 125 },
  { pitch: "E8", y: 130 },
  // Octave 8
  { pitch: "D8", y: 135 },
  { pitch: "C#8", y: 140 },
  { pitch: "B7", y: 145 },
  { pitch: "A7", y: 150 },
  { pitch: "G7", y: 155 },
  { pitch: "F#7", y: 160 },
  { pitch: "E7", y: 165 },
  // Octave 7
  { pitch: "D7", y: 170 },
  { pitch: "C#7", y: 175 },
  { pitch: "B6", y: 180 },
  { pitch: "A6", y: 185 },
  { pitch: "G6", y: 190 },
  { pitch: "F#6", y: 195 },
  { pitch: "E6", y: 200 },
  // Octave 6
  { pitch: "D6", y: 205 },
  { pitch: "C#6", y: 210 },
  { pitch: "B5", y: 215 },
  { pitch: "A5", y: 220 },
  { pitch: "G5", y: 225 },
  { pitch: "F#5", y: 230 },
  { pitch: "E5", y: 235 },
  // Octave 5
  { pitch: "D5", y: 240 },
  { pitch: "C#5", y: 245 },
  { pitch: "B4", y: 250 },
  { pitch: "A4", y: 255 },
  { pitch: "G4", y: 260 },
  { pitch: "F#4", y: 265 },
  { pitch: "E4", y: 270 },
  // Octave 4
  { pitch: "D4", y: 275 },
  { pitch: "C#4", y: 280 },
  { pitch: "B3", y: 285 },
  { pitch: "A3", y: 290 },
  { pitch: "G3", y: 295 },
  { pitch: "F#3", y: 300 },
  { pitch: "E3", y: 305 },
  // Octave 3
  { pitch: "D3", y: 310 },
  { pitch: "C#3", y: 315 },
  { pitch: "B2", y: 320 },
  { pitch: "A2", y: 325 },
  { pitch: "G2", y: 330 },
  { pitch: "F#2", y: 335 },
  { pitch: "E2", y: 340 },
  // Octave 2
  { pitch: "D2", y: 345 },
  { pitch: "C#2", y: 350 },
  { pitch: "B1", y: 355 },
  { pitch: "A1", y: 360 },
  { pitch: "G1", y: 365 },
  { pitch: "F#1", y: 370 },
  { pitch: "E1", y: 375 },
  // Octave 1
  { pitch: "E0", y: 410 },
  { pitch: "D0", y: 415 },
  { pitch: "C#0", y: 420 },
  { pitch: "B-1", y: 425 },
  { pitch: "A-1", y: 430 },
  { pitch: "G-1", y: 435 },
  { pitch: "F#-1", y: 440 },
  { pitch: "E-1", y: 445 },
  { pitch: "D-1", y: 450 },
  { pitch: "C#-1", y: 455 },
  { pitch: "B-2", y: 460 },
  { pitch: "A-2", y: 465 },
  { pitch: "G-2", y: 470 },
  { pitch: "F#-2", y: 475 },
  { pitch: "E-2", y: 480 },
  { pitch: "D-2", y: 485 },
  { pitch: "C#-2", y: 490 },
];

const getYFromPitch = (pitch: string): number => {
  return PITCH_HEIGHTS.find((p) => p.pitch === pitch)?.y ?? 0;
};

const getPitchFromY = (y: number): string => {
  const roundedY = Math.round(y / SNAP_Y) * SNAP_Y;
  let nearest = PITCH_HEIGHTS[0];
  let minDiff = Math.abs(PITCH_HEIGHTS[0].y - roundedY);

  for (let i = 1; i < PITCH_HEIGHTS.length; i++) {
    const diff = Math.abs(PITCH_HEIGHTS[i].y - roundedY);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = PITCH_HEIGHTS[i];
    }
  }
  return nearest.pitch;
};

const STAFF_LINES = [230, 240, 250, 260, 270];
const SNAP_Y = 5;
const BAR_WIDTH = 200;
const TOTAL_BARS = 4;
const STAFF_WIDTH = BAR_WIDTH * TOTAL_BARS;
const STAFF_HEIGHT = 500; // Decreased height slightly as requested

const DUR_MAP: Record<NoteType, string> = {
  whole: "1n",
  half: "2n",
  quarter: "4n",
  eighth: "8n",
  sixteenth: "16n",
  rest: "0n",
};

const NEXT_DURATION: Record<string, NoteType> = {
  sixteenth: "eighth",
  eighth: "quarter",
  quarter: "half",
  half: "whole",
};

const PALETTE_ITEMS: { type: NoteType; symbol: string; label: string }[] = [
  { type: "whole", symbol: "𝅝", label: "Whole" },
  { type: "half", symbol: "𝅗𝅥", label: "Half" },
  { type: "quarter", symbol: "♩", label: "Quarter" },
  { type: "eighth", symbol: "♪", label: "Eighth" },
  { type: "sixteenth", symbol: "𝅘𝅥𝅯", label: "16th" },
  { type: "rest", symbol: "𝄽", label: "Rest" },
];

const ORNAMENT_PALETTE_ITEMS: {
  type: OrnamentType;
  symbol: string;
  label: string;
}[] = [
  { type: "triplet", label: "Triplet", symbol: "3" },
  { type: "cran", label: "Cran", symbol: "Cr" },
  { type: "slide", label: "Slide", symbol: "S" },
  { type: "vibrato", label: "Vibrato", symbol: "V" },
];

const ORNAMENT_SYMBOL_MAP: Record<OrnamentType, string> = {
  triplet: "3",
  cran: "Cr",
  slide: "S",
  vibrato: "Vib",
};

const getRelativePitch = (pitch: string, steps: number) => {
  const index = PITCH_HEIGHTS.findIndex((p) => p.pitch === pitch);
  if (index === -1) return pitch;
  const targetIndex = Math.min(
    PITCH_HEIGHTS.length - 1,
    Math.max(0, index + steps),
  );
  return PITCH_HEIGHTS[targetIndex].pitch;
};

const getOrnamentPattern = (pitch: string, ornament: OrnamentType): string[] => {
  const up = getRelativePitch(pitch, 1);
  const down = getRelativePitch(pitch, -1);
  const up2 = getRelativePitch(pitch, 2);

  switch (ornament) {
    case "triplet":
      return [pitch, up, pitch];
    case "cran":
      return [up2, up, pitch];
    case "slide":
      return [down, pitch];
    case "vibrato":
      return [pitch, up, pitch, down, pitch];
    default:
      return [];
  }
};

// Simple tin whistle D-major text-note to pitch map based on common tab
// Keys correspond to how notes often appear under staff in PDFs.
const NOTE_TEXT_TO_PITCH: Record<string, string> = {
  // Low octave
  "D": "D4",
  "E": "E4",
  "F": "F#4",
  "F#": "F#4",
  "G": "G4",
  "G#": "G#4",
  "A": "A4",
  "B": "B4",
  "C": "C4",
  "C#": "C#4",

  // Upper octave (often written lowercase in tabs)
  "c": "C5",
  "c#": "C#5",
  "d": "D5",
  "e": "E5",
  "f": "F#5",
  "f#": "F#5",
  "g": "G5",
  "g#": "G#5",
  "a": "A5",
  "b": "B5",
};

const createNotesFromNames = (
  names: string[],
  mapping: Record<string, string>,
): Note[] => {
  const cleanedNames = names
    .map((raw) => raw.trim())
    .filter((n) => n.length > 0);

  const resolvedPitches = cleanedNames
    .map((name) => {
      let pitch = mapping[name];
      if (!pitch) {
        const base = name[0];
        pitch = mapping[base] ?? mapping[base.toLowerCase()];
      }
      return pitch ? { name, pitch } : null;
    })
    .filter((x): x is { name: string; pitch: string } => x !== null);

  if (!resolvedPitches.length) return [];

  const notes: Note[] = [];
  const startX = 60;
  const availableWidth = STAFF_WIDTH - 120;
  const stepX =
    resolvedPitches.length > 1
      ? availableWidth / (resolvedPitches.length - 1)
      : 0;

  resolvedPitches.forEach(({ pitch }, index) => {
    const y = getYFromPitch(pitch);
    const x = startX + stepX * index;

    notes.push({
      id: Date.now() + index,
      pitch,
      x,
      y,
      type: "eighth",
    });
  });

  return notes;
};

const resolveCranPitches = (
  names: string[] | undefined,
  mapping: Record<string, string>,
): string[] | undefined => {
  if (!names || names.length === 0) return undefined;

  const resolved = names
    .map((name) => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      let pitch = mapping[trimmed];
      if (!pitch) {
        const base = trimmed[0];
        pitch = mapping[base] ?? mapping[base.toLowerCase()];
      }
      return pitch ?? null;
    })
    .filter((p): p is string => p !== null);

  return resolved.length ? resolved : undefined;
};

type AnnotatedToken = {
  name: string;
  ornaments?: OrnamentType[];
  cranGraceNotes?: string[]; // ✅ NEW
};

const ORNAMENT_KEYWORDS: Record<string, OrnamentType> = {
  triplet: "triplet",
  cran: "cran",
  cr: "cran",
  slide: "slide",
  vibrato: "vibrato",
  vib: "vibrato",
};

const parseAnnotatedText = (raw: string): AnnotatedToken[] => {
  const tokens: AnnotatedToken[] = [];

  // ✅ Added support for [EFG]
  const regex = /([A-Ga-g][#b]?)(?:\{([^}]+)\})?(?:\[([^\]]+)\])?/g;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    const name = match[1];
    const ornamentPart = match[2];
    const gracePart = match[3]; // ✅ NEW

    let ornaments: OrnamentType[] | undefined;
    let cranGraceNotes: string[] | undefined;

    // existing ornament parsing
    if (ornamentPart) {
      const pieces = ornamentPart
        .split(/[ ,/]+/)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);

      const mapped: OrnamentType[] = [];
      pieces.forEach((p) => {
        const hit = ORNAMENT_KEYWORDS[p];
        if (hit && !mapped.includes(hit)) mapped.push(hit);
      });

      if (mapped.length) ornaments = mapped;
    }

    // ✅ NEW: parse cran notes like [EFG]
    if (gracePart) {
      cranGraceNotes = gracePart
        .split("")
        .map((n) => n.trim())
        .filter(Boolean);

      // auto mark as cran
      ornaments = [...(ornaments ?? []), "cran"];
    }

    tokens.push({ name, ornaments, cranGraceNotes });
  }

  return tokens;
};

// If a note has a cran ornament followed by 3 plain repeats of the same
// pitch (e.g. D{cran} D D D), treat those extra tokens as part of the cran
// group so they don't render as separate notes on the staff.
const normalizeCranTokens = (tokens: AnnotatedToken[]): AnnotatedToken[] => {
  const result: AnnotatedToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const hasCran = current.ornaments?.includes("cran");

    if (!hasCran) {
      result.push(current);
      continue;
    }

    result.push(current);

    let skipped = 0;
    let j = i + 1;
    while (j < tokens.length && skipped < 3) {
      const nextToken = tokens[j];
      if (!nextToken) break;

      const sameName = nextToken.name === current.name;
      const noOrnaments = !nextToken.ornaments || nextToken.ornaments.length === 0;

      if (!sameName || !noOrnaments) break;

      skipped += 1;
      j += 1;
    }

    i = j - 1;
  }

  return result;
};

type PositionedToken = AnnotatedToken & { barIndex: number };

const parseAnnotatedTextWithBars = (raw: string): PositionedToken[] => {
  const segments = raw.split("|");
  const positioned: PositionedToken[] = [];

  segments.forEach((segment, barIndex) => {
    const baseTokens = parseAnnotatedText(segment);
    const normalized = normalizeCranTokens(baseTokens);
    normalized.forEach((t) => {
      positioned.push({ ...t, barIndex });
    });
  });

  return positioned;
};

const createNotesFromAnnotatedTokens = (
  tokens: PositionedToken[],
  mapping: Record<string, string>,
): Note[] => {
  const resolved = tokens
    .map((token) => {
      const raw = token.name.trim();
      if (!raw) return null;

      let pitch = mapping[raw];
      if (!pitch) {
        const base = raw[0];
        pitch = mapping[base] ?? mapping[base.toLowerCase()];
      }
      if (!pitch) return null;

      const resolvedCran = resolveCranPitches(token.cranGraceNotes, mapping);

      return {
        pitch,
        ornaments: token.ornaments,
        barIndex: token.barIndex,
        cranGraceNotes: resolvedCran, // ✅ store as real pitches (e.g. E4,F#4,G4)
      };
    })
    .filter(
      (
        x,
      ): x is {
        pitch: string;
        ornaments: OrnamentType[] | undefined;
        barIndex: number;
        cranGraceNotes: string[] | undefined;
      } => x !== null,
    );

  if (!resolved.length) return [];

  const notes: Note[] = [];
  const barPadding = 20;

  // ✅ FIX: include cranGraceNotes in bars
  const bars: Record<
    number,
    {
      pitch: string;
      ornaments: OrnamentType[] | undefined;
      cranGraceNotes: string[] | undefined;
    }[]
  > = {};

  resolved.forEach((item) => {
    const idx = item.barIndex;
    if (!bars[idx]) bars[idx] = [];

    bars[idx].push({
      pitch: item.pitch,
      ornaments: item.ornaments,
      cranGraceNotes: item.cranGraceNotes, // ✅ FIXED
    });
  });

  let globalIndex = 0;

  for (let barIndex = 0; barIndex < TOTAL_BARS; barIndex++) {
    const group = bars[barIndex] ?? [];
    if (!group.length) continue;

    const barStart = 40 + barIndex * BAR_WIDTH + barPadding;
    const barEnd = 40 + (barIndex + 1) * BAR_WIDTH - barPadding;
    const innerWidth = barEnd - barStart;
    const stepX = group.length > 1 ? innerWidth / (group.length - 1) : 0;

    group.forEach(({ pitch, ornaments, cranGraceNotes }, idx) => {
      const y = getYFromPitch(pitch);
      const x = barStart + stepX * idx;

      notes.push({
        id: Date.now() + globalIndex,
        pitch,
        x,
        y,
        type: "eighth",
        ornaments,
        cranGraceNotes:
          cranGraceNotes ||
          (ornaments?.includes("cran") ? CRAN_MAP[pitch] : undefined), // ✅ now works
      });

      globalIndex += 1;
    });
  }

  return notes;
};

const CustomCompositor = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draggingNoteId, setDraggingNoteId] = useState<number | null>(null);
  const [draggingNewType, setDraggingNewType] = useState<NoteType | null>(null);
  const [newNotePos, setNewNotePos] = useState({ x: 0, y: 0 });
  const [draggingOrnamentType, setDraggingOrnamentType] =
    useState<OrnamentType | null>(null);
  const [ornamentPos, setOrnamentPos] = useState({ x: 0, y: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadX, setPlayheadX] = useState(0);
  const [isTextImportOpen, setIsTextImportOpen] = useState(false);
  const [textImportValue, setTextImportValue] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [ghostActivated, setGhostActivated] = useState(false); // Track if palette drag entered staff
  const svgRef = useRef<SVGSVGElement>(null);
  const synth = useRef<Tone.MonoSynth | null>(null);
  const lastPlayTime = useRef<number>(0);
  const playheadInterval = useRef<number | null>(null);
  const lastDraggedPitch = useRef<string | null>(null);

  useEffect(() => {
    synth.current = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.1,
        decay: 0.1,
        sustain: 0.8,
        release: 0.4,
      },
      filterEnvelope: {
        attack: 0.05,
        baseFrequency: 20, // Lowered significantly to allow low notes to pass
        octaves: 7, // Increased octaves for a wider range
      },
    }).toDestination();

    return () => {
      synth.current?.dispose();
    };
  }, []);

  // Handle Delete / Backspace to remove the currently selected note
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNoteId !== null) {
        event.preventDefault();
        setNotes((prev) => prev.filter((n) => n.id !== selectedNoteId));
        setSelectedNoteId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNoteId]);

  const playPitch = async (pitch: string, type: NoteType) => {
    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }
    if (synth.current && type !== "rest") {
      const now = Tone.now();
      const startTime = Math.max(now, lastPlayTime.current + 0.001);
      const dur = DUR_MAP[type];
      synth.current.triggerAttackRelease(pitch, dur, startTime);
      lastPlayTime.current = startTime;
    }
  };

  const handlePlay = async () => {
    if (notes.length === 0) return;
    if (Tone.getContext().state !== "running") await Tone.start();

    setIsPlaying(true);
    setPlayheadX(0);

    const sortedNotes = [...notes].sort((a, b) => a.x - b.x);
    const startX = 40;
    const endX = STAFF_WIDTH + 40;
    const totalDuration = 8;
    const now = Tone.now();

    sortedNotes.forEach((note) => {
      if (!synth.current) return;
      if (note.type === "rest") return;

      const timeOffset = ((note.x - startX) / (endX - startX)) * totalDuration;
      const startTime = now + timeOffset;

      const baseDurationSeconds = Tone.Time(DUR_MAP[note.type]).toSeconds();
      const ornaments = note.ornaments ?? [];

      if (!ornaments.length) {
        synth.current.triggerAttackRelease(note.pitch, baseDurationSeconds, startTime);
        return;
      }

      const maxOrnamentShare = 0.4;
      const ornamentTotal = Math.min(
        baseDurationSeconds * maxOrnamentShare,
        ornaments.length * 0.08,
      );
      const perOrnament = ornaments.length ? ornamentTotal / ornaments.length : 0;

      let currentOffset = 0;

      ornaments.forEach((orn) => {
        let pattern: string[] = [];

        if (orn === "cran") {
          const cranNotes =
            note.cranGraceNotes?.length
              ? note.cranGraceNotes
              : CRAN_MAP[note.pitch] || [];

          pattern = cranNotes;
        } else if (orn === "triplet") {
          // For grouped triplets, prefer the stored tripletPitches for playback
          pattern =
            note.tripletPitches?.length
              ? note.tripletPitches
              : getOrnamentPattern(note.pitch, orn);
        } else {
          pattern = getOrnamentPattern(note.pitch, orn);
        }

        if (!pattern.length || perOrnament <= 0) return;

        const eventDuration = perOrnament / pattern.length;

        pattern.forEach((p) => {
          synth.current?.triggerAttackRelease(p, eventDuration, startTime + currentOffset);
          currentOffset += eventDuration;
        });
      });

      const remaining = Math.max(
        baseDurationSeconds - currentOffset,
        baseDurationSeconds * 0.4,
      );
      synth.current.triggerAttackRelease(
        note.pitch,
        remaining,
        startTime + currentOffset,
      );
    });

    const startTime = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = elapsed / totalDuration;

      if (progress >= 1) {
        handleStop();
      } else {
        setPlayheadX(startX + progress * (endX - startX));
      }
    }, 30);

    playheadInterval.current = interval;
  };

  const handleStop = () => {
    setIsPlaying(false);
    setPlayheadX(0);
    if (playheadInterval.current) {
      clearInterval(playheadInterval.current);
      playheadInterval.current = null;
    }
    synth.current?.triggerRelease();
  };

  const handleClear = () => {
    setNotes([]);
    handleStop();
  };

  const handleTextImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = textImportValue;
    if (!raw.trim()) return;

    const tokens = parseAnnotatedTextWithBars(raw);
    const importedNotes = createNotesFromAnnotatedTokens(
      tokens,
      NOTE_TEXT_TO_PITCH,
    );
    if (importedNotes.length) {
      setNotes(importedNotes);
    }
  };

  const handleMouseDownOnNote = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (Tone.getContext().state !== "running") await Tone.start();
    setSelectedNoteId(id);
    setDraggingNoteId(id);
    lastDraggedPitch.current = null; // Reset for drag
  };

  const handleClickOnNote = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedNoteId(id);
  };

  const handleMouseDownOnPalette = async (
    e: React.MouseEvent,
    type: NoteType,
  ) => {
    if (Tone.getContext().state !== "running") await Tone.start();
    setDraggingNewType(type);
    setGhostActivated(false); // Reset on start
    lastDraggedPitch.current = null; // Reset for drag
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setNewNotePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseDownOnOrnamentPalette = async (
    e: React.MouseEvent,
    type: OrnamentType,
  ) => {
    if (Tone.getContext().state !== "running") await Tone.start();
    setDraggingOrnamentType(type);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setOrnamentPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggingNoteId !== null) {
      const draggingNote = notes.find((n) => n.id === draggingNoteId);
      if (!draggingNote) return;

      const pitch = getPitchFromY(y);

      if (pitch !== lastDraggedPitch.current) {
        playPitch(pitch, draggingNote.type);
        lastDraggedPitch.current = pitch;
      }

      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === draggingNoteId) {
            return {
              ...n,
              x,
              y: n.type === "rest" ? y : getYFromPitch(pitch),
              pitch: n.type === "rest" ? "REST" : pitch,
            };
          }
          return n;
        }),
      );
    } else if (draggingNewType) {
      setNewNotePos({ x, y });
      const pitch = getPitchFromY(y);
      if (pitch !== lastDraggedPitch.current) {
        if (draggingNewType !== "rest") playPitch(pitch, draggingNewType);
        lastDraggedPitch.current = pitch;
      }
      // Activate if it hits the staff area
      if (y >= 230 && y <= 270) {
        setGhostActivated(true);
      }
    } else if (draggingOrnamentType) {
      setOrnamentPos({ x, y });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingOrnamentType && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const threshold = 20;
      let closestNote: Note | null = null;
      let closestDist = Infinity;

      notes.forEach((note) => {
        if (note.type === "rest") return;
        const dx = note.x - x;
        const dy = note.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold && dist < closestDist) {
          closestDist = dist;
          closestNote = note;
        }
      });

      if (closestNote && draggingOrnamentType === "triplet") {
        const anchor: any = closestNote;
        const dropX = x;

        setNotes((prev) => {
          // Determine the bar of the anchor note from its x-position
          const anchorBar = Math.max(
            0,
            Math.min(
              TOTAL_BARS - 1,
              Math.floor((anchor.x - 40) / BAR_WIDTH),
            ),
          );

          // Consider only notes in the same bar (non-rest)
          const barNotes = prev
            .filter((n) => {
              if (n.type === "rest") return false;
              const barIndex = Math.max(
                0,
                Math.min(
                  TOTAL_BARS - 1,
                  Math.floor((n.x - 40) / BAR_WIDTH),
                ),
              );
              return barIndex === anchorBar;
            })
            .sort((a, b) => a.x - b.x);

          const group = barNotes.slice(0, 4);

          // Require at least 4 notes in this bar to form a triplet group;
          // if not, leave everything unchanged (no triplet applied).
          if (group.length < 4) {
            return prev;
          }

          const base = group[0];
          const tripletPitches = group.map((n) => n.pitch);
          const avgX = group.reduce((sum, n) => sum + n.x, 0) / group.length;

          // Decide which adjacent pair (0-1, 1-2, or 2-3) gets the short beam
          const pairMidpoints = [
            (group[0].x + group[1].x) / 2,
            (group[1].x + group[2].x) / 2,
            (group[2].x + group[3].x) / 2,
          ];

          let bestIndex = 1; // default to middle pair
          let bestDist = Infinity;
          pairMidpoints.forEach((mid, idx) => {
            const d = Math.abs(mid - dropX);
            if (d < bestDist) {
              bestDist = d;
              bestIndex = idx;
            }
          });

          const newNote: Note = {
            id: Date.now(),
            pitch: base.pitch,
            x: avgX,
            y: getYFromPitch(base.pitch),
            type: "eighth",
            ornaments: [...(base.ornaments ?? []), "triplet"],
            tripletPitches,
            tripletSecondaryPairIndex: bestIndex,
          };

          const remaining = prev.filter(
            (n) => !group.some((g) => g.id === n.id),
          );

          return [...remaining, newNote];
        });
      } else if (closestNote && draggingOrnamentType === "cran") {
        // Merge nearby notes into a single cran group based on their pitches
        const anchor: any = closestNote; // non-null guard for TypeScript
        setNotes((prev) => {
          const windowPx = 80;
          const candidates = prev
            .filter(
              (n) =>
                n.type !== "rest" && Math.abs(n.x - anchor.x) <= windowPx,
            )
            .sort((a, b) => a.x - b.x);

          const group = candidates.slice(0, 4);

          if (group.length <= 1) {
            // Not enough notes to form a group, just attach cran to the note
            return prev.map((n) =>
              n.id === anchor.id
                ? {
                  ...n,
                  ornaments: [...(n.ornaments ?? []), "cran"],
                  cranGraceNotes:
                    n.cranGraceNotes || CRAN_MAP[n.pitch] || undefined,
                }
                : n,
            );
          }

          const base = group[0];
          const cranPitches = group.map((n) => n.pitch);
          const avgX =
            group.reduce((sum, n) => sum + n.x, 0) / group.length;

          const newNote: Note = {
            id: Date.now(),
            pitch: base.pitch,
            x: avgX,
            y: getYFromPitch(base.pitch),
            type: "eighth",
            ornaments: [...(base.ornaments ?? []), "cran"],
            cranGraceNotes: cranPitches,
          };

          const remaining = prev.filter(
            (n) => !group.some((g) => g.id === n.id),
          );

          return [...remaining, newNote];
        });
      } else if (closestNote) {
        // Non-cran ornament: just attach to the closest note
        const anchor: any = closestNote;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === anchor.id
              ? {
                ...n,
                ornaments: [...(n.ornaments ?? []), draggingOrnamentType],
              }
              : n,
          ),
        );
      } else if (draggingOrnamentType === "cran") {
        // Allow creating a new cran group directly via drag-and-drop
        const pitch = getPitchFromY(y);
        const newNote: Note = {
          id: Date.now(),
          pitch,
          x,
          y: getYFromPitch(pitch),
          type: "eighth",
          ornaments: ["cran"],

          // ✅ NEW default cran pattern
          cranGraceNotes: CRAN_MAP[pitch] || [],
        };

        setNotes((prev) => [...prev, newNote]);
      }
    } else if (draggingNewType && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // clg
      const pitch = getPitchFromY(y);
      const newNote: Note = {
        id: Date.now(),
        pitch: draggingNewType === "rest" ? "REST" : pitch,
        x,
        y: draggingNewType === "rest" ? y : getYFromPitch(pitch),
        type: draggingNewType,
      };

      setNotes((prev) => {
        const mergedNotes = checkForMerging([...prev, newNote], newNote.id);
        return mergedNotes;
      });
      if (draggingNewType !== "rest") playPitch(pitch, draggingNewType);
    } else if (draggingNoteId !== null) {
      const draggedNote = notes.find((n) => n.id === draggingNoteId);
      if (draggedNote && draggedNote.type !== "rest") {
        playPitch(draggedNote.pitch, draggedNote.type);
      }
      setNotes((prev) => checkForMerging(prev, draggingNoteId));
    }
    setDraggingNoteId(null);
    setDraggingNewType(null);
    setDraggingOrnamentType(null);
  };

  const checkForMerging = (currentNotes: Note[], activeId: number): Note[] => {
    return currentNotes;
  };

  const renderNoteIcon = (
    note:
      | Note
      | { type: NoteType; x: number; y: number; id?: number; pitch?: string },
    isGhost = false,
  ) => {
    const isActivated = !isGhost || ghostActivated;
    const color = isGhost ? "rgba(44, 62, 80, 0.4)" : "#2c3e50";
    const highlightColor = "#3498db";
    const isActive =
      "id" in note && (note.id === draggingNoteId || note.id === selectedNoteId);

    if (note.type === "rest") {
      return (
        <g transform={`translate(${note.x}, ${note.y})`}>
          <path
            d="M -4 -8 L 4 -4 L -4 4 L 4 8"
            stroke={isActive ? highlightColor : color}
            strokeWidth="2"
            fill="none"
          />
        </g>
      );
    }

    const { x, y, type } = note;
    const fullNote = note as Note;
    const pitch = "pitch" in note ? fullNote.pitch : getPitchFromY(y);
    const ornaments = fullNote.ornaments;

    // ✅ NEW: Get cran and triplet grouping data
    const cranGraceNotes = fullNote.cranGraceNotes;
    const tripletPitches = fullNote.tripletPitches;
    const tripletSecondaryPairIndex = fullNote.tripletSecondaryPairIndex;

    // ============================
    // ✅ UPDATED CRAN RENDERING
    // ============================
    if (!isGhost && ornaments?.includes("cran") && pitch) {
      // 👉 If user provided custom cran notes (like D[EFG])
      const pitches = cranGraceNotes?.length
        ? cranGraceNotes
        : [pitch, pitch, pitch, pitch]; // fallback

      const stepX = 12;
      const xOffsets = [-2.2 * stepX, -0.4 * stepX, 0.9 * stepX, 2.1 * stepX];

      const visualNotes = pitches.map((p, i) => ({
        relX: xOffsets[i] ?? i * stepX,
        relY: getYFromPitch(p) - y, // ✅ REAL HEIGHT
      }));

      const stemDown = isActivated && y <= 250;
      const beamThickness = 4;

      // Determine beam position: below notes if stems are down, above if stems are up
      const referenceY = stemDown
        ? Math.max(...visualNotes.map((v) => v.relY))
        : Math.min(...visualNotes.map((v) => v.relY));

      const beamY = referenceY + (stemDown ? 30 : -30);

      const stems = visualNotes.map((v) => ({
        x: v.relX + (stemDown ? -5 : 5), // Stem on left if down, right if up
        yBottom: v.relY,
        yTop: beamY,
      }));

      const firstStem = stems[0];
      const lastStem = stems[stems.length - 1];

      const beamPoints = [
        `${firstStem.x},${beamY}`,
        `${lastStem.x},${beamY}`,
        `${lastStem.x},${beamY + (stemDown ? beamThickness : -beamThickness)}`,
        `${firstStem.x},${beamY + (stemDown ? beamThickness : -beamThickness)}`,
      ].join(" ");

      return (
        <g transform={`translate(${x}, ${y})`}>
          {/* Click area */}
          <circle cx={0} cy={0} r={14} fill="transparent" />

          {/* ✅ NOTE HEADS WITH REAL HEIGHT */}
          {visualNotes.map((v, i) => (
            <ellipse
              key={i}
              cx={v.relX}
              cy={v.relY}
              rx={5}
              ry={4}
              fill={isActive ? highlightColor : color}
            />
          ))}

          {/* ✅ STEMS */}
          {stems.map((s, i) => (
            <line
              key={i}
              x1={s.x}
              y1={s.yBottom}
              x2={s.x}
              y2={s.yTop}
              stroke={isActive ? highlightColor : color}
              strokeWidth={1.5}
            />
          ))}

          {/* ✅ BEAM */}
          <polygon points={beamPoints} fill={isActive ? highlightColor : color} />

        </g>
      );
    }

    // ============================
    // ✅ TRIPLET RENDERING
    // ============================
    if (!isGhost && ornaments?.includes("triplet") && pitch) {
      // Prefer explicit grouped pitches (from drag-drop) and support 4 notes
      const pitches =
        tripletPitches?.length && tripletPitches.length >= 2
          ? tripletPitches
          : getOrnamentPattern(pitch, "triplet");

      const count = pitches.length;
      const stepX = 16; // further increased spacing between triplet notes
      const offsetStart = -((count - 1) / 2) * stepX;
      const visualNotes = pitches.map((p, i) => ({
        relX: offsetStart + i * stepX,
        relY: getYFromPitch(p) - y,
      }));

      const beamThickness = 4;

      const highestNoteY = Math.min(...visualNotes.map((v) => v.relY));
      const beamY = highestNoteY - 25;

      const stems = visualNotes.map((v) => ({
        x: v.relX + 6,
        yBottom: v.relY,
        yTop: beamY,
      }));

      const firstStem = stems[0];
      const lastStem = stems[stems.length - 1];

      // Main beam across all notes in the group
      const mainBeamPoints = [
        `${firstStem.x},${beamY}`,
        `${lastStem.x},${beamY}`,
        `${lastStem.x},${beamY - beamThickness}`,
        `${firstStem.x},${beamY - beamThickness}`,
      ].join(" ");

      // Second beam only between a chosen adjacent pair
      let secondBeamPoints: string | null = null;
      if (stems.length >= 2) {
        const idx =
          typeof tripletSecondaryPairIndex === "number" &&
          tripletSecondaryPairIndex >= 0 &&
          tripletSecondaryPairIndex < stems.length - 1
            ? tripletSecondaryPairIndex
            : 0;

        const secondBeamY = beamY + beamThickness + 7; // extra vertical gap between beams
        const s0 = stems[idx];
        const s1 = stems[idx + 1];
        secondBeamPoints = [
          `${s0.x},${secondBeamY}`,
          `${s1.x},${secondBeamY}`,
          `${s1.x},${secondBeamY - beamThickness}`,
          `${s0.x},${secondBeamY - beamThickness}`,
        ].join(" ");
      }

      const nonTripletOrnaments = ornaments.filter((o) => o !== "triplet");

      const handleTripletClick = (e: React.MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        setNotes((prev) =>
          prev.map((n) => {
            if (n.id !== fullNote.id) return n;

            const count = n.tripletPitches?.length ?? 0;
            const maxPairIndex = Math.max(0, count - 2); // for 4 notes => 2 (pairs 0-1,1-2,2-3)

            const current =
              typeof n.tripletSecondaryPairIndex === "number"
                ? n.tripletSecondaryPairIndex
                : 0;

            const next = maxPairIndex > 0 ? (current + 1) % (maxPairIndex + 1) : 0;

            return {
              ...n,
              tripletSecondaryPairIndex: next,
            };
          }),
        );
      };

      return (
        <g transform={`translate(${x}, ${y})`} onClick={handleTripletClick}>
          {/* Click area */}
          <circle cx={0} cy={0} r={14} fill="transparent" />

          {/* Triplet note heads */}
          {visualNotes.map((v, i) => (
            <ellipse
              key={i}
              cx={v.relX}
              cy={v.relY}
              rx={5}
              ry={4}
              fill={isActive ? highlightColor : color}
            />
          ))}

          {/* Stems */}
          {stems.map((s, i) => (
            <line
              key={i}
              x1={s.x}
              y1={s.yBottom}
              x2={s.x}
              y2={s.yTop}
              stroke={isActive ? highlightColor : color}
              strokeWidth={1.5}
            />
          ))}

          {/* Main beam */}
          <polygon
            points={mainBeamPoints}
            fill={isActive ? highlightColor : color}
          />

          {/* Second, shorter beam between first two notes */}
          {secondBeamPoints && (
            <polygon
              points={secondBeamPoints}
              fill={isActive ? highlightColor : color}
            />
          )}

          {/* Any other ornaments except triplet */}
          {nonTripletOrnaments.length > 0 && (
            <g transform="translate(0, -40)">
              {nonTripletOrnaments.map((orn, i) => (
                <text
                  key={i}
                  x={i * 10}
                  y={0}
                  fontSize="8"
                  fill={isActive ? highlightColor : "#7f8c8d"}
                >
                  {ORNAMENT_SYMBOL_MAP[orn]}
                </text>
              ))}
            </g>
          )}
        </g>
      );
    }

    // ============================
    // DEFAULT NOTE RENDER
    // ============================
    // Render ledger lines helper
    const renderLedgerLines = () => {
      const lines = [];
      const colorLocal = isActive ? highlightColor : color;
      // Above staff (top line is 230)
      if (isActivated && y <= 220) {
        for (let ly = 220; ly >= y; ly -= 10) {
          if ((ly - 250) % 10 === 0) { // Should be a line position
            lines.push(
              <line
                key={`up-${ly}`}
                x1={-12}
                y1={ly - y}
                x2={12}
                y2={ly - y}
                stroke={colorLocal}
                strokeWidth="1.5"
              />
            );
          }
        }
      }
      // Below staff (bottom line is 270)
      if (isActivated && y >= 280) {
        for (let ly = 280; ly <= y; ly += 10) {
          if ((ly - 250) % 10 === 0) { // Should be a line position
            lines.push(
              <line
                key={`down-${ly}`}
                x1={-12}
                y1={ly - y}
                x2={12}
                y2={ly - y}
                stroke={colorLocal}
                strokeWidth="1.5"
              />
            );
          }
        }
      }
      return lines;
    };

    return (
      <g transform={`translate(${x}, ${y})`}>
        {renderLedgerLines()}
        {type === "whole" ? (
          <ellipse
            cx="0"
            cy="0"
            rx="9"
            ry="6"
            stroke={isActive ? highlightColor : color}
            strokeWidth="2"
            fill="white"
            transform="rotate(-20)"
          />
        ) : (
          <>
            {(() => {
              const stemDown = isActivated && y <= 250;
              const stemX = stemDown ? -6 : 6;
              const stemYEnd = stemDown ? 25 : -25;
              const flagPath = stemDown
                ? "M -6 25 C -2 20 3 15 3 10" // Downward flag
                : "M 6 -25 C 10 -20 15 -15 15 -10"; // Upward flag

              return (
                <>
                  {type === "half" ? (
                    <ellipse
                      cx="0"
                      cy="0"
                      rx="7"
                      ry="5"
                      stroke={isActive ? highlightColor : color}
                      strokeWidth="2"
                      fill="white"
                      transform="rotate(-20)"
                    />
                  ) : (
                    <ellipse
                      cx="0"
                      cy="0"
                      rx="7"
                      ry="5"
                      fill={isActive ? highlightColor : color}
                      transform="rotate(-20)"
                    />
                  )}

                  <line
                    x1={stemX}
                    y1="0"
                    x2={stemX}
                    y2={stemYEnd}
                    stroke={isActive ? highlightColor : color}
                    strokeWidth="1.5"
                  />

                  {type === "eighth" && (
                    <path
                      d={flagPath}
                      stroke={isActive ? highlightColor : color}
                      strokeWidth="2"
                      fill="none"
                    />
                  )}
                </>
              );
            })()}
          </>
        )}

        {ornaments && (
          <g transform="translate(0, -36)">
            {ornaments
              .filter(
                (o) =>
                  o !== "cran" &&
                  o !== "triplet"
              )
              .map((orn, i) => (
                <text key={i} x={i * 10} y={0} fontSize="8">
                  {ORNAMENT_SYMBOL_MAP[orn]}
                </text>
              ))}
          </g>
        )}
      </g>
    );
  };

  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "'Outfit', sans-serif",
        userSelect: "none",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(10px)",
          padding: "30px",
          borderRadius: "20px",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          width: "100%",
          maxWidth: "1000px",
        }}
      >
        <h1
          style={{
            color: "#2c3e50",
            fontSize: "1.8rem",
            marginBottom: "10px",
            textAlign: "center",
          }}
        >
          Tin Whistle Compositor
        </h1>
        <div
          style={{
            marginBottom: "30px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              borderRight: "1px solid #ddd",
              paddingRight: "20px",
            }}
          >
            <button
              onClick={handlePlay}
              disabled={isPlaying || notes.length === 0}
              style={{
                backgroundColor: isPlaying ? "#bdc3c7" : "#2ecc71",
                color: "white",
                border: "none",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              ▶ Play
            </button>
            <button
              onClick={handleStop}
              disabled={!isPlaying}
              style={{
                backgroundColor: !isPlaying ? "#bdc3c7" : "#f39c12",
                color: "white",
                border: "none",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              ⏹ Stop
            </button>
            <button
              onClick={handleClear}
              style={{
                backgroundColor: "#e74c3c",
                color: "white",
                border: "none",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              🗑 Clear
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "15px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setIsTextImportOpen((open) => !open)}
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: isTextImportOpen ? "#7f8c8d" : "#16a085",
                color: "white",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
                boxShadow: "0 3px 8px rgba(0,0,0,0.18)",
              }}
            >
              {isTextImportOpen ? "Close Text Import" : "Import Text"}
            </button>

            {PALETTE_ITEMS.map((item) => (
              <div
                key={item.type}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <div
                  onMouseDown={(e) => handleMouseDownOnPalette(e, item.type)}
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    backgroundColor: "#2c3e50",
                    cursor: "grab",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "white",
                    fontSize: "20px",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
                  }}
                >
                  {item.symbol}
                </div>
                <span
                  style={{ fontSize: "10px", color: "#666", fontWeight: 500 }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isTextImportOpen && (
          <form
            onSubmit={handleTextImportSubmit}
            style={{
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "#2c3e50", fontWeight: 600 }}>
              Paste notes (e.g. D D D E G A B d):
            </span>
            <textarea
              value={textImportValue}
              onChange={(e) => setTextImportValue(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                maxWidth: "700px",
                padding: "8px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                resize: "vertical",
                fontFamily: "monospace",
              }}
              placeholder="Example: D D D E G A B d B A G | D E G A B d B A ..."
            />
            <button
              type="submit"
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#16a085",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "4px",
              }}
            >
              Load Tune
            </button>
          </form>
        )}

        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "15px",
            flexWrap: "wrap",
          }}
        >
          {ORNAMENT_PALETTE_ITEMS.map((item) => (
            <div
              key={item.type}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <div
                onMouseDown={(e) =>
                  handleMouseDownOnOrnamentPalette(e, item.type)
                }
                style={{
                  width: "40px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "#34495e",
                  cursor: "grab",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "white",
                  fontSize: "14px",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.18)",
                }}
              >
                {item.symbol}
              </div>
              <span
                style={{ fontSize: "10px", color: "#666", fontWeight: 500 }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            overflowX: "auto",
            padding: "20px 0",
          }}
        >
          <svg
            ref={svgRef}
            width={STAFF_WIDTH + 60}
            height={STAFF_HEIGHT}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              backgroundColor: "#fff",
              cursor:
                draggingNoteId !== null || draggingNewType
                  ? "grabbing"
                  : "default",
              borderRadius: "10px",
              border: "1px solid #eee",
            }}
          >
            {/* Catch-all rect for mouse events */}
            <rect width="100%" height="100%" fill="transparent" />

            {STAFF_LINES.map((y) => (
              <line
                key={y}
                x1="40"
                y1={y}
                x2={STAFF_WIDTH + 40}
                y2={y}
                stroke="#dcdde1"
                strokeWidth="1"
              />
            ))}
            {Array.from({ length: TOTAL_BARS + 1 }).map((_, i) => (
              <line
                key={i}
                x1={40 + i * BAR_WIDTH}
                y1={230}
                x2={40 + i * BAR_WIDTH}
                y2={270}
                stroke="#dcdde1"
                strokeWidth="1"
              />
            ))}
            <text x="10" y="275" fontSize="60" fill="#2c3e50" opacity="0.3">
              𝄞
            </text>
            {isPlaying && (
              <line
                x1={playheadX}
                y1="50"
                x2={playheadX}
                y2="450"
                stroke="#2ecc71"
                strokeWidth="3"
                strokeDasharray="4"
              />
            )}
            {notes.map((note) => (
              <g
                key={note.id}
                onMouseDown={(e) => handleMouseDownOnNote(e, note.id)}
                onClick={(e) => handleClickOnNote(e, note.id)}
              >
                {renderNoteIcon(note)}
              </g>
            ))}
            {draggingNewType &&
              renderNoteIcon(
                { type: draggingNewType, x: newNotePos.x, y: newNotePos.y },
                true,
              )}
            {draggingOrnamentType && (
              <g
                transform={`translate(${ornamentPos.x}, ${ornamentPos.y})`}
                style={{ pointerEvents: "none" }}
              >
                <rect
                  x={-10}
                  y={-10}
                  width={20}
                  height={20}
                  rx={6}
                  ry={6}
                  fill="rgba(52, 73, 94, 0.2)"
                  stroke="#34495e"
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#34495e"
                  fontWeight="bold"
                >
                  {ORNAMENT_SYMBOL_MAP[draggingOrnamentType]}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default CustomCompositor;