import * as Tone from "tone";

let synth: Tone.PolySynth | null = null;
let initialized = false;

// Call this on a direct user click (e.g., Play button)
export const ensureAudioContext = async () => {
  if (!initialized) {
    await Tone.start();
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.1 },
    }).toDestination();
    initialized = true;
  }
};

// Convert "c#/6" → "C#6", "b/5" → "B5"
const toTonePitch = (pitch: string): string => {
  const [note, octave] = pitch.split("/");
  return note.charAt(0).toUpperCase() + note.slice(1) + octave;
};

export const playToneNote = async (keys: string[], duration: string) => {
  await ensureAudioContext();
  if (!synth) return;

  const realPitches = keys.map(toTonePitch);
  const toneDur = duration.includes("h")
    ? "2n"
    : duration.includes("8")
      ? "8n"
      : "16n";

  synth.triggerAttackRelease(realPitches, toneDur);
};

export const playComposition = async (notes: any[]) => {
  await ensureAudioContext();
  if (!synth) return;

  const now = Tone.now();
  let timeOffset = now + 0.1;

  notes.forEach((note) => {
    const t = note.duration.includes("h")
      ? 1.0
      : note.duration.includes("8")
        ? 0.25
        : note.duration.includes("16")
          ? 0.125
          : 0.5;

    if (!note.isRest && note.keys) {
      const realPitches = note.keys.map((k: string) => toTonePitch(k));
      const toneDur = note.duration.includes("h")
        ? "2n"
        : note.duration.includes("8")
          ? "8n"
          : note.duration.includes("16")
            ? "16n"
            : "4n";
      synth!.triggerAttackRelease(realPitches, toneDur, timeOffset);
    }

    timeOffset += t;
  });
};
