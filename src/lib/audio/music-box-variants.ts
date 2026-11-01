type MusicBoxNote = {
  frequency: number;
  start: number;
  level: number;
  decay?: number;
};

type MusicBoxDefinition = {
  id: string;
  name: string;
  description: string;
  character: string;
  duration: number;
  attack: number;
  decay: number;
  third: number;
  fifth: number;
  successNotes: readonly MusicBoxNote[];
  // Each unsuccessful cue has precisely two key strikes, with no extra layers.
  failureNotes: readonly [MusicBoxNote, MusicBoxNote];
  attention: { description: string; duration: number };
};

const key = (
  frequency: number,
  start: number,
  level = 1,
  decay?: number,
): MusicBoxNote => ({
  frequency,
  start,
  level,
  ...(decay === undefined ? {} : { decay }),
});

const definitions = [
  {
    id: "music-box",
    name: "Classic",
    description: "The original tiny phrase, with a bright final note.",
    character: "Familiar · melodic",
    duration: 0.86,
    attack: 0.006,
    decay: 0.13,
    third: 0.14,
    fifth: 0.05,
    successNotes: [
      key(659.25, 0, 1, 0.11),
      key(783.99, 0.13, 0.75, 0.12),
      key(987.77, 0.27, 0.65, 0.17),
    ],
    failureNotes: [key(783.99, 0, 1, 0.11), key(659.25, 0.18, 0.75, 0.14)],
    attention: {
      description: "Two delicate notes, gently stepping down.",
      duration: 0.74,
    },
  },
  {
    id: "music-box-walnut",
    name: "Warm walnut",
    description: "A lower, softer melody with a wooden-box warmth.",
    character: "Low · warm",
    duration: 0.88,
    attack: 0.009,
    decay: 0.16,
    third: 0.085,
    fifth: 0.018,
    successNotes: [
      key(523.25, 0),
      key(659.25, 0.16, 0.8),
      key(783.99, 0.33, 0.7),
    ],
    failureNotes: [key(659.25, 0), key(523.25, 0.22, 0.78)],
    attention: {
      description: "Two warm, lower notes with a little breathing room.",
      duration: 0.8,
    },
  },
  {
    id: "music-box-starlight",
    name: "Starlight",
    description: "Three airy notes that climb into a little sparkle.",
    character: "High · airy",
    duration: 0.84,
    attack: 0.008,
    decay: 0.14,
    third: 0.09,
    fifth: 0.02,
    successNotes: [
      key(783.99, 0),
      key(1046.5, 0.12, 0.72),
      key(1318.51, 0.25, 0.56),
    ],
    failureNotes: [key(1046.5, 0), key(880, 0.17, 0.75)],
    attention: {
      description: "Two airy notes that settle rather than sparkle.",
      duration: 0.7,
    },
  },
  {
    id: "music-box-waltz",
    name: "Tiny waltz",
    description: "A playful four-note turn with a lilting finish.",
    character: "Lilting · playful",
    duration: 0.96,
    attack: 0.006,
    decay: 0.13,
    third: 0.16,
    fifth: 0.04,
    successNotes: [
      key(523.25, 0),
      key(783.99, 0.12, 0.65),
      key(659.25, 0.25, 0.7),
      key(1046.5, 0.4, 0.6),
    ],
    failureNotes: [key(783.99, 0), key(622.25, 0.23, 0.75)],
    attention: {
      description: "A soft two-note fall, with a deliberate pause.",
      duration: 0.78,
    },
  },
  {
    id: "music-box-rise",
    name: "Gentle rise",
    description: "Four small steps upward, ending on a clear octave.",
    character: "Uplifting · clear",
    duration: 0.9,
    attack: 0.007,
    decay: 0.14,
    third: 0.12,
    fifth: 0.03,
    successNotes: [
      key(587.33, 0),
      key(739.99, 0.1, 0.8),
      key(880, 0.21, 0.7),
      key(1174.66, 0.33, 0.6),
    ],
    failureNotes: [key(880, 0), key(739.99, 0.19, 0.76)],
    attention: {
      description: "Two clear notes that step back down softly.",
      duration: 0.74,
    },
  },
  {
    id: "music-box-honey",
    name: "Honey chime",
    description: "A mellow major phrase with a rounded, glowing tail.",
    character: "Mellow · rounded",
    duration: 0.95,
    attack: 0.012,
    decay: 0.18,
    third: 0.075,
    fifth: 0.015,
    successNotes: [
      key(698.46, 0),
      key(880, 0.16, 0.8),
      key(1046.5, 0.31, 0.68),
    ],
    failureNotes: [key(880, 0), key(698.46, 0.22, 0.8)],
    attention: {
      description: "A mellow two-note descent with a soft tail.",
      duration: 0.88,
    },
  },
  {
    id: "music-box-porcelain",
    name: "Porcelain box",
    description: "A delicate, widely spaced phrase with a crisp finish.",
    character: "Delicate · precise",
    duration: 0.82,
    attack: 0.005,
    decay: 0.115,
    third: 0.17,
    fifth: 0.045,
    successNotes: [
      key(659.25, 0),
      key(987.77, 0.15, 0.65),
      key(1318.51, 0.3, 0.5),
    ],
    failureNotes: [key(987.77, 0), key(830.61, 0.16, 0.75)],
    attention: {
      description: "Two precise little keys, lower on the second.",
      duration: 0.64,
    },
  },
  {
    id: "music-box-moonlight",
    name: "Moonlight",
    description: "A low, unhurried melody that opens into a soft octave.",
    character: "Low · unhurried",
    duration: 0.98,
    attack: 0.011,
    decay: 0.15,
    third: 0.095,
    fifth: 0.025,
    successNotes: [
      key(440, 0),
      key(554.37, 0.14, 0.75),
      key(659.25, 0.28, 0.7),
      key(880, 0.43, 0.58),
    ],
    failureNotes: [key(659.25, 0), key(554.37, 0.25, 0.8)],
    attention: {
      description: "Two quiet lower keys with an unhurried answer.",
      duration: 0.84,
    },
  },
  {
    id: "music-box-pocket",
    name: "Pocket melody",
    description: "A quick four-note flourish, light and neatly contained.",
    character: "Quick · compact",
    duration: 0.74,
    attack: 0.005,
    decay: 0.105,
    third: 0.13,
    fifth: 0.035,
    successNotes: [
      key(783.99, 0),
      key(880, 0.08, 0.7),
      key(987.77, 0.17, 0.65),
      key(1174.66, 0.28, 0.55),
    ],
    failureNotes: [key(987.77, 0), key(880, 0.14, 0.72)],
    attention: {
      description: "Two short keys, just a small step apart.",
      duration: 0.6,
    },
  },
  {
    id: "music-box-little-star",
    name: "Little star",
    description: "A tiny descending turn that returns to a bright finish.",
    character: "Twinkling · expressive",
    duration: 0.97,
    attack: 0.008,
    decay: 0.145,
    third: 0.105,
    fifth: 0.025,
    successNotes: [
      key(1174.66, 0, 0.75),
      key(987.77, 0.14, 0.6),
      key(783.99, 0.28, 0.7),
      key(1174.66, 0.42, 0.8),
    ],
    failureNotes: [key(1174.66, 0), key(987.77, 0.2, 0.74)],
    attention: {
      description: "Two twinkling keys with a gentle downward answer.",
      duration: 0.78,
    },
  },
] as const satisfies readonly MusicBoxDefinition[];

export const musicBoxVariants = definitions.map((definition, index) => ({
  ...definition,
  variant: index + 1,
  family: "Music box" as const,
  recommended: false,
  attention: { ...definition.attention, name: `${definition.name} pause` },
}));

export type MusicBoxVariant = (typeof musicBoxVariants)[number];
export type MusicBoxSound = MusicBoxVariant["id"];
