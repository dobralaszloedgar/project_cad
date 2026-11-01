/** Original, procedural candidates for the simulation-sound preview only. */
import {
  musicBoxVariants,
  type MusicBoxSound,
  type MusicBoxVariant,
} from "./music-box-variants";

export const soundFamilies = [
  "Music box",
  "Tactile",
  "Chimes",
  "Musical",
  "Minimal",
] as const;
export type SoundFamily = (typeof soundFamilies)[number];
export type SimulationOutcome = "complete" | "attention";

export const completionSounds = [
  ...musicBoxVariants,
  {
    id: "felt-finish",
    name: "Felt finish",
    description: "Two soft notes. A familiar, gentle finish.",
    character: "Warm · tactile",
    duration: 0.68,
    recommended: true,
    family: "Tactile",
    attention: {
      name: "Felt pause",
      description: "A low, descending pair with a cushioned finish.",
      duration: 0.68,
    },
  },
  {
    id: "clear-chime",
    name: "Clear chime",
    description: "A small glass bell with an airy tail.",
    character: "Light · clear",
    duration: 0.62,
    recommended: false,
    family: "Chimes",
    attention: {
      name: "Muted chime",
      description: "Two subdued bell notes, without a sharp ring.",
      duration: 0.66,
    },
  },
  {
    id: "warm-resolve",
    name: "Warm resolve",
    description: "A mellow chord that settles into place.",
    character: "Rounded · musical",
    duration: 0.82,
    recommended: false,
    family: "Musical",
    attention: {
      name: "Unresolved chord",
      description: "A quiet suspended chord that invites another look.",
      duration: 0.82,
    },
  },
  {
    id: "quiet-pulse",
    name: "Quiet pulse",
    description: "One understated note, then back to work.",
    character: "Minimal · soft",
    duration: 0.38,
    recommended: false,
    family: "Minimal",
    attention: {
      name: "Double pulse",
      description: "Two low pulses with a small pause between them.",
      duration: 0.54,
    },
  },
  {
    id: "soft-marimba",
    name: "Soft marimba",
    description: "A warm wooden note with a small upward answer.",
    character: "Woody · rounded",
    duration: 0.64,
    recommended: false,
    family: "Tactile",
    attention: {
      name: "Marimba pause",
      description: "A warm wooden pair that gently steps down.",
      duration: 0.64,
    },
  },
  {
    id: "porcelain-dots",
    name: "Porcelain dots",
    description: "Two delicate ceramic taps, lightly spaced.",
    character: "Delicate · crisp",
    duration: 0.58,
    recommended: false,
    family: "Chimes",
    attention: {
      name: "Porcelain pause",
      description: "A small ceramic tick, answered a little lower.",
      duration: 0.62,
    },
  },
  {
    id: "glass-bloom",
    name: "Glass bloom",
    description: "One translucent tone that opens and fades.",
    character: "Airy · resonant",
    duration: 0.9,
    recommended: false,
    family: "Chimes",
    attention: {
      name: "Glass hush",
      description: "A descending glass tone with a softened tail.",
      duration: 0.84,
    },
  },
  {
    id: "bamboo-knock",
    name: "Bamboo knock",
    description: "Three hollow taps with a light, natural rhythm.",
    character: "Hollow · organic",
    duration: 0.56,
    recommended: false,
    family: "Tactile",
    attention: {
      name: "Bamboo double",
      description: "Two hollow taps, a little apart.",
      duration: 0.56,
    },
  },
  {
    id: "velvet-bell",
    name: "Velvet bell",
    description: "A low bell with its bright edges softened.",
    character: "Low · mellow",
    duration: 0.78,
    recommended: false,
    family: "Musical",
    attention: {
      name: "Velvet pause",
      description: "A low bell followed by a softer answer.",
      duration: 0.76,
    },
  },
  {
    id: "water-pearl",
    name: "Water pearl",
    description: "A rounded drop with a little upward bounce.",
    character: "Fluid · playful",
    duration: 0.5,
    recommended: false,
    family: "Minimal",
    attention: {
      name: "Water ripple",
      description: "Two rounded drops that settle downward.",
      duration: 0.6,
    },
  },
  {
    id: "cloud-lift",
    name: "Cloud lift",
    description: "A soft swell that rises into a clear finish.",
    character: "Floating · smooth",
    duration: 0.88,
    recommended: false,
    family: "Minimal",
    attention: {
      name: "Cloud pause",
      description: "A soft, descending tone that fades into quiet.",
      duration: 0.88,
    },
  },
  {
    id: "paper-lantern",
    name: "Paper lantern",
    description: "A dry brushed note with a warm little glow.",
    character: "Brushed · intimate",
    duration: 0.48,
    recommended: false,
    family: "Minimal",
    attention: {
      name: "Paper pause",
      description: "Two dry, brushed notes with almost no ring.",
      duration: 0.54,
    },
  },
  {
    id: "copper-glow",
    name: "Copper glow",
    description: "A muted metal bell with a lingering warmth.",
    character: "Metallic · warm",
    duration: 0.76,
    recommended: false,
    family: "Chimes",
    attention: {
      name: "Copper pause",
      description: "A low metallic note with a muted reply.",
      duration: 0.72,
    },
  },
  {
    id: "nylon-pluck",
    name: "Nylon pluck",
    description: "Two soft string plucks, gently rising.",
    character: "Plucked · natural",
    duration: 0.72,
    recommended: false,
    family: "Tactile",
    attention: {
      name: "Nylon pause",
      description: "Two gentle string plucks, falling a whole step.",
      duration: 0.7,
    },
  },
  {
    id: "warm-rhodes",
    name: "Warm Rhodes",
    description: "An electric-piano pair with a rounded attack.",
    character: "Velvety · electric",
    duration: 0.84,
    recommended: false,
    family: "Musical",
    attention: {
      name: "Rhodes pause",
      description: "A warm, unfinished interval with a short tail.",
      duration: 0.78,
    },
  },
  {
    id: "celesta-wink",
    name: "Celesta wink",
    description: "Two small bell keys with a sparkling answer.",
    character: "Bright · delicate",
    duration: 0.68,
    recommended: false,
    family: "Chimes",
    attention: {
      name: "Celesta pause",
      description: "Two delicate keys, lower on the second note.",
      duration: 0.68,
    },
  },
  {
    id: "satin-chord",
    name: "Satin chord",
    description: "A close, soft chord that settles all at once.",
    character: "Smooth · harmonic",
    duration: 0.92,
    recommended: false,
    family: "Musical",
    attention: {
      name: "Satin pause",
      description: "A hushed suspended chord, then silence.",
      duration: 0.9,
    },
  },
  {
    id: "orbit-lift",
    name: "Orbit lift",
    description: "A subtle electronic tone that glides upward.",
    character: "Clean · modern",
    duration: 0.6,
    recommended: false,
    family: "Minimal",
    attention: {
      name: "Orbit pause",
      description: "A soft electronic note that bends downward.",
      duration: 0.6,
    },
  },
  {
    id: "wooden-close",
    name: "Wooden close",
    description: "A low wooden tap with a neat, quiet answer.",
    character: "Grounded · dry",
    duration: 0.46,
    recommended: false,
    family: "Tactile",
    attention: {
      name: "Wooden double",
      description: "Two low knocks with a soft second tap.",
      duration: 0.5,
    },
  },
] as const;

