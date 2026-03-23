export type TimeSignatureType = "4/4" | "3/4" | "6/8";

export interface TimeSignature {
  type: TimeSignatureType;
  beatsPerMeasure: number; // The top number (numerator)
  beatValue: number; // The bottom number (denominator)
  ticksPerMeasure: number; // Total duration in quarter-note units
}

export interface NoteEvent {
  id: string;
  duration: "q" | "h" | "8" | "16" | "qr" | "hr" | "8r" | "16r" | "wr"; // VexFlow codes
  keys: string[];
  clef: "treble" | "bass";
  isRest: boolean;
  ticks: number; // Duration in quarter-note units (q=1, 8=0.5, h=2)
}

export interface Measure {
  id: string;
  notes: NoteEvent[];
  timeSignature: TimeSignature;
}

export interface Composition {
  tempo: number;
  measures: Measure[];
}
