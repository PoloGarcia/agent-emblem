import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AgentEmblem } from "./AgentEmblem";
import { useAgentEmblemColors } from "./color";
import type { AgentEmblemThinkingProps } from "./types";

const lockupStyle: CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
};

const SHIMMER_PERIOD_MS = 2000;
const TEXT_EXIT_MS = 120;
const TEXT_ENTER_MS = 200;

const shimmerTextStyle: CSSProperties = {
  backgroundClip: "text",
  backgroundRepeat: "no-repeat",
  backgroundSize: "300% 100%",
  color: "transparent",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  willChange: "background-position",
};

/**
 * Renders an AgentEmblem paired with thinking copy. The copy intentionally has no
 * font declarations, so it inherits the consumer application's type system.
 */
export function AgentEmblemThinking({
  text = "Thinking…",
  gap = 4,
  textSize,
  animateText = true,
  className,
  markClassName,
  textClassName,
  textStyle,
  color: colorProp = "#f5f5f0",
  inactiveColor: inactiveColorProp,
  colorMode = "system",
  ...markProps
}: AgentEmblemThinkingProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const displayedTextRef = useRef(text);
  const textTransitionRevision = useRef(0);
  const textAnimations = useRef<Animation[]>([]);
  const [displayedText, setDisplayedText] = useState(text);
  const { color, inactiveColor, hasSecondaryInk, resolvedMode } = useAgentEmblemColors(colorProp, inactiveColorProp, colorMode);
  const copyStyle: CSSProperties = {
    ...(textSize === undefined ? {} : { fontSize: textSize }),
    ...textStyle,
  };
  const textColor = textStyle?.color ?? color;
  const quietTextColor = inactiveColor ?? `color-mix(in srgb, ${textColor} ${resolvedMode === "light" ? 48 : 60}%, transparent)`;
  const style: CSSProperties = animateText ? {
    ...shimmerTextStyle,
    backgroundColor: textColor,
    backgroundImage: `linear-gradient(100deg, ${quietTextColor} 0%, ${quietTextColor} 43%, ${textColor} 50%, ${quietTextColor} 57%, ${quietTextColor} 100%)`,
    ...copyStyle,
  } : {
    color,
    ...copyStyle,
  };

  useEffect(() => {
    if (Object.is(text, displayedTextRef.current)) return;

    const textNode = textRef.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const revision = ++textTransitionRevision.current;
    textAnimations.current.forEach((animation) => animation.cancel());
    textAnimations.current = [];

    if (!textNode || !animateText || media.matches || typeof textNode.animate !== "function") {
      displayedTextRef.current = text;
      setDisplayedText(text);
      return;
    }

    const exit = textNode.animate([
      { opacity: 1, transform: "translateX(0)" },
      { opacity: 0, transform: "translateX(2px)" },
    ], {
      duration: TEXT_EXIT_MS,
      easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      fill: "forwards",
    });
    textAnimations.current = [exit];

    void exit.finished.then(() => {
      if (revision !== textTransitionRevision.current) return;
      displayedTextRef.current = text;
      setDisplayedText(text);

      requestAnimationFrame(() => {
        if (revision !== textTransitionRevision.current || !textRef.current) return;
        const enter = textRef.current.animate([
          { opacity: 0.22, transform: "translateX(-2px)" },
          { opacity: 1, transform: "translateX(0)" },
        ], {
          duration: TEXT_ENTER_MS,
          easing: "cubic-bezier(0.165, 0.84, 0.44, 1)",
          fill: "forwards",
        });
        textAnimations.current = [exit, enter];

        void enter.finished.then(() => {
          if (revision !== textTransitionRevision.current) return;
          exit.cancel();
          enter.cancel();
          textAnimations.current = [];
        }).catch(() => undefined);
      });
    }).catch(() => undefined);

    return () => {
      textAnimations.current.forEach((animation) => animation.cancel());
      textAnimations.current = [];
    };
  }, [animateText, text]);

  useEffect(() => {
    const textNode = textRef.current;
    if (!textNode || !animateText) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const draw = (now: number) => {
      if (media.matches) {
        textNode.style.backgroundPosition = "50% 50%";
        return;
      }
      const progress = (now % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
      // A constant pace keeps the copy calm and readable across every mark state.
      // The 300% gradient leaves inactive-colour runway on both ends, making the
      // loop boundary visually identical instead of snapping back to a new frame.
      textNode.style.backgroundPosition = `${100 - progress * 100}% 50%`;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    const stopForReducedMotion = () => {
      if (media.matches) {
        cancelAnimationFrame(frame);
        textNode.style.backgroundPosition = "50% 50%";
      } else {
        frame = requestAnimationFrame(draw);
      }
    };
    media.addEventListener("change", stopForReducedMotion);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", stopForReducedMotion);
    };
  }, [animateText]);

  return (
    <span className={className} style={{ ...lockupStyle, gap }}>
      <AgentEmblem {...markProps} color={color} inactiveColor={hasSecondaryInk ? inactiveColor : false} colorMode={resolvedMode} className={markClassName} />
      <span ref={textRef} className={textClassName} style={style} aria-live="polite">
        {displayedText}
      </span>
    </span>
  );
}
