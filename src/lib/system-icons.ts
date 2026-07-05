export type SystemIcon = {
  name: string;
  icon: string;
};

export const ICONS = [
  { name: "Expand", icon: "#icon-expand-arrow" },
  { name: "Delete", icon: "#icon-delete-sign" },
  { name: "Menu", icon: "#icon-menu" },
  // Add more here without changing anything else
] as const satisfies SystemIcon[];

// Fast lookup map (name → icon string)
export const SYSTEM_ICON_MAP = Object.fromEntries(
  ICONS.map((icon) => [icon.name, icon.icon]),
) as Record<string, string>;

// === Scalable Helper ===
export const getSystemIcon = (name: string): SystemIcon => {
  const icon = ICONS.find((i) => i.name === name);
  if (!icon) {
    throw new Error(`System icon not found: "${name}"`);
  }
  return icon;
};

// Optional: For even better DX with autocomplete
export const getSystemIconIcon = (name: string): string => {
  const icon = SYSTEM_ICON_MAP[name];
  if (!icon) {
    throw new Error(`System icon not found: "${name}"`);
  }
  return icon;
};