export type CompletionSound = (typeof completionSounds)[number]["id"];

export function soundDetails(
  style: CompletionSound,
  outcome: SimulationOutcome,
) {
  const sound = completionSounds.find((candidate) => candidate.id === style)!;
  return outcome === "attention" ? sound.attention : sound;
}

type Voice = {
  start: number;
  frequency: number;
  level: number;
  decay: number;
  attack: number;
  // Frequency ratio, relative level, decay multiplier.
  partials: readonly (readonly [number, number, number])[];
  bend?: number;
  bendTime?: number;
  noise?: number;
};

const felt = [
  [1, 1, 1],
  [2, 0.2, 0.62],
  [3.01, 0.045, 0.35],
] as const;
const rounded = [
  [1, 1, 1],
  [2, 0.075, 0.55],
] as const;
const wood = [
  [1, 1, 1],
  [2.78, 0.32, 0.45],
  [5.4, 0.07, 0.25],
] as const;
const porcelain = [
  [1, 1, 1],
  [2.41, 0.24, 0.8],
  [4.92, 0.06, 0.45],
] as const;
const glass = [
  [1, 1, 1],
  [2, 0.12, 0.85],
  [2.756, 0.18, 0.8],
  [4.07, 0.025, 0.35],
] as const;
const bamboo = [
  [1, 1, 1],
  [1.48, 0.15, 0.65],
  [2.93, 0.22, 0.4],
] as const;
const velvet = [
  [1, 1, 1],
  [2, 0.14, 0.5],
  [3, 0.035, 0.32],
] as const;
const water = [
  [1, 1, 1],
  [2, 0.25, 0.5],
] as const;
const cloud = [
  [1, 1, 1],
  [2, 0.11, 0.9],
  [3, 0.03, 0.6],
] as const;
const copper = [
  [1, 1, 1],
  [2.01, 0.1, 0.9],
  [3.16, 0.19, 0.55],
  [4.3, 0.03, 0.3],
] as const;
const nylon = [
  [1, 1, 1],
  [2, 0.28, 0.65],
  [3, 0.1, 0.45],
  [4, 0.025, 0.25],
] as const;
const rhodes = [
  [1, 1, 1],
  [2.003, 0.35, 0.6],
  [3.98, 0.075, 0.3],
] as const;
const celesta = [
  [1, 1, 1],
  [2.97, 0.14, 0.7],
  [5.02, 0.02, 0.25],
] as const;

