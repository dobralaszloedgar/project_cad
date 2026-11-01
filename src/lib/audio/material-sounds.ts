import type { SoundCue } from "./sound-design";

export type MaterialSoundStyle = "felt" | "porcelain" | "magnetic" | "droplet";

type Mode = readonly [ratio: number, amplitude: number, decay: number];
type Material = {
  frequency: number;
  attack: number;
  glide: number;
  glideTime: number;
  noise: number;
  noiseCutoff: number;
  modes: readonly Mode[];
  duration: Record<SoundCue, number>;
};

// Separate resonances and decay times give each material its own texture.
const materials: Record<MaterialSoundStyle, Material> = {
  felt: {
    frequency: 293.66,
    attack: 0.003,
    glide: 8,
    glideTime: 0.008,
    noise: 0.055,
    noiseCutoff: 1200,
    modes: [
      [1, 0.74, 0.048],
      [2.006, 0.17, 0.031],
      [3.013, 0.065, 0.019],
      [4.024, 0.025, 0.012],
    ],
    duration: { place: 0.22, wire: 0.065, connect: 0.29, remove: 0.19 },
  },
  porcelain: {
    frequency: 680,
    attack: 0.0018,
    glide: 0,
    glideTime: 0.005,
    noise: 0.045,
    noiseCutoff: 3600,
    modes: [
      [1, 0.68, 0.032],
      [2.56, 0.19, 0.014],
      [4.5, 0.09, 0.007],
      [6.9, 0.04, 0.004],
    ],
    duration: { place: 0.18, wire: 0.055, connect: 0.23, remove: 0.16 },
  },
  magnetic: {
    frequency: 175,
    attack: 0.001,
    glide: 110,
    glideTime: 0.004,
    noise: 0.19,
    noiseCutoff: 2200,
    modes: [
      [1, 0.74, 0.016],
      [3.85, 0.17, 0.008],
      [7.2, 0.09, 0.004],
    ],
    duration: { place: 0.115, wire: 0.04, connect: 0.16, remove: 0.105 },
  },
  droplet: {
    frequency: 510,
    attack: 0.002,
    glide: 640,
    glideTime: 0.006,
    noise: 0.018,
    noiseCutoff: 1800,
    modes: [
      [1, 0.88, 0.026],
      [1.98, 0.09, 0.015],
      [2.86, 0.03, 0.009],
    ],
    duration: { place: 0.15, wire: 0.055, connect: 0.195, remove: 0.13 },
  },
};

// Integrated energy of the approved Soft tactile cues, in sample-rate-independent
// units. Match energy for comparison, then reduce gain if a peak needs headroom.
const referenceEnergy: Record<SoundCue, number> = {
  place: 0.002013,
  wire: 0.00014224,
  connect: 0.0017936,
  remove: 0.0008846,
};

export function createMaterialSamples(
  style: MaterialSoundStyle,
  cue: SoundCue,
  sampleRate: number,
): Float32Array<ArrayBuffer> {
  const material = materials[style];
  const length = Math.ceil(material.duration[cue] * sampleRate);
  const samples = new Float32Array(length);
  const pitch =
    material.frequency *
    { place: 1, wire: 1.7, connect: 1.12, remove: 0.8 }[cue];
  const decayScale = cue === "wire" ? 0.42 : cue === "remove" ? 0.78 : 1;
  const seedOffset = { felt: 17, porcelain: 83, magnetic: 137, droplet: 229 }[
    style
  ];
  let seed = 0x1a2b3c4d + seedOffset;
  let noiseState = 0;
  let previousInput = 0;
  let highPassState = 0;
  const noiseAlpha =
    1 - Math.exp((-2 * Math.PI * material.noiseCutoff) / sampleRate);
  const highPassAlpha = Math.exp((-2 * Math.PI * 35) / sampleRate);
  let energy = 0;
  let peak = 0;

  const strike = (time: number, frequency: number, damping = 1) => {
    if (time <= 0) return 0;
    const attack =
      Math.sin((Math.min(1, time / material.attack) * Math.PI) / 2) ** 2;
    const glide = material.glide * (cue === "remove" ? 0.55 : 1);
    const phase =
      2 *
      Math.PI *
      (frequency * time +
        glide *
          material.glideTime *
          (1 - Math.exp(-time / material.glideTime)));
    let body = 0;
    for (const [ratio, amplitude, decay] of material.modes) {
      body +=
        amplitude *
        Math.sin(phase * ratio) *
        Math.exp(-time / (decay * decayScale * damping));
    }
    return body * attack;
  };

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    noiseState +=
      (((seed >>> 0) / 0xffffffff) * 2 - 1 - noiseState) * noiseAlpha;
    const attack =
      Math.sin((Math.min(1, time / material.attack) * Math.PI) / 2) ** 2;
    let signal = strike(time, pitch);
    if (cue === "connect") {
      // A second small contact distinguishes a finished connection from placement.
      const delay = {
        felt: 0.023,
        porcelain: 0.017,
        magnetic: 0.013,
        droplet: 0.026,
      }[style];
      const interval = {
        felt: 1.5,
        porcelain: 1.18,
        magnetic: 1.7,
        droplet: 1.32,
      }[style];
      signal =
        signal * 0.68 + strike(time - delay, pitch * interval, 0.85) * 0.6;
    }
    if (style === "magnetic" && cue === "place") {
      signal += strike(time - 0.007, pitch * 2.2, 0.3) * 0.13;
    }
    signal +=
      noiseState *
      material.noise *
      attack *
      Math.exp(-time / (cue === "wire" ? 0.003 : 0.007));
    highPassState = highPassAlpha * (highPassState + signal - previousInput);
    previousInput = signal;
    const remaining = (length - 1 - i) / sampleRate;
    const fade = Math.sin((Math.min(1, remaining / 0.018) * Math.PI) / 2) ** 2;
    const sample = highPassState * fade;
    samples[i] = sample;
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  // Linear gain preserves the transient; no clipping or hard limiting.
  const gain = Math.min(
    Math.sqrt((referenceEnergy[cue] * sampleRate) / Math.max(energy, 1e-12)),
    0.68 / Math.max(peak, 1e-12),
  );
  for (let i = 0; i < length; i++) samples[i] *= gain;
  return samples;
}
