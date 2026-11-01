import {
  createMaterialSamples,
  type MaterialSoundStyle,
} from "./material-sounds";

export type SoundStyle = "soft" | "digital" | "wood" | MaterialSoundStyle;
export type SoundCue = "place" | "wire" | "connect" | "remove";

export const soundStyles: {
  id: SoundStyle;
  name: string;
  description: string;
  character: string;
  collection: "original" | "new";
}[] = [
  {
    id: "soft",
    name: "Soft tactile",
    description: "Cushioned taps. A gentle snap when things connect.",
    character: "Quiet & rounded",
    collection: "original",
  },
  {
    id: "digital",
    name: "Clean digital",
    description: "Crisp clicks. A light, glassy finish to each connection.",
    character: "Precise & bright",
    collection: "original",
  },
  {
    id: "wood",
    name: "Warm wood",
    description: "Small, dry knocks. Like pieces finding their place.",
    character: "Warm & natural",
    collection: "original",
  },
  {
    id: "felt",
    name: "Felt keys",
    description: "A muted key touch, with a warm, soft finish.",
    character: "Mellow & soft",
    collection: "new",
  },
  {
    id: "porcelain",
    name: "Porcelain",
    description: "A delicate ceramic tap with a tiny, clear ring.",
    character: "Light & delicate",
    collection: "new",
  },
  {
    id: "magnetic",
    name: "Magnetic snap",
    description: "A cushioned click that settles into place.",
    character: "Solid & precise",
    collection: "new",
  },
  {
    id: "droplet",
    name: "Water drop",
    description: "A rounded little droplet. Smooth and playful.",
    character: "Fluid & playful",
    collection: "new",
  },
];

export const workspaceSound = soundStyles.find((style) => style.id === "felt")!;

export const soundCues: { id: SoundCue; name: string; description: string }[] =
  [
    {
      id: "place",
      name: "Place component",
      description: "A small tap as it lands",
    },
    { id: "wire", name: "Start a wire", description: "A quiet pick-up click" },
    {
      id: "connect",
      name: "Complete connection",
      description: "A satisfying little snap",
    },
    { id: "remove", name: "Remove an item", description: "A soft release" },
  ];

const cueDuration: Record<SoundCue, number> = {
  place: 0.14,
  wire: 0.055,
  connect: 0.19,
  remove: 0.14,
};

/** Original, deterministic one-shot sounds. No recordings or remote assets. */
export function createSoundSamples(
  style: SoundStyle,
  cue: SoundCue,
  sampleRate: number,
): Float32Array<ArrayBuffer> {
  if (
    style === "felt" ||
    style === "porcelain" ||
    style === "magnetic" ||
    style === "droplet"
  )
    return createMaterialSamples(style, cue, sampleRate);
  const duration = cueDuration[cue];
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  const baseFrequency = { soft: 240, digital: 920, wood: 430 }[style];
  const cuePitch = { place: 1, wire: 1.8, connect: 1.22, remove: 0.8 }[cue];
  const cueGain = { place: 0.74, wire: 0.28, connect: 0.68, remove: 0.49 }[cue];
  const decay = { soft: 0.025, digital: 0.024, wood: 0.019 }[style];
  const partials = {
    soft: [
      [1, 0.82],
      [1.9, 0.13],
      [3.4, 0.05],
    ],
    digital: [
      [1, 0.54],
      [1.5, 0.26],
      [2.76, 0.13],
      [4.07, 0.07],
    ],
    wood: [
      [1, 0.53],
      [2.19, 0.25],
      [3.83, 0.15],
      [5.12, 0.07],
    ],
  }[style];
  let seed = 0x1a2b3c4d;
  let filteredNoise = 0;

  const strike = (t: number, pitch: number) => {
    if (t < 0) return 0;
    const attack = 1 - Math.exp(-t / 0.0012);
    const tail = Math.exp(-t / (cue === "wire" ? decay * 0.55 : decay));
    const slope = cue === "remove" ? -1300 : style === "soft" ? -850 : -250;
    const phase = 2 * Math.PI * (pitch * t + 0.5 * slope * t * t);
    return (
      partials.reduce(
        (sum, [ratio, gain]) =>
          sum +
          Math.sin(phase * ratio) * gain * Math.exp(-t * (ratio - 1) * 12),
        0,
      ) *
      attack *
      tail
    );
  };

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    filteredNoise += (noise - filteredNoise) * (style === "soft" ? 0.16 : 0.65);
    const pitch = baseFrequency * cuePitch;
    const body =
      cue === "connect"
        ? strike(t, pitch) * 0.62 + strike(t - 0.033, pitch * 1.28) * 0.8
        : strike(t, pitch);
    const transient =
      filteredNoise * Math.exp(-t / 0.007) * (style === "wood" ? 0.3 : 0.11);
    const fade = Math.min(
      1,
      t / 0.001,
      (samples.length - 1 - i) / (sampleRate * 0.012),
    );
    samples[i] =
      Math.max(-0.72, Math.min(0.72, (body + transient) * cueGain)) *
      Math.max(0, fade);
  }
  return samples;
}
