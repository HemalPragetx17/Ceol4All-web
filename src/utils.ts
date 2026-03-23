import type { TimeSignature, TimeSignatureType } from "./types";

export const TIME_SIG_CONFIG: Record<TimeSignatureType, TimeSignature> = {
  "4/4": { type: "4/4", beatsPerMeasure: 4, beatValue: 4, ticksPerMeasure: 4 },
  "3/4": { type: "3/4", beatsPerMeasure: 3, beatValue: 4, ticksPerMeasure: 3 },
  "6/8": { type: "6/8", beatsPerMeasure: 6, beatValue: 8, ticksPerMeasure: 3 },
};

export const getDurationTicks = (duration: string): number => {
  const mapping: Record<string, number> = { h: 2, q: 1, "8": 0.5, "16": 0.25 };
  return mapping[duration.replace("r", "")] || 1;
};

export const getPitchFromY = (
  y: number,
): { pitch: string; clef: "treble" | "bass" } => {
  if (y < 115) {
    // Treble
    const referenceY = 40; // F5
    const steps = Math.round((y - referenceY) / 5);
    const pitches = [
      "c/6",
      "b/5",
      "a/5",
      "g/5",
      "f/5",
      "e/5",
      "d/5",
      "c/5",
      "b/4",
      "a/4",
      "g/4",
      "f/4",
      "e/4",
      "d/4",
      "c/4",
    ];
    const index = 4 + steps;
    const clampedIndex = Math.max(0, Math.min(index, pitches.length - 1));
    return { pitch: pitches[clampedIndex], clef: "treble" };
  } else {
    // Bass
    const referenceY = 160; // A3
    const steps = Math.round((y - referenceY) / 5);
    const pitches = [
      "e/4",
      "d/4",
      "c/4",
      "b/3",
      "a/3",
      "g/3",
      "f/3",
      "e/3",
      "d/3",
      "c/3",
      "b/2",
      "a/2",
      "g/2",
      "f/2",
      "e/2",
    ];
    const index = 4 + steps;
    const clampedIndex = Math.max(0, Math.min(index, pitches.length - 1));
    return { pitch: pitches[clampedIndex], clef: "bass" };
  }
};