function note(
  frequency: number,
  partials: Voice["partials"],
  options: Partial<Omit<Voice, "frequency" | "partials">> = {},
): Voice {
  return {
    frequency,
    partials,
    start: 0,
    level: 1,
    decay: 0.13,
    attack: 0.006,
    ...options,
  };
}

function musicBoxPhrase(
  variant: MusicBoxVariant,
  outcome: SimulationOutcome,
): readonly Voice[] {
  const keys =
    outcome === "attention" ? variant.failureNotes : variant.successNotes;
  const partials = [
    [1, 1, 1],
    [3, variant.third, 0.6],
    [5.01, variant.fifth, 0.4],
  ] as const;
  return keys.map((key) =>
    note(key.frequency, partials, {
      start: key.start,
      level: key.level,
      attack: variant.attack,
      decay: key.decay ?? variant.decay,
    }),
  );
}

const musicBoxPhrases = (outcome: SimulationOutcome) =>
  Object.fromEntries(
    musicBoxVariants.map((variant) => [
      variant.id,
      musicBoxPhrase(variant, outcome),
    ]),
  ) as Record<MusicBoxSound, readonly Voice[]>;

const voices: Record<CompletionSound, readonly Voice[]> = {
  ...musicBoxPhrases("complete"),
  "felt-finish": [
    {
      start: 0,
      frequency: 392,
      level: 0.78,
      decay: 0.11,
      attack: 0.005,
      partials: felt,
    },
    {
      start: 0.135,
      frequency: 523.25,
      level: 0.88,
      decay: 0.15,
      attack: 0.005,
      partials: felt,
    },
  ],
  "clear-chime": [
    {
      start: 0,
      frequency: 783.99,
      level: 1,
      decay: 0.14,
      attack: 0.004,
      partials: [
        [1, 1, 1],
        [2.76, 0.16, 0.42],
        [4.08, 0.035, 0.25],
      ],
    },
    {
      start: 0.085,
      frequency: 1046.5,
      level: 0.18,
      decay: 0.11,
      attack: 0.009,
      partials: rounded,
    },
  ],
  "warm-resolve": [
    {
      start: 0,
      frequency: 261.63,
      level: 0.62,
      decay: 0.2,
      attack: 0.018,
      partials: rounded,
    },
    {
      start: 0.024,
      frequency: 329.63,
      level: 0.43,
      decay: 0.19,
      attack: 0.018,
      partials: rounded,
    },
    {
      start: 0.048,
      frequency: 392,
      level: 0.52,
      decay: 0.18,
      attack: 0.018,
      partials: rounded,
    },
  ],
  "quiet-pulse": [
    {
      start: 0,
      frequency: 440,
      level: 1,
      decay: 0.075,
      attack: 0.008,
      partials: rounded,
      bend: -28,
    },
  ],
  "soft-marimba": [
    note(349.23, wood, { decay: 0.09 }),
    note(523.25, wood, { start: 0.14, level: 0.8, decay: 0.12 }),
  ],
  "porcelain-dots": [
    note(698.46, porcelain, { decay: 0.065 }),
    note(880, porcelain, { start: 0.11, level: 0.75, decay: 0.09 }),
  ],
  "glass-bloom": [
    note(659.25, glass, { attack: 0.035, decay: 0.24 }),
    note(1318.5, rounded, {
      start: 0.09,
      level: 0.075,
      attack: 0.05,
      decay: 0.19,
    }),
  ],
  "bamboo-knock": [
    note(493.88, bamboo, { decay: 0.04 }),
    note(587.33, bamboo, { start: 0.09, level: 0.65, decay: 0.045 }),
    note(659.25, bamboo, { start: 0.21, level: 0.8, decay: 0.065 }),
  ],
  "velvet-bell": [
    note(293.66, velvet, { attack: 0.015, decay: 0.21 }),
    note(587.33, glass, {
      start: 0.035,
      level: 0.17,
      attack: 0.02,
      decay: 0.16,
    }),
  ],
  "water-pearl": [
    note(587.33, water, { bend: -170, bendTime: 0.018, decay: 0.075 }),
    note(880, rounded, { start: 0.105, level: 0.3, bend: -90, decay: 0.09 }),
  ],
  "cloud-lift": [
    note(349.23, cloud, {
      attack: 0.065,
      decay: 0.22,
      bend: -45,
      bendTime: 0.13,
    }),
    note(523.25, cloud, {
      start: 0.15,
      level: 0.55,
      attack: 0.055,
      decay: 0.18,
    }),
  ],
  "paper-lantern": [
    note(392, felt, { attack: 0.012, decay: 0.07, noise: 0.14 }),
    note(783.99, rounded, { start: 0.045, level: 0.12, decay: 0.1 }),
  ],
  "copper-glow": [
    note(440, copper, { attack: 0.01, decay: 0.19 }),
    note(659.25, copper, { start: 0.11, level: 0.35, decay: 0.14 }),
  ],
  "nylon-pluck": [
    note(329.63, nylon, { attack: 0.004, decay: 0.13 }),
    note(493.88, nylon, {
      start: 0.14,
      level: 0.8,
      attack: 0.004,
      decay: 0.16,
    }),
  ],
  "warm-rhodes": [
    note(261.63, rhodes, { attack: 0.009, decay: 0.17 }),
    note(392, rhodes, { start: 0.17, level: 0.7, attack: 0.01, decay: 0.19 }),
  ],
  "celesta-wink": [
    note(880, celesta, { attack: 0.005, decay: 0.1 }),
    note(1174.66, celesta, {
      start: 0.12,
      level: 0.6,
      attack: 0.006,
      decay: 0.14,
    }),
  ],
  "satin-chord": [
    note(220, rounded, { attack: 0.04, decay: 0.24 }),
    note(277.18, rounded, {
      start: 0.01,
      level: 0.75,
      attack: 0.035,
      decay: 0.22,
    }),
    note(329.63, rounded, {
      start: 0.02,
      level: 0.65,
      attack: 0.035,
      decay: 0.23,
    }),
    note(440, rounded, { start: 0.03, level: 0.2, attack: 0.045, decay: 0.2 }),
  ],
  "orbit-lift": [
    note(622.25, rounded, {
      attack: 0.024,
      decay: 0.16,
      bend: -180,
      bendTime: 0.1,
    }),
    note(1244.5, rounded, {
      start: 0.08,
      level: 0.08,
      attack: 0.025,
      decay: 0.12,
    }),
  ],
  "wooden-close": [
    note(261.63, wood, { decay: 0.055, attack: 0.004 }),
    note(349.23, wood, {
      start: 0.09,
      level: 0.55,
      decay: 0.065,
      attack: 0.004,
    }),
  ],
};

