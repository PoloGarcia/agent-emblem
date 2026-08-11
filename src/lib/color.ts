import { useSyncExternalStore } from "react";
import type { AgentEmblemColor, AgentEmblemColorMode, AgentEmblemInactiveColor } from "./types";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function isColorVariant(color: AgentEmblemInactiveColor | undefined): color is Exclude<AgentEmblemColor, string> {
  return typeof color === "object" && color !== null;
}

function getLightMode(): "light" {
  return "light";
}

function getSystemColorMode(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(DARK_MODE_QUERY).matches ? "dark" : "light";
}

function subscribeToNothing() {
  return () => undefined;
}

function subscribeToSystemColorMode(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(DARK_MODE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function resolveColor(color: AgentEmblemColor | undefined, mode: "light" | "dark") {
  return isColorVariant(color) ? color[mode] : color;
}

type RgbaColor = { red: number; green: number; blue: number; alpha: number };

function parseCssChannel(value: string) {
  return value.endsWith("%") ? Number.parseFloat(value) * 2.55 : Number.parseFloat(value);
}

function parseCssColor(color: string): RgbaColor | undefined {
  const value = color.trim().toLowerCase();
  const hex = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const functional = value.match(/^rgba?\((.+)\)$/)?.[1];
  if (!functional) return undefined;
  const parts = functional.replace(/\s*\/\s*/, ",").split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return undefined;
  const red = parseCssChannel(parts[0]);
  const green = parseCssChannel(parts[1]);
  const blue = parseCssChannel(parts[2]);
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3]);
  if (![red, green, blue, alpha].every(Number.isFinite)) return undefined;
  return { red, green, blue, alpha };
}

function srgbToLinear(channel: number) {
  const value = Math.max(0, Math.min(1, channel / 255));
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number) {
  const value = Math.max(0, Math.min(1, channel));
  return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
}

/**
 * Builds a quieter ink by moving the primary toward the current surface: lighter
 * in light mode and darker in dark mode. OKLab keeps the hue recognisable while
 * reducing chroma enough for active particles to remain the clear focal point.
 */
function deriveInactiveColor(color: string, mode: "light" | "dark") {
  const parsed = parseCssColor(color);
  if (!parsed) {
    const tonalTarget = mode === "dark" ? "black" : "white";
    return `color-mix(in srgb, ${color} 55%, ${tonalTarget})`;
  }

  const red = srgbToLinear(parsed.red);
  const green = srgbToLinear(parsed.green);
  const blue = srgbToLinear(parsed.blue);
  const lRoot = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const mRoot = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const sRoot = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = (1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot) * 0.58;
  const b = (0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot) * 0.58;
  const targetLightness = mode === "light"
    ? Math.min(0.72, Math.max(0.56, lightness + 0.16))
    : Math.max(0.38, Math.min(0.54, lightness - 0.18));
  const nextL = targetLightness + 0.3963377774 * a + 0.2158037573 * b;
  const nextM = targetLightness - 0.1055613458 * a - 0.0638541728 * b;
  const nextS = targetLightness - 0.0894841775 * a - 1.291485548 * b;
  const nextRed = linearToSrgb(4.0767416621 * nextL ** 3 - 3.3077115913 * nextM ** 3 + 0.2309699292 * nextS ** 3);
  const nextGreen = linearToSrgb(-1.2684380046 * nextL ** 3 + 2.6097574011 * nextM ** 3 - 0.3413193965 * nextS ** 3);
  const nextBlue = linearToSrgb(-0.0041960863 * nextL ** 3 - 0.7034186147 * nextM ** 3 + 1.707614701 * nextS ** 3);
  const channels = [nextRed, nextGreen, nextBlue].map((channel) => Math.round(channel).toString(16).padStart(2, "0"));
  if (parsed.alpha < 1) return `rgba(${Math.round(nextRed)}, ${Math.round(nextGreen)}, ${Math.round(nextBlue)}, ${parsed.alpha})`;
  return `#${channels.join("")}`;
}

/** Resolves explicit or system-driven color variants without coupling to an app theme provider. */
export function useAgentEmblemColors(
  color: AgentEmblemColor,
  inactiveColor: AgentEmblemInactiveColor | undefined,
  colorMode: AgentEmblemColorMode,
) {
  // The resolved mode also tunes inactive opacity, so system mode must remain
  // reactive even when both supplied colors are plain strings.
  const followsSystem = colorMode === "system";
  const systemMode = useSyncExternalStore(
    followsSystem ? subscribeToSystemColorMode : subscribeToNothing,
    followsSystem ? getSystemColorMode : getLightMode,
    getLightMode,
  );
  const resolvedMode = colorMode === "system" ? systemMode : colorMode;
  const resolvedColor = resolveColor(color, resolvedMode) ?? "#f5f5f0";
  const hasSecondaryInk = inactiveColor !== false;
  const resolvedInactiveColor = inactiveColor !== false
    ? resolveColor(inactiveColor, resolvedMode) ?? deriveInactiveColor(resolvedColor, resolvedMode)
    : undefined;

  return {
    color: resolvedColor,
    inactiveColor: resolvedInactiveColor,
    hasSecondaryInk,
    resolvedMode,
  };
}
