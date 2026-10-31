export type ResolvedTheme = "light" | "dark";

export interface ThemeDefinition {
  id: string;
  label: string;
  mode: ResolvedTheme;
  /** Swatch shown in the picker: [background, surface, accent]. */
  swatch: [string, string, string];
  group: "Light" | "Dark";
}

// Order within each group determines the order in the Themes dialog.
export const THEMES: ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    mode: "light",
    swatch: ["#fafbf9", "#ffffff", "#286e5c"],
    group: "Light",
  },
  {
    id: "dark",
    label: "Obsidian",
    mode: "dark",
    swatch: ["#000000", "#000000", "#c4cbd4"],
    group: "Dark",
  },
  {
    id: "white",
    label: "White",
    mode: "light",
    swatch: ["#ffffff", "#ffffff", "#000000"],
    group: "Light",
  },
  {
    id: "paper",
    label: "Paper",
    mode: "light",
    swatch: ["#f4f1ea", "#fbf9f4", "#7a5c2e"],
    group: "Light",
  },
  {
    id: "linen",
    label: "Linen",
    mode: "light",
    swatch: ["#f2e9d8", "#faf4e8", "#74543b"],
    group: "Light",
  },
  {
    id: "sky",
    label: "Sky",
    mode: "light",
    swatch: ["#edf7fd", "#f8fcff", "#236692"],
    group: "Light",
  },
  {
    id: "rose",
    label: "Rose",
    mode: "light",
    swatch: ["#fcf2f2", "#fffafa", "#a24c68"],
    group: "Light",
  },
  {
    id: "graphite",
    label: "Graphite",
    mode: "dark",
    swatch: ["#16181a", "#1d2022", "#8fcbb0"],
    group: "Dark",
  },
  {
    id: "forest",
    label: "Dark Green",
    mode: "dark",
    swatch: ["#08150f", "#0d1f17", "#6fd3a4"],
    group: "Dark",
  },
  {
    id: "midnight",
    label: "Dark Blue",
    mode: "dark",
    swatch: ["#0a1020", "#101a2e", "#6fa8ff"],
    group: "Dark",
  },
  {
    id: "plum",
    label: "Dark Purple",
    mode: "dark",
    swatch: ["#140d1f", "#1d1430", "#c08cff"],
    group: "Dark",
  },
  {
    id: "ocean",
    label: "Ocean",
    mode: "dark",
    swatch: ["#071d29", "#102b38", "#5ac8dd"],
    group: "Dark",
  },
  {
    id: "ember",
    label: "Ember",
    mode: "dark",
    swatch: ["#241915", "#30221c", "#ef9b68"],
    group: "Dark",
  },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    mode: "light",
    swatch: ["#eff1f5", "#e6e9ef", "#8839ef"],
    group: "Light",
  },
  {
    id: "github-light",
    label: "GitHub Light",
    mode: "light",
    swatch: ["#ffffff", "#f6f8fa", "#0969da"],
    group: "Light",
  },
  {
    id: "nord",
    label: "Nord",
    mode: "dark",
    swatch: ["#2e3440", "#3b4252", "#88c0d0"],
    group: "Dark",
  },
  {
    id: "dracula",
    label: "Dracula",
    mode: "dark",
    swatch: ["#282a36", "#343746", "#bd93f9"],
    group: "Dark",
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    mode: "light",
    swatch: ["#f3ecd8", "#fdf6e3", "#268bd2"],
    group: "Light",
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    mode: "dark",
    swatch: ["#002b36", "#073642", "#2aa198"],
    group: "Dark",
  },
  {
    id: "monokai",
    label: "Monokai",
    mode: "dark",
    swatch: ["#272822", "#1e1f1c", "#a6e22e"],
    group: "Dark",
  },
  {
    id: "everforest-oled",
    label: "Everforest",
    mode: "dark",
    swatch: ["#000000", "#000000", "#3d956b"],
    group: "Dark",
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    mode: "dark",
    swatch: ["#000000", "#000000", "#58a6ff"],
    group: "Dark",
  },
  {
    id: "ayu-dark",
    label: "Ayu Dark",
    mode: "dark",
    swatch: ["#000000", "#000000", "#e6b450"],
    group: "Dark",
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    mode: "dark",
    swatch: ["#000000", "#000000", "#7aa2f7"],
    group: "Dark",
  },
];

export const THEME_STORAGE_KEY = "project-cad.theme";

const byId = new Map(THEMES.map((theme) => [theme.id, theme]));

export function themeDefinition(
  id: string | null | undefined,
): ThemeDefinition {
  return byId.get(id ?? "light") ?? THEMES[0];
}