function fallingPair(
  style: CompletionSound,
  gap = 0.17,
  ratio = 0.89,
): readonly Voice[] {
  const base = voices[style][0];
  const first = {
    ...base,
    frequency: base.frequency * 0.82,
    level: 0.85,
    decay: Math.min(base.decay, 0.14),
  };
  return [
    first,
    { ...first, start: gap, frequency: first.frequency * ratio, level: 0.7 },
  ];
}

// Unsuccessful runs stay gentle: lower registers, descending answers and
// suspended intervals make the outcome distinct without a harsh alarm.
const attentionVoices: Record<CompletionSound, readonly Voice[]> = {
  ...musicBoxPhrases("attention"),
  "felt-finish": fallingPair("felt-finish"),
  "clear-chime": fallingPair("clear-chime", 0.18, 0.84),
  "warm-resolve": [
    note(246.94, rounded, { attack: 0.022, decay: 0.2 }),
    note(293.66, rounded, {
      start: 0.025,
      level: 0.55,
      attack: 0.022,
      decay: 0.18,
    }),
    note(369.99, rounded, {
      start: 0.05,
      level: 0.4,
      attack: 0.022,
      decay: 0.17,
    }),
  ],
  "quiet-pulse": [
    note(349.23, rounded, { decay: 0.065, attack: 0.01 }),
    note(311.13, rounded, {
      start: 0.18,
      level: 0.8,
      decay: 0.07,
      attack: 0.01,
    }),
  ],
  "soft-marimba": fallingPair("soft-marimba", 0.2),
  "porcelain-dots": fallingPair("porcelain-dots", 0.18, 0.94),
  "glass-bloom": [
    note(554.37, glass, {
      attack: 0.04,
      decay: 0.23,
      bend: 55,
      bendTime: 0.12,
    }),
  ],
  "bamboo-knock": fallingPair("bamboo-knock", 0.23, 0.96),
  "velvet-bell": fallingPair("velvet-bell", 0.22, 0.84),
  "water-pearl": [
    note(493.88, water, { bend: 110, bendTime: 0.025, decay: 0.075 }),
    note(392, water, {
      start: 0.18,
      level: 0.65,
      bend: 70,
      bendTime: 0.03,
      decay: 0.085,
    }),
  ],
  "cloud-lift": [
    note(311.13, cloud, {
      attack: 0.075,
      decay: 0.23,
      bend: 70,
      bendTime: 0.16,
    }),
    note(233.08, cloud, { start: 0.17, level: 0.4, attack: 0.06, decay: 0.18 }),
  ],
  "paper-lantern": fallingPair("paper-lantern", 0.17, 0.94),
  "copper-glow": fallingPair("copper-glow", 0.18, 0.84),
  "nylon-pluck": fallingPair("nylon-pluck", 0.2),
  "warm-rhodes": [
    note(233.08, rhodes, { attack: 0.015, decay: 0.17 }),
    note(311.13, rhodes, {
      start: 0.13,
      level: 0.55,
      attack: 0.015,
      decay: 0.18,
    }),
  ],
  "celesta-wink": fallingPair("celesta-wink", 0.2, 0.84),
  "satin-chord": [
    note(196, rounded, { attack: 0.045, decay: 0.23 }),
    note(261.63, rounded, {
      start: 0.02,
      level: 0.6,
      attack: 0.045,
      decay: 0.22,
    }),
    note(293.66, rounded, {
      start: 0.04,
      level: 0.45,
      attack: 0.05,
      decay: 0.22,
    }),
  ],
  "orbit-lift": [
    note(415.3, rounded, {
      attack: 0.025,
      decay: 0.16,
      bend: 160,
      bendTime: 0.11,
    }),
  ],
  "wooden-close": fallingPair("wooden-close", 0.19, 0.94),
};

