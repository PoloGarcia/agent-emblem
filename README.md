# AgentEmblem

AgentEmblem turns transparent SVG or PNG logo artwork into a particle-based React emblem that can show an agent thinking, loading, composing, talking, researching, or listening.

[Demo](https://agent-emblem.vercel.app) · [GitHub](https://github.com/pologarcia/agent-emblem) · [npm](https://www.npmjs.com/package/agent-emblem) · [Made by pologarcia.is](https://pologarcia.is)

```sh
npm install agent-emblem
```

```tsx
import { AgentEmblem } from "agent-emblem";

export function AssistantMark({ logoSvg }: { logoSvg: string }) {
  return (
    <AgentEmblem
      source={logoSvg}
      state="thinking"
      color="#f5f5f0"
      density="auto"
      size={240}
    />
  );
}
```

## Mark-only or thinking lockup

Use `AgentEmblem` when only the mark is needed. For a ready-made mark and thinking
copy pairing, use `AgentEmblemThinking`. The lockup uses a 4px gap by default. Its
copy inherits the font and font size from the consuming application; AgentEmblem
does not load or set a typeface for it.

```tsx
import { AgentEmblem, AgentEmblemThinking } from "agent-emblem";

// Mark only
<AgentEmblem source={logoSvg} size={20} />

// Mark + thinking copy
<AgentEmblemThinking
  source={logoSvg}
  size={20}
  text="Thinking…"
  gap={8}
  textStyle={{
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  }}
/>
```

`AgentEmblemThinking` accepts all `AgentEmblem` props, plus `text`, `animateText`,
`gap`, `textSize`, `markClassName`, `textClassName`, and `textStyle` for pairing
and copy-level customization. `textStyle` accepts any React CSS property, so the
copy's size, family, weight, line height, spacing, color, decoration, and other
presentation can be overridden in one place. Its values take precedence over the
`textSize` shorthand and the built-in text presentation. Numeric `gap` and
`textSize` values are interpreted as pixels; CSS strings such as `0.5rem` are also
accepted. A `color` in `textStyle` also colors the animated shimmer independently
from the mark.
Set `animateText={false}` to keep the copy still. The shimmer makes a steady,
seamless 2-second left-to-right pass, while the soft left-to-right reveal still
plays once for each status-stage change. A secondary ink is enabled by default.
Omit `inactiveColor` to derive a quieter tonal contrast from `color`—lighter in
light mode and darker in dark mode—or provide it for an explicit two-color
treatment. Set `inactiveColor={false}` to opt into a one-ink treatment; its
inactive dots use a theme-balanced lower opacity so motion stays distinct.

## Inputs

`source` accepts raw SVG markup, a data URL, an object URL, or a URL to an image that permits CORS. SVG is preferred. For PNG input, use a transparent 32-bit image with a comfortably sized source (256px or larger on its longest edge is a good default); resampling cannot restore detail that is absent from a tiny raster. For a clearly uniform, opaque matte, AgentEmblem conservatively separates the corner color from the artwork; full-bleed artwork remains intact.

## States

- `idle`: barely-there ambient drift
- `thinking`: asymmetric orbiting
- `loading`: a center-out drawing pass
- `composing`: handwritten passes drawn from top to bottom
- `talking`: a soft vocal waveform
- `researching`: a soft flashlight beam sweeping through the mark
- `listening`: center-bound ripples

## Props

| Prop | Default | Description |
| --- | --- | --- |
| `source` | required | SVG markup, data URL, or image URL |
| `state` | `idle` | One of the seven motion states |
| `activity` | none | An AI SDK activity object that drives the state from stream parts |
| `color` | `#f5f5f0` | Dot fill color, either fixed or `{ light, dark }` variants |
| `inactiveColor` | auto | Fixed or `{ light, dark }` secondary ink override; omit to derive a tonal contrast from `color`, or pass `false` to use one ink |
| `colorMode` | `system` | Chooses `light` or `dark` color variants; `system` follows `prefers-color-scheme` |
| `size` | `240` | Square canvas size in pixels |
| `density` | `auto` | Approximate sampling cells along the mark’s longest side; automatically fits the source and output size |
| `dotScale` | `0.28` | Requested particle radius relative to spacing; compact output is automatically constrained to keep particles separate |
| `shape` | `circle` | Rebuilds the sampled logo from `circle`, `square`, `diamond`, or `plus` particles |
| `thinkingStyle` | `trace` | `trace` or loading-style `bounce` (a rolling jumping wave across the mark) |
| `animateVisibility` | `false` | State emphasizes dots while preserving the full mark |
| `animateMotion` | `false` | State moves the dot field |
| `label` | `Agent emblem` | Accessible description |

`AgentEmblemThinking` adds these pairing props:

| Prop | Default | Description |
| --- | --- | --- |
| `text` | `Thinking…` | Copy displayed beside the mark |
| `gap` | `4` | Space between the mark and copy; accepts pixel numbers or CSS values |
| `textSize` | inherited | Convenient copy font-size shorthand; accepts pixel numbers or CSS values |
| `animateText` | `true` | Animates copy changes and applies the continuous shimmer |
| `markClassName` | none | Class name forwarded to the mark |
| `textClassName` | none | Class name applied to the copy |
| `textStyle` | none | Any React CSS properties for the copy; overrides `textSize` and built-in presentation styles |

The component uses canvas and observes `prefers-reduced-motion`; motion pauses automatically when the setting is enabled. It automatically reduces sampling density below 48px, while spending a small additional detail budget on detailed, stroked, or multi-part marks.

## Light and dark themes

Pass light and dark variants to `color` and, when needed, `inactiveColor`. By
default, the component follows the browser's `prefers-color-scheme` result and
updates if that system preference changes.

```tsx
<AgentEmblemThinking
  source={logoSvg}
  color={{ light: "#18181b", dark: "#fafafa" }}
  inactiveColor={{ light: "#71717a", dark: "#a1a1aa" }}
  text="Thinking…"
/>
```

For an app-controlled theme, pass the current mode from the app's state or theme
context. This works with any theming system and does not require a library-specific
provider.

```tsx
const theme = useTheme(); // "light" or "dark" from your app

<AgentEmblem
  source={logoSvg}
  colorMode={theme}
  color={{ light: "#18181b", dark: "#fafafa" }}
/>
```

A plain string remains supported for a fixed color. The thinking pairing uses the
resolved variant for both the mark and its copy unless `textStyle.color` explicitly
overrides the copy color.

## Compact-size quality standard

| Size | Intended use | Fidelity target |
| --- | --- | --- |
| `16px` | Dense status UI | Recognizable core silhouette with particles still visibly separate; very detailed brands should supply a simplified compact mark |
| `20px` | Status copy and assistant rows | Recommended minimum for most multi-part brand marks |
| `24px` | Standard compact agent identity | Shape, holes, and primary internal structure remain readable |
| `32px` | Prominent status and controls | Detailed marks retain secondary structure while the particle treatment stays clear |
| `40px` | High-fidelity compact feature mark | Highest compact detail budget; use when the brand itself is a focal point |

These are optical tiers rather than a single vector scaled five ways. Auto density, opacity floor, active-particle growth, and minimum particle size are adjusted for the output size. Stationary squares and pluses are snapped to physical pixels; every shape keeps a bounded inter-particle gap so the treatment reads as a logo reconstructed from geometry rather than a blurred copy.

## AI SDK activity

AgentEmblem consumes the `status` and UI message parts exposed by AI SDK `useChat`, without adding `ai` or `@ai-sdk/react` as dependencies. Continue using `state` when you control state presentation manually; pass `activity` when you want the component to follow an AI SDK chat response.

AI SDK is optional. AgentEmblem does not import or bundle it: any application can use `AgentEmblem` with the manual `state` prop, including applications using another SDK, a custom stream, or no model stream at all.

```tsx
import { AgentEmblemThinking, getAgentEmblemStatusCopyFromAIActivity } from "agent-emblem";
import { useChat } from "@ai-sdk/react";

export function AssistantMark({ logoSvg }: { logoSvg: string }) {
  const { messages, status } = useChat();
  const latestPart = messages.at(-1)?.parts.at(-1);
  const activity = { status, part: latestPart };
  const text = getAgentEmblemStatusCopyFromAIActivity(activity);

  return (
    <AgentEmblemThinking
      source={logoSvg}
      activity={activity}
      text={text}
      animateVisibility
      animateMotion
      size={24}
    />
  );
}
```

`getAgentEmblemStatusCopyFromAIActivity` returns short labels such as “Sending your message…”, “Thinking…”, “Using a tool…”, and “Writing response…”. It intentionally does not surface private chain-of-thought; customize tool labels with information you have explicitly chosen to show.

On the server, return the normal AI SDK UI message stream:

```ts
import { streamText } from "ai";

const result = streamText({
  model: "anthropic/claude-sonnet-4.6",
  prompt,
});

return result.toUIMessageStreamResponse();
```

| AI SDK status or message part | AgentEmblem state |
| --- | --- |
| `submitted`, `start`, `stream-start` | `loading` |
| `reasoning-start`, `reasoning-delta`, `reasoning` | `thinking` |
| `text-start`, `text-delta`, `text` | `composing` |
| `tool-call`, `tool-*`, `tool-result`, `source-*` | `researching` |
| `finish`, `abort`, `error`, `ready` | `idle` |

For a custom stream consumer, use `getAgentEmblemStateFromAIActivity(activity, currentState)` to update your own state, or use `useAgentEmblemAIState(activity)` when only the resolved state is needed. End events retain the last active state until the next part or terminal event, avoiding visual flicker.

## Sampling approach

AgentEmblem rasterizes SVG and PNG sources into a shared 1024px coverage space and reads anti-aliased alpha rather than individual center pixels. Accidental transparent padding is trimmed, then the visible artwork is normalized into a consistent 84% optical live area without changing its aspect ratio. Each particle represents one coverage cell and is positioned at that cell's ink-weighted centroid. That preserves thin strokes, diagonals, holes, and separated logo modules without turning the mark into a one-pixel-for-one-particle trace.

Auto sampling measures contour and component complexity from integrated coverage blocks instead of isolated probe pixels. A simple triangle remains spare while a stroked or multi-part mark receives more samples. The prepared coverage mask is shared by component instances at different sizes, avoiding repeated SVG/PNG decoding and rasterization.

The visible canvas backing store follows its actual physical-pixel content box when the browser exposes it, with an exact device-pixel-ratio fallback. It is not capped at 2×, so 3× and fractional-density displays receive native-resolution rendering and respond correctly to zoom or monitor changes.

When `animateVisibility` is enabled, activation is derived from the visible mark itself: thinking traces the sampled contour, loading draws from the center outward, composing writes across the silhouette in line-by-line passes, talking and listening pulse through its normalized bounds, and researching sweeps a soft flashlight beam through the mark. Every point retains a non-zero opacity floor; activation varies opacity and size without erasing the logo.

## Contributing

Bug fixes, accessibility improvements, documentation corrections, and focused animation or sampling changes are welcome. For new public APIs or changes to existing animation behavior, open an issue before writing code so the intended behavior can be agreed on. The [contribution guide](CONTRIBUTING.md) covers local setup, required checks, visual review, and pull request details.
