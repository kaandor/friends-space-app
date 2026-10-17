import type { CSSProperties } from "react";
import { getAstroTier } from "../../../utils/astro";

export type Plan = "free" | "astro" | "astroPlus" | "astroPlusGold";
export type SocialStatus = "online" | "away" | "dnd" | "invisible";

export type AppearanceThemeId = "default" | "white" | "green" | "blue" | "red" | "pink" | "electron" | "yellow" | "purple" | "gray" | "babyblue" | "black" | "beige" | "brown" | "khaki" | "gradient";
export type AppearanceTextColorId = "default" | "white" | "silver" | "green" | "blue" | "pink" | "yellow" | "purple" | "gold";
export type AppearanceBgId = "default" | "white" | "paper" | "carbon" | "space" | "aurora" | "sunset" | "galaxy";
export type AppearanceFontId = "space" | "inter" | "mono" | "poppins" | "montserrat" | "outfit" | "roboto" | "playfair" | "jetbrains";

export interface AppearanceSettings {
  theme: AppearanceThemeId;
  font: AppearanceFontId;
  bg: AppearanceBgId;
  textColor: AppearanceTextColorId;
}

export const APPEARANCE_THEMES: Record<AppearanceThemeId, { accent: string; strong: string; soft: string; glow: string; isLight?: boolean }> = {
  default: { accent: "#29A3FF", strong: "#0B7FD4", soft: "rgba(41,163,255,.15)", glow: "rgba(41,163,255,.28)" },
  white: { accent: "#ffffff", strong: "#0f172a", soft: "rgba(15,23,42,.15)", glow: "rgba(15,23,42,.2)", isLight: true },
  green: { accent: "#10b981", strong: "#047857", soft: "rgba(16,185,129,.15)", glow: "rgba(16,185,129,.28)" },
  blue: { accent: "#3b82f6", strong: "#1d4ed8", soft: "rgba(59,130,246,.15)", glow: "rgba(59,130,246,.28)" },
  red: { accent: "#ef4444", strong: "#b91c1c", soft: "rgba(239,68,68,.15)", glow: "rgba(239,68,68,.28)" },
  pink: { accent: "#ec4899", strong: "#be185d", soft: "rgba(236,72,153,.15)", glow: "rgba(236,72,153,.28)" },
  electron: { accent: "#06b6d4", strong: "#0e7490", soft: "rgba(6,182,212,.15)", glow: "rgba(6,182,212,.28)" },
  yellow: { accent: "#f59e0b", strong: "#b45309", soft: "rgba(245,158,11,.15)", glow: "rgba(245,158,11,.28)" },
  purple: { accent: "#8b5cf6", strong: "#6d28d9", soft: "rgba(139,92,246,.15)", glow: "rgba(139,92,246,.28)" },
  gray: { accent: "#64748b", strong: "#334155", soft: "rgba(100,116,139,.15)", glow: "rgba(100,116,139,.25)" },
  babyblue: { accent: "#38bdf8", strong: "#0369a1", soft: "rgba(56,189,248,.15)", glow: "rgba(56,189,248,.28)" },
  black: { accent: "#0f172a", strong: "#000000", soft: "rgba(15,23,42,.2)", glow: "rgba(15,23,42,.3)" },
  beige: { accent: "#d4b278", strong: "#8c6d36", soft: "rgba(212,178,120,.2)", glow: "rgba(212,178,120,.3)" },
  brown: { accent: "#9a5b36", strong: "#5c3319", soft: "rgba(154,91,54,.2)", glow: "rgba(154,91,54,.3)" },
  khaki: { accent: "#8f823a", strong: "#574e1d", soft: "rgba(143,130,58,.2)", glow: "rgba(143,130,58,.3)" },
  gradient: { accent: "#a855f7", strong: "#581c87", soft: "rgba(168,85,247,.2)", glow: "rgba(168,85,247,.35)" },
};

export const APPEARANCE_BACKGROUNDS: Record<AppearanceBgId, { color: string; image: string }> = {
  default: { color: "#090d11", image: "none" },
  white: { color: "#f8fafc", image: "none" },
  paper: { color: "#f1f5f9", image: "radial-gradient(circle at 50% 50%, rgba(203,213,225,.3) 1px, transparent 1px)" },
  carbon: { color: "#080b0e", image: "linear-gradient(135deg, rgba(255,255,255,.025) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.025) 50%, rgba(255,255,255,.025) 75%, transparent 75%)" },
  space: { color: "#07111b", image: "radial-gradient(circle at 82% 12%, rgba(84,145,255,.2), transparent 28%), radial-gradient(circle at 14% 86%, rgba(189,90,255,.14), transparent 30%)" },
  aurora: { color: "#10101a", image: "radial-gradient(circle at 20% 20%, rgba(64,224,208,.22), transparent 30%), radial-gradient(circle at 80% 75%, rgba(255,76,176,.18), transparent 32%)" },
  sunset: { color: "#1a0f1a", image: "radial-gradient(circle at 50% 10%, rgba(255,140,0,.2), transparent 40%), radial-gradient(circle at 50% 90%, rgba(148,0,211,.2), transparent 40%)" },
  galaxy: { color: "#050508", image: "radial-gradient(circle at 30% 40%, rgba(59,130,246,.15), transparent 50%), radial-gradient(circle at 70% 60%, rgba(236,72,153,.12), transparent 50%)" },
};