export function createCompletionSamples(
  style: CompletionSound,
  sampleRate: number,
  outcome: SimulationOutcome = "complete",
): Float32Array<ArrayBuffer> {
  const { duration } = soundDetails(style, outcome);
  const activeVoices =
    outcome === "attention" ? attentionVoices[style] : voices[style];
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  const tau = Math.PI * 2;
  const highPass = Math.exp((-tau * 30) / sampleRate);
  let previousInput = 0;
  let previousOutput = 0;
  let energy = 0;
  let peak = 0;
  let noiseSeed = 73421;
  const noiseStates = new Float64Array(activeVoices.length);
  const noiseSmoothing = 1 - Math.exp((-tau * 1100) / sampleRate);

  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    let value = 0;
    for (let v = 0; v < activeVoices.length; v++) {
      const voice = activeVoices[v];
      const age = time - voice.start;
      if (age < 0) continue;
      const attack =
        age < voice.attack
          ? (1 - Math.cos((Math.PI * age) / voice.attack)) / 2
          : 1;
      const phase =
        tau *
        (voice.frequency * age +
          (voice.bend ?? 0) *
            (voice.bendTime ?? 0.025) *
            (1 - Math.exp(-age / (voice.bendTime ?? 0.025))));
      for (const [ratio, level, decay] of voice.partials) {
        // Omit partials beyond Nyquist when rendering the small UI waveform.
        if (voice.frequency * ratio >= sampleRate * 0.45) continue;
        value +=
          Math.sin(phase * ratio) *
          level *
          voice.level *
          attack *
          Math.exp(-age / (voice.decay * decay));
      }
      if (voice.noise) {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
        noiseStates[v] +=
          noiseSmoothing * (noiseSeed / 2147483648 - 1 - noiseStates[v]);
        value +=
          noiseStates[v] *
          voice.noise *
          voice.level *
          attack *
          Math.exp(-age / 0.025);
      }
    }
    const filtered = highPass * (previousOutput + value - previousInput);
    previousInput = value;
    previousOutput = filtered;
    const remaining = (samples.length - 1 - i) / sampleRate;
    const fade =
      remaining < 0.035 ? (1 - Math.cos((Math.PI * remaining) / 0.035)) / 2 : 1;
    samples[i] = filtered * fade;
    peak = Math.max(peak, Math.abs(samples[i]));
    energy += samples[i] ** 2 / sampleRate;
  }

  // Match energy across candidates without clipping their transients.
  const gain = Math.min(
    Math.sqrt(0.0045 / Math.max(energy, 1e-9)),
    0.6 / Math.max(peak, 1e-9),
  );
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}
