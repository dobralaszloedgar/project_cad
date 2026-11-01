import { Color, SRGBColorSpace } from "three";

// Coordinated pairs for binary mixtures, followed by distinct supporting shades.
// The optional red/blue set preserves the original binary colors.
export const FLUID_PALETTES = [
  {
    id: "jade-amber",
    name: "Jade & amber",
    colors: [
      "#299b83",
      "#dda444",
      "#9470c6",
      "#d98960",
      "#a8b84d",
      "#bd75a7",
      "#477452",
      "#ba9cdd",
      "#827331",
      "#8ac9a6",
      "#9c653d",
      "#714c83",
    ],
  },
  {
    id: "iris-apricot",
    name: "Iris & apricot",
    colors: [
      "#9470c6",
      "#e2a06b",
      "#459e7c",
      "#b9af48",
      "#b761a1",
      "#73b5a4",
      "#76518e",
      "#d9be75",
      "#697c39",
      "#cda2d2",
      "#9e703e",
      "#a0c98c",
    ],
  },
  {
    id: "plum-lime",
    name: "Plum & lime",
    colors: [
      "#9b62a7",
      "#a5b94f",
      "#3b9c88",
      "#d49759",
      "#c884ac",
      "#637e3c",
      "#b398d6",
      "#85c7a2",
      "#8c603f",
      "#d9c16e",
      "#674d82",
      "#d8aa8d",
    ],
  },
  {
    id: "copper-mint",
    name: "Copper & mint",
    colors: [
      "#bc814b",
      "#63b59b",
      "#a77cc5",
      "#c4ac44",
      "#b66f9e",
      "#658c48",
      "#dfad7c",
      "#426f5b",
      "#c1a1d8",
      "#97bc6d",
      "#765686",
      "#8a713b",
    ],
  },
  {
    id: "citrus-orchid",
    name: "Citrus & orchid",
    colors: [
      "#c4af38",
      "#bb72b0",
      "#389b7a",
      "#d99659",
      "#8b72bc",
      "#91b957",
      "#825684",
      "#85c6a3",
      "#98703f",
      "#d4a4ce",
      "#507b50",
      "#dfbc7c",
    ],
  },
  {
    id: "sage-mauve",
    name: "Sage & mauve",
    colors: [
      "#759e60",
      "#bb7ca2",
      "#cda04b",
      "#4e9b86",
      "#9b82c3",
      "#d29a71",
      "#576d3a",
      "#8fc3a8",
      "#845781",
      "#c4b977",
      "#946c43",
      "#c8a7d4",
    ],
  },
  {
    id: "forest-honey",
    name: "Forest & honey",
    colors: [
      "#448267",
      "#c39b3b",
      "#9667ad",
      "#ca8a55",
      "#93ae51",
      "#b875a0",
      "#75b69e",
      "#745187",
      "#c4a4d4",
      "#7d7138",
      "#ddba7a",
      "#a4c58b",
    ],
  },
  {
    id: "orchid-peach",
    name: "Orchid & peach",
    colors: [
      "#ab6fc2",
      "#e3ad81",
      "#48a68a",
      "#b5ad48",
      "#c67da7",
      "#729951",
      "#79558c",
      "#8fc9ad",
      "#ad7c45",
      "#c3a1df",
      "#527663",
      "#dbc578",
    ],
  },
  {
    id: "red-blue",
    name: "Red & blue",
    colors: [
      "#e53950",
      "#3569ef",
      "#d7b14b",
      "#499f82",
      "#af7bc5",
      "#d98d57",
      "#65b3bc",
      "#bf7ca4",
      "#7c9c52",
      "#c3a388",
      "#8b93c7",
      "#80604d",
    ],
  },
] as const;

export const DEFAULT_FLUID_PALETTE = FLUID_PALETTES[0].id;
export const FLUID_PALETTE_STORAGE_KEY = "project-cad.fluidPalette";

export function fluidPalette(id?: string | null) {
  return (
    FLUID_PALETTES.find((palette) => palette.id === id) ?? FLUID_PALETTES[0]
  );
}

const expanded = new Map<string, readonly string[]>();
const channels = (hex: string) =>
  [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));

/** Extend the curated colors to the catalog's 40-component limit. Choose each
 * new shade furthest from those already used, within the same hue families.
 * The fixed prefix keeps assignments independent of requested palette size. */
export function fluidPaletteColors(
  id: string,
  count: number,
): readonly string[] {
  const palette = fluidPalette(id);
  if (count <= palette.colors.length) return palette.colors.slice(0, count);
  const cached = expanded.get(palette.id);
  if (cached) return cached.slice(0, count);

  const colors: string[] = [...palette.colors];
  const used = colors.map(channels);
  const candidates = palette.colors.flatMap((hex) => {
    const { h, s } = new Color(hex).getHSL(
      { h: 0, s: 0, l: 0 },
      SRGBColorSpace,
    );
    return [0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8].flatMap((lightness) =>
      [0.8, 1, 1.2].map((scale) => {
        const color = `#${new Color()
          .setHSL(h, Math.min(0.72, s * scale), lightness, SRGBColorSpace)
          .getHexString()}`;
        return { color, rgb: channels(color) };
      }),
    );
  });
  while (colors.length < 40) {
    let best = 0;
    let bestDistance = -1;
    candidates.forEach(({ rgb }, index) => {
      const distance = Math.min(
        ...used.map((other) =>
          rgb.reduce(
            (sum, value, channel) => sum + (value - other[channel]) ** 2,
            0,
          ),
        ),
      );
      if (distance > bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    const [next] = candidates.splice(best, 1);
    colors.push(next.color);
    used.push(next.rgb);
  }
  expanded.set(palette.id, colors);
  return colors.slice(0, count);
}