export const APPEARANCE_FONTS: Record<AppearanceFontId, string> = {
  space: '"Space Grotesk", sans-serif',
  inter: 'Inter, sans-serif',
  mono: '"IBM Plex Mono", monospace',
  poppins: '"Poppins", sans-serif',
  montserrat: '"Montserrat", sans-serif',
  outfit: '"Outfit", sans-serif',
  roboto: '"Roboto", sans-serif',
  playfair: '"Playfair Display", serif',
  jetbrains: '"JetBrains Mono", monospace',
};

export const APPEARANCE_TEXT_COLORS: Record<AppearanceTextColorId, string> = {
  default: "inherit",
  white: "#f8fafc",
  silver: "#cbd5e1",
  green: "#86efac",
  blue: "#93c5fd",
  pink: "#f9a8d4",
  yellow: "#fde68a",
  purple: "#d8b4fe",
  gold: "#f7d774",
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "default",
  font: "space",
  bg: "default",
  textColor: "default",
};

export function parseAppearance(settings: Record<string, unknown> | undefined): AppearanceSettings {
  const source = settings || {};
  const theme = typeof source["appearanceTheme"] === "string" ? source["appearanceTheme"] as AppearanceThemeId : DEFAULT_APPEARANCE.theme;
  const font = typeof source["appearanceFont"] === "string" ? source["appearanceFont"] as AppearanceFontId : DEFAULT_APPEARANCE.font;
  const bg = typeof source["appearanceBg"] === "string" ? source["appearanceBg"] as AppearanceBgId : DEFAULT_APPEARANCE.bg;
  const textColor = typeof source["appearanceTextColor"] === "string" ? source["appearanceTextColor"] as AppearanceTextColorId : DEFAULT_APPEARANCE.textColor;
  const pickTheme = APPEARANCE_THEMES[theme] ? theme : DEFAULT_APPEARANCE.theme;
  const pickFont = APPEARANCE_FONTS[font] ? font : DEFAULT_APPEARANCE.font;
  const pickBg = APPEARANCE_BACKGROUNDS[bg] ? bg : DEFAULT_APPEARANCE.bg;
  const pickText = APPEARANCE_TEXT_COLORS[textColor] ? textColor : DEFAULT_APPEARANCE.textColor;
  return { theme: pickTheme, font: pickFont, bg: pickBg, textColor: pickText };
}

function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) > 186
}

export function appearanceStyle(appearance: AppearanceSettings): CSSProperties {
  const theme = APPEARANCE_THEMES[appearance.theme] ?? APPEARANCE_THEMES.default;
  const background = APPEARANCE_BACKGROUNDS[appearance.bg] ?? APPEARANCE_BACKGROUNDS.default;
  const text = APPEARANCE_TEXT_COLORS[appearance.textColor] ?? APPEARANCE_TEXT_COLORS.default;
  // Fundo "claro" de verdade = cor clara E sem imagem (imagens/gradientes sao escuros).
  const bgIsLight = isLightColor(background.color) && background.image === "none";
  // Texto sempre legivel: fundo claro -> texto escuro; fundo escuro -> texto claro.
  let resolvedText: string;
  if (text !== "inherit") {
    resolvedText = bgIsLight && isLightColor(text) ? theme.strong : text;
  } else {
    resolvedText = bgIsLight ? theme.strong : "#e7ecee";
  }
  return {
    "--appearance-accent": theme.accent,
    "--appearance-accent-strong": theme.strong,
    "--appearance-accent-soft": theme.soft,
    "--appearance-glow": theme.glow,
    "--appearance-page-bg": background.color,
    "--appearance-page-image": background.image,
    "--appearance-font": APPEARANCE_FONTS[appearance.font] ?? APPEARANCE_FONTS.space,
    "--appearance-text": resolvedText,
  } as CSSProperties;
}

