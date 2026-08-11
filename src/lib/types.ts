import type { CSSProperties, ReactNode } from "react";

export type AgentEmblemState = "idle" | "thinking" | "loading" | "composing" | "talking" | "researching" | "listening";
export type AgentEmblemShape = "circle" | "square" | "diamond" | "plus";
export type ThinkingStyle = "trace" | "bounce";

export type AgentEmblemSource = string;
export type AgentEmblemColorMode = "system" | "light" | "dark";
export interface AgentEmblemColorVariants {
  /** Color used in light mode. */
  light: string;
  /** Color used in dark mode. */
  dark: string;
}
export type AgentEmblemColor = string | AgentEmblemColorVariants;
export type AgentEmblemInactiveColor = AgentEmblemColor | false;

/**
 * The small, structural subset of an AI SDK stream or UI message part that
 * AgentEmblem reads. This deliberately does not import `ai` or `@ai-sdk/react`.
 */
export interface AgentEmblemAIStreamPart {
  type?: unknown;
  state?: unknown;
  [key: string]: unknown;
}

/**
 * Activity exposed by AI SDK streams or `useChat`. `part` may be a raw stream
 * chunk (`reasoning-delta`, `tool-call`, etc.) or a UI message part
 * (`reasoning`, `text`, `tool-*`). `status` accepts AI SDK chat statuses such
 * as `submitted`, `streaming`, `ready`, and `error`.
 */
export interface AgentEmblemAIActivity {
  part?: AgentEmblemAIStreamPart | null;
  status?: string | null;
}

export interface AgentEmblemProps {
  /** An SVG markup string, data URL, image URL, or object URL. Transparent artwork works best. */
  source: AgentEmblemSource;
  /** The assistant activity that drives the movement. */
  state?: AgentEmblemState;
  /**
   * Optional AI SDK activity. When supplied, it drives the mark from reasoning,
   * text, and tool stream parts instead of `state`. AI SDK is never required:
   * omit this prop and continue using `state` with any framework or custom stream.
   */
  activity?: AgentEmblemAIActivity;
  /** CSS color used for the rendered dots, or light and dark variants. */
  color?: AgentEmblemColor;
  /** Secondary color for non-active dots. Omit it to derive a tonal contrast from `color`, provide a color to override it, or pass `false` to use only the primary ink. */
  inactiveColor?: AgentEmblemInactiveColor;
  /** Selects a color variant. `system` follows `prefers-color-scheme`; pass the app's current mode to follow an app-controlled theme. Defaults to `system`. */
  colorMode?: AgentEmblemColorMode;
  /** Width and height of the mark in pixels. */
  size?: number;
  /** Approximate number of sampling cells along the mark's longest side, or `auto` to fit the source and rendered size. Defaults to `auto`. */
  density?: number | "auto";
  /** Requested particle radius as a fraction of spacing. Compact output is constrained to preserve visible gaps. Defaults to 0.28. */
  dotScale?: number;
  /** Geometry used to visibly reconstruct the mark: circle, square, diamond, or plus. */
  shape?: AgentEmblemShape;
  /** Thinking animation treatment: a contour trace or a loading-style dot bounce. */
  thinkingStyle?: ThinkingStyle;
  /** Let the current assistant state emphasize dots while keeping the full mark visible. Disabled by default for logo fidelity. */
  animateVisibility?: boolean;
  /** Let the current assistant state move the dot field. Disabled by default for logo fidelity. */
  animateMotion?: boolean;
  /** Adds a compact, accessible description to the canvas. */
  label?: string;
  className?: string;
}

/**
 * A ready-made mark-and-copy lockup for compact assistant status UI. The copy
 * inherits the consumer application's typography rather than introducing one.
 */
export interface AgentEmblemThinkingProps extends Omit<AgentEmblemProps, "className"> {
  /** Copy displayed beside the mark. Defaults to `Thinking…`. */
  text?: ReactNode;
  /** Space between the mark and copy. Numbers are interpreted as pixels. Defaults to 4. */
  gap?: CSSProperties["gap"];
  /** Font size for the thinking copy. Numbers are interpreted as pixels. By default, the copy inherits its font size. */
  textSize?: CSSProperties["fontSize"];
  /** Animate copy changes with a directional reveal and keep the current copy softly shimmering. Defaults to `true`. */
  animateText?: boolean;
  /** Class name for the mark-and-copy wrapper. */
  className?: string;
  /** Class name forwarded to the canvas mark. */
  markClassName?: string;
  /** Class name applied to the thinking copy. */
  textClassName?: string;
  /**
   * Any React CSS properties to apply to the thinking copy, including typography,
   * spacing, color, and decoration. These styles take precedence over `textSize`
   * and the built-in text presentation.
   */
  textStyle?: CSSProperties;
}

export interface DotPoint {
  x: number;
  y: number;
  /** Position normalized to the visible logo bounds, not the surrounding canvas. */
  u: number;
  v: number;
  /** True when this point lies on the sampled outer contour of the mark. */
  edge: boolean;
  weight: number;
  seed: number;
}