export function appearanceScreenStyle(appearance: AppearanceSettings): CSSProperties {
  const vars = appearanceStyle(appearance) as unknown as Record<string, string>;
  const themeDefault = appearance.theme === "default";
  const bgDefault = appearance.bg === "default";
  const textFollowsTheme = bgDefault && appearance.textColor === "default";
  const hasImage = (APPEARANCE_BACKGROUNDS[appearance.bg] ?? APPEARANCE_BACKGROUNDS.default).image !== "none";
  const page = "var(--appearance-page-bg)";
  const style: Record<string, string> = {
    "--appearance-accent": vars["--appearance-accent"],
    "--appearance-accent-strong": vars["--appearance-accent-strong"],
    "--appearance-accent-soft": vars["--appearance-accent-soft"],
    "--appearance-glow": vars["--appearance-glow"],
    "--appearance-font": vars["--appearance-font"],
    "--sans": "var(--appearance-font)",
  };
  if (!themeDefault) {
    style["--accent"] = "var(--appearance-accent)";
    style["--accent-hover"] = "color-mix(in srgb, var(--appearance-accent) 82%, transparent)";
    style["--accent-dim"] = "var(--appearance-accent-soft)";
    style["--connection-dot"] = "var(--appearance-accent)";
  }
  if (!bgDefault) {
    style["--appearance-page-bg"] = vars["--appearance-page-bg"];
    style["--appearance-page-image"] = vars["--appearance-page-image"];
    style["--bg-primary"] = hasImage ? `color-mix(in srgb, ${page} 88%, transparent)` : `var(--appearance-page-bg)`;
    style["--bg-secondary"] = hasImage ? `color-mix(in srgb, ${page} 90%, white)` : `color-mix(in srgb, ${page} 96%, white)`;
    style["--bg-tertiary"] = hasImage ? `color-mix(in srgb, ${page} 84%, transparent)` : `var(--appearance-page-bg)`;
    style["--bg-hover"] = "color-mix(in srgb, var(--appearance-page-bg) 86%, var(--appearance-accent))";
    style["--bg-active"] = "color-mix(in srgb, var(--appearance-page-bg) 74%, var(--appearance-accent))";
    style["--border"] = "color-mix(in srgb, var(--appearance-accent) 8%, transparent)";
    style["--border-light"] = "color-mix(in srgb, var(--appearance-accent) 13%, transparent)";
  }
  if (!textFollowsTheme) {
    style["--appearance-text"] = vars["--appearance-text"];
    style["--text-primary"] = "var(--appearance-text)";
    style["--text-secondary"] = "color-mix(in srgb, var(--appearance-text) 82%, transparent)";
    style["--text-muted"] = "color-mix(in srgb, var(--appearance-text) 60%, transparent)";
  }
  return style as unknown as CSSProperties;
}

export function appearanceDataAttrs(appearance: AppearanceSettings): Record<string, string> {
  return {
    "data-appearance-theme": appearance.theme,
    "data-appearance-bg": appearance.bg,
    "data-appearance-font": appearance.font,
    "data-appearance-text-color": appearance.textColor,
  };
}

export function serializeAppearance(appearance: AppearanceSettings): Record<string, string> {
  return {
    appearanceTheme: appearance.theme,
    appearanceFont: appearance.font,
    appearanceBg: appearance.bg,
    appearanceTextColor: appearance.textColor,
  };
}

// Conjuntos de temas/fundos liberados por plano (cumulativo: o plano superior
// inclui tudo do inferior). Usado para REGREDIR a aparência quando o usuário
// cancela a assinatura ou o astroUntil expira: o tema do site volta ao free.
// FREE: Preto e Branco (default=preto/verde escuro, white=modo branco) + todas
// as 9 fontes + todas as 9 cores de letra + 2 fundos.
export const PLAN_THEMES: Record<Plan, AppearanceThemeId[]> = {
  free: ["default", "white"],
  astro: ["default", "white"],
  astroPlus: ["default", "white"],
  astroPlusGold: ["default", "white"],
};

export const PLAN_BACKGROUNDS: Record<Plan, AppearanceBgId[]> = {
  free: ["default", "white"],
  astro: ["default", "white"],
  astroPlus: ["default", "white"],
  astroPlusGold: ["default", "white"],
};

export function planFromUser(user?: { settings?: Record<string, unknown> } | null): Plan {
  const tier = getAstroTier(user);
  if (tier === "none") return "free";
  if (tier === "astro_plus") return "astroPlus";
  if (tier === "astro_ultimate") return "astroPlusGold";
  return "astro";
}

export function clampAppearanceToPlan(appearance: AppearanceSettings, plan: Plan): AppearanceSettings {
  return {
    ...appearance,
    theme: PLAN_THEMES[plan].includes(appearance.theme) ? appearance.theme : "default",
    bg: PLAN_BACKGROUNDS[plan].includes(appearance.bg) ? appearance.bg : "default",
    // Cor de letra liberada em todos os planos (inclusive free): configuracao
    // independente da fonte, conforme pedido no historico.
    textColor: appearance.textColor,
  };
}
