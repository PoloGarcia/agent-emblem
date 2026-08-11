import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AgentEmblem, AgentEmblemThinking, getAgentEmblemStatusCopyFromAIActivity, type AgentEmblemShape, type AgentEmblemState, type ThinkingStyle } from "./lib";
import vercelSource from "./assets/vercel-icon.svg";
import polarSource from "./assets/polar.svg";
import nubankSource from "./assets/nubank-logo.svg";
import pologarciaSource from "./assets/pologarcia-is.svg";
import rampSource from "./assets/ramp.svg";
import "./App.css";

type ThemeMode = "light" | "dark";
type ThemeColors = Record<ThemeMode, string>;
type Sample = { id: string; name: string; source: string; activeInk: ThemeColors; inactiveInk: ThemeColors };
type StreamStage = {
  id: string;
  mode: "prompt" | "status" | "response";
  label: string;
  signal: string;
  copy: string;
  detail: string;
  duration: number;
  activity: { status?: string; part?: { type: string; state?: string } };
};

function SourcePreview({ source, color }: { source: string; color: string }) {
  const mask = `url("${source}")`;
  return <i className="source-preview" aria-hidden="true"><i className="source-preview-mark" style={{ backgroundColor: color, maskImage: mask, WebkitMaskImage: mask } as CSSProperties} /></i>;
}

function WindowDots() {
  return <span className="window-dots" aria-hidden="true"><i /><i /><i /></span>;
}

function CodeWindow({ filename, children }: { filename: string; children: ReactNode }) {
  return <div className="editor-window">
    <div className="editor-window-bar">
      <WindowDots />
      <span className="editor-filename">{filename}</span>
    </div>
    <pre className="editor-code"><code>{children}</code></pre>
  </div>;
}

const samples: Sample[] = [
  { id: "vercel", name: "Vercel", source: vercelSource, activeInk: { light: "#11110f", dark: "#ffffff" }, inactiveInk: { light: "#696a64", dark: "#696a64" } },
  { id: "nu", name: "Nu", source: nubankSource, activeInk: { light: "#7200ad", dark: "#b973ff" }, inactiveInk: { light: "#8a5ca6", dark: "#70408f" } },
  { id: "ramp", name: "Ramp", source: rampSource, activeInk: { light: "#415000", dark: "#e4f222" }, inactiveInk: { light: "#737a42", dark: "#697019" } },
  { id: "polar", name: "Polar", source: polarSource, activeInk: { light: "#11110f", dark: "#ffffff" }, inactiveInk: { light: "#73736e", dark: "#7b7b7b" } },
  { id: "pologarcia", name: "pologarcia.is", source: pologarciaSource, activeInk: { light: "#087a4c", dark: "#62e6a7" }, inactiveInk: { light: "#5b806d", dark: "#2c6e50" } },
];

const streamStages: StreamStage[] = [
  {
    id: "prompt",
    mode: "prompt",
    label: "User message",
    signal: "sendMessage()",
    copy: "How can my assistant show progress clearly?",
    detail: "Displays the message and starts the request.",
    duration: 3400,
    activity: { status: "submitted" },
  },
  {
    id: "submitted",
    mode: "status",
    label: "Request sent",
    signal: 'status: "submitted"',
    copy: "Sending your message…",
    detail: "Runs the mark’s loading animation.",
    duration: 3300,
    activity: { status: "submitted" },
  },
  {
    id: "reasoning",
    mode: "status",
    label: "Reasoning",
    signal: 'part.type: "reasoning"',
    copy: "Thinking through your request…",
    detail: "Runs the mark’s thinking animation.",
    duration: 4400,
    activity: { status: "streaming", part: { type: "reasoning", state: "streaming" } },
  },
  {
    id: "context",
    mode: "status",
    label: "Tool running",
    signal: 'part.type: "tool-searchDocs"',
    copy: "Searching the docs…",
    detail: "Runs the mark’s research animation.",
    duration: 4000,
    activity: { status: "streaming", part: { type: "tool-searchDocs", state: "input-streaming" } },
  },
  {
    id: "streaming",
    mode: "response",
    label: "Answer streaming",
    signal: 'part.type: "text"',
    copy: "Composing answer…",
    detail: "Runs the mark’s composing animation.",
    duration: 5600,
    activity: { status: "streaming", part: { type: "text" } },
  },
];

const stateControls: Array<{ state: AgentEmblemState; label: string; thinkingStyle?: ThinkingStyle }> = [
  { state: "idle", label: "Idle" },
  { state: "loading", label: "Loading" },
  { state: "listening", label: "Listening" },
  { state: "thinking", label: "Thinking", thinkingStyle: "trace" },
  { state: "thinking", label: "Jumping wave", thinkingStyle: "bounce" },
  { state: "researching", label: "Researching" },
  { state: "composing", label: "Composing" },
  { state: "talking", label: "Talking" },
];
const sizes = [16, 20, 24, 32, 40];
const shapes: AgentEmblemShape[] = ["circle", "square", "diamond", "plus"];
const SAMPLE_ANSWER_WORDS = ["A", "clear", "status", "keeps", "people", "oriented", "while", "the", "response", "streams."];
const STATUS_EXIT_MS = 120;
const STATUS_ENTER_MS = 200;
const HEX_COLOR = /^#[\da-f]{6}$/i;
const HEX_PRESETS = ["#f5f5f0", "#11110f", "#696a64", "#f06f6f", "#f2c879", "#98ddc2", "#8eb4ff", "#d7b8ff"];

type StatusPhase = "entering" | "visible" | "exiting" | "hidden";
type ColorPickerId = "active" | "inactive" | null;
type HsvColor = { hue: number; saturation: number; value: number };

type ColorPickerProps = {
  label: string;
  value: string;
  color: string;
  isOpen: boolean;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  onToggle: () => void;
  onChange: (value: string) => void;
  onPick: (value: string) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToHsv(hex: string): HsvColor {
  const color = HEX_COLOR.test(hex) ? hex : "#000000";
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2);
    else hue = 60 * ((red - green) / difference + 4);
  }
  return { hue: (hue + 360) % 360, saturation: maximum ? difference / maximum * 100 : 0, value: maximum * 100 };
}

function hsvToHex({ hue, saturation, value }: HsvColor) {
  const chroma = value / 100 * (saturation / 100);
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = value / 100 - chroma;
  const [red, green, blue] = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] : hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function ColorPicker({ label, value, color, isOpen, enabled = true, onEnabledChange, onToggle, onChange, onPick }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => hexToHsv(color));

  useEffect(() => setHsv(hexToHsv(color)), [color]);

  function updateColor(nextColor: HsvColor) {
    const normalized = { hue: clamp(nextColor.hue, 0, 360), saturation: clamp(nextColor.saturation, 0, 100), value: clamp(nextColor.value, 0, 100) };
    setHsv(normalized);
    onPick(hsvToHex(normalized));
  }

  function selectSaturationAndValue(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    updateColor({ ...hsv, saturation: (event.clientX - bounds.left) / bounds.width * 100, value: 100 - (event.clientY - bounds.top) / bounds.height * 100 });
  }

  return (
    <div className={`setting-cell color-control${enabled ? "" : " is-disabled"}`}>
      <span>
        <b>{label}</b>
        {enabled ? <input className="hex-input" aria-label={`${label} hex color`} value={value} spellCheck={false} aria-invalid={!HEX_COLOR.test(value)} onChange={(event) => onChange(event.target.value)} /> : <small>Off · active ink only</small>}
      </span>
      <div className="color-picker">
        {onEnabledChange && <label className="ink-toggle" title={`${enabled ? "Remove" : "Add"} secondary ink`}>
          <input type="checkbox" checked={enabled} aria-label="Use a secondary ink" onChange={(event) => onEnabledChange(event.target.checked)} />
          <i aria-hidden="true" />
        </label>}
        <button className={`color-swatch${isOpen ? " is-open" : ""}`} type="button" disabled={!enabled} style={{ backgroundColor: color }} aria-label={`Open ${label} color picker`} aria-haspopup="dialog" aria-expanded={enabled ? isOpen : false} onClick={onToggle} />
        {isOpen && <div className="hex-picker" role="dialog" aria-label={`${label} color picker`}>
          <div className="color-field" style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); selectSaturationAndValue(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) selectSaturationAndValue(event); }}>
            <i className="color-field-thumb" style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.value}%` }} aria-hidden="true" />
          </div>
          <input className="hue-range" type="range" min="0" max="360" value={hsv.hue} aria-label="Hue" onChange={(event) => updateColor({ ...hsv, hue: Number(event.target.value) })} />
          <label className="hex-picker-field"><span>Hex</span><input autoFocus value={value} spellCheck={false} aria-invalid={!HEX_COLOR.test(value)} onChange={(event) => onChange(event.target.value)} /></label>
          <span className="hex-picker-label">Quick picks</span>
          <div className="hex-presets">{HEX_PRESETS.map((preset) => <button key={preset} type="button" title={preset} aria-label={`Use ${preset}`} className={preset.toLowerCase() === color.toLowerCase() ? "chosen" : ""} style={{ backgroundColor: preset }} onClick={() => onPick(preset)} />)}</div>
        </div>}
      </div>
    </div>
  );
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [sample, setSample] = useState(samples[0]);
  const [uploaded, setUploaded] = useState<{ name: string; source: string } | null>(null);
  const [state, setState] = useState<AgentEmblemState>("thinking");
  const [colors, setColors] = useState<ThemeColors>(samples[0].activeInk);
  const [colorText, setColorText] = useState(samples[0].activeInk.dark);
  const [inactiveColors, setInactiveColors] = useState<ThemeColors>(samples[0].inactiveInk);
  const [inactiveColorText, setInactiveColorText] = useState(samples[0].inactiveInk.dark);
  const [useSecondaryInk, setUseSecondaryInk] = useState(true);
  const [openColorPicker, setOpenColorPicker] = useState<ColorPickerId>(null);
  const [shape, setShape] = useState<AgentEmblemShape>("circle");
  const [thinkingStyle, setThinkingStyle] = useState<ThinkingStyle>("trace");
  const [animateVisibility, setAnimateVisibility] = useState(true);
  const [streamStage, setStreamStage] = useState<StreamStage>(streamStages[0]);
  const [liveStreamStage, setLiveStreamStage] = useState<StreamStage>(streamStages[0]);
  const [exitingStreamStageId, setExitingStreamStageId] = useState<string | null>(null);
  const [isStreamRestarting, setIsStreamRestarting] = useState(false);
  const [showStreamAnswer, setShowStreamAnswer] = useState(false);
  const [streamedWordCount, setStreamedWordCount] = useState(0);
  const [isSourceDropTarget, setIsSourceDropTarget] = useState(false);
  const [displayedStatus, setDisplayedStatus] = useState(state);
  const [statusPhase, setStatusPhase] = useState<StatusPhase>(state === "idle" ? "hidden" : "entering");
  const [statePickerOverflow, setStatePickerOverflow] = useState(false);
  const [statePickerAtEnd, setStatePickerAtEnd] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const colorControlsRef = useRef<HTMLDivElement>(null);
  const statePickerRef = useRef<HTMLDivElement>(null);
  const sourceDropDepth = useRef(0);
  const reducedMotion = useReducedMotion();
  const source = uploaded?.source ?? sample.source;
  const markName = uploaded?.name ?? sample.name;
  const color = colors[themeMode];
  const inactiveColor = inactiveColors[themeMode];
  const secondaryInk = useSecondaryInk ? inactiveColors : false;
  const streamCopy = liveStreamStage.mode === "prompt" || liveStreamStage.mode === "response" ? liveStreamStage.copy : getAgentEmblemStatusCopyFromAIActivity(liveStreamStage.activity);
  const streamStageIndex = streamStages.findIndex((stage) => stage.id === streamStage.id);

  function scrollStatePicker(direction: 1 | -1) {
    const picker = statePickerRef.current;
    if (!picker) return;
    picker.scrollTo({
      left: direction > 0 ? picker.scrollWidth : 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => {
      const currentIndex = streamStages.findIndex((stage) => stage.id === streamStage.id);
      setExitingStreamStageId(streamStage.id);
      setIsStreamRestarting(currentIndex === streamStages.length - 1);
      setStreamStage(streamStages[(currentIndex + 1) % streamStages.length]);
    }, streamStage.duration);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, streamStage]);

  useEffect(() => {
    if (!exitingStreamStageId) return;
    if (reducedMotion) {
      setExitingStreamStageId(null);
      return;
    }
    const timer = window.setTimeout(() => setExitingStreamStageId(null), 320);
    return () => window.clearTimeout(timer);
  }, [exitingStreamStageId, reducedMotion]);

  useEffect(() => {
    if (!isStreamRestarting) return;
    if (reducedMotion) {
      setIsStreamRestarting(false);
      return;
    }
    const timer = window.setTimeout(() => setIsStreamRestarting(false), 1600);
    return () => window.clearTimeout(timer);
  }, [isStreamRestarting, reducedMotion]);

  useEffect(() => {
    if (liveStreamStage.id === streamStage.id) return;
    if (reducedMotion) {
      setLiveStreamStage(streamStage);
      return;
    }
    const timer = window.setTimeout(
      () => setLiveStreamStage(streamStage),
      isStreamRestarting ? 1380 : 1120,
    );
    return () => window.clearTimeout(timer);
  }, [isStreamRestarting, liveStreamStage.id, reducedMotion, streamStage]);

  useEffect(() => {
    if (liveStreamStage.mode !== "response") {
      setShowStreamAnswer(false);
      return;
    }
    if (reducedMotion) {
      setShowStreamAnswer(true);
      return;
    }
    setShowStreamAnswer(false);
    const timer = window.setTimeout(() => setShowStreamAnswer(true), 1200);
    return () => window.clearTimeout(timer);
  }, [liveStreamStage.id, liveStreamStage.mode, reducedMotion]);

  useEffect(() => {
    if (liveStreamStage.mode !== "response" || !showStreamAnswer) {
      setStreamedWordCount(0);
      return;
    }
    if (reducedMotion) {
      setStreamedWordCount(SAMPLE_ANSWER_WORDS.length);
      return;
    }

    setStreamedWordCount(0);
    const timers = SAMPLE_ANSWER_WORDS.map((_, index) => window.setTimeout(() => setStreamedWordCount(index + 1), 120 + index * 180));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [liveStreamStage.mode, reducedMotion, showStreamAnswer]);

  useEffect(() => {
    if (state === displayedStatus) return;
    if (reducedMotion) {
      setDisplayedStatus(state);
      setStatusPhase(state === "idle" ? "hidden" : "visible");
      return;
    }
    if (displayedStatus === "idle" || statusPhase === "hidden") {
      setDisplayedStatus(state);
      setStatusPhase(state === "idle" ? "hidden" : "entering");
      return;
    }

    setStatusPhase("exiting");
    const timer = window.setTimeout(() => {
      setDisplayedStatus(state);
      setStatusPhase(state === "idle" ? "hidden" : "entering");
    }, STATUS_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [displayedStatus, reducedMotion, state, statusPhase]);

  useEffect(() => {
    if (statusPhase !== "entering" || reducedMotion) return;
    const timer = window.setTimeout(() => setStatusPhase("visible"), STATUS_ENTER_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, statusPhase]);

  useEffect(() => {
    if (!openColorPicker) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!colorControlsRef.current?.contains(event.target as Node)) setOpenColorPicker(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenColorPicker(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openColorPicker]);

  useEffect(() => {
    const picker = statePickerRef.current;
    if (!picker) return;
    const updateOverflow = () => {
      const hasOverflow = picker.scrollWidth > picker.clientWidth + 1;
      setStatePickerOverflow(hasOverflow);
      setStatePickerAtEnd(!hasOverflow || picker.scrollLeft + picker.clientWidth >= picker.scrollWidth - 2);
    };
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(picker);
    picker.addEventListener("scroll", updateOverflow, { passive: true });
    updateOverflow();
    return () => {
      resizeObserver.disconnect();
      picker.removeEventListener("scroll", updateOverflow);
    };
  }, []);

  function updateActiveColor(value: string) {
    setColorText(value);
    if (HEX_COLOR.test(value)) setColors((current) => ({ ...current, [themeMode]: value }));
  }

  function updateInactiveColor(value: string) {
    setInactiveColorText(value);
    if (HEX_COLOR.test(value)) setInactiveColors((current) => ({ ...current, [themeMode]: value }));
  }

  function toggleThemeMode() {
    const nextMode = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextMode);
    setColorText(colors[nextMode]);
    setInactiveColorText(inactiveColors[nextMode]);
    setOpenColorPicker(null);
  }

  function selectSample(next: Sample) {
    if (uploaded?.source.startsWith("blob:")) URL.revokeObjectURL(uploaded.source);
    setUploaded(null);
    setSample(next);
    setColors(next.activeInk);
    setColorText(next.activeInk[themeMode]);
    setInactiveColors(next.inactiveInk);
    setInactiveColorText(next.inactiveInk[themeMode]);
  }

  async function upload(file?: File) {
    if (!file || !/image\/(svg\+xml|png)/.test(file.type)) return;
    const source = file.type === "image/svg+xml"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await file.text())}`
      : URL.createObjectURL(file);
    if (uploaded?.source.startsWith("blob:")) URL.revokeObjectURL(uploaded.source);
    setUploaded({ name: file.name.replace(/\.[^/.]+$/, ""), source });
    const uploadedColors = { light: "#11110f", dark: "#ffffff" };
    const uploadedInactiveColors = { light: "#73736e", dark: "#696a64" };
    setColors(uploadedColors);
    setColorText(uploadedColors[themeMode]);
    setInactiveColors(uploadedInactiveColors);
    setInactiveColorText(uploadedInactiveColors[themeMode]);
    setUseSecondaryInk(true);
    setOpenColorPicker(null);
  }

  function handleSourceDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    sourceDropDepth.current += 1;
    setIsSourceDropTarget(true);
  }

  function handleSourceDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    sourceDropDepth.current -= 1;
    if (sourceDropDepth.current <= 0) {
      sourceDropDepth.current = 0;
      setIsSourceDropTarget(false);
    }
  }

  function handleSourceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    sourceDropDepth.current = 0;
    setIsSourceDropTarget(false);
    upload(event.dataTransfer.files?.[0]);
  }

  return (
    <main className={`playground ${themeMode}`}>
      <header>
        <a className="wordmark" href="#top">AgentEmblem</a>
        <nav className="header-actions" aria-label="Project links">
          <a className="header-credit" href="https://pologarcia.is" target="_blank" rel="noreferrer">Made by pologarcia.is</a>
          <a className="header-github" href="https://github.com/pologarcia/agent-emblem" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
            GitHub
          </a>
        </nav>
        <input ref={uploadRef} hidden type="file" accept="image/svg+xml,image/png" onChange={(event) => { upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </header>

      <section id="top" className="intro">
        <h1>Your brand,<br /><em>your agent.</em></h1>
        <p>Working on agents in chat and non-chat interfaces showed me how motion and brand can reveal what happens behind the scenes. That’s why I built this library.</p>
      </section>

      <section className="workbench" aria-label="AgentEmblem playground">
        <div className="toolbar">
          <div className="source-controls">
            <div
              className={`source-picker${isSourceDropTarget ? " is-drop-target" : ""}`}
              onDragEnter={handleSourceDragEnter}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={handleSourceDragLeave}
              onDrop={handleSourceDrop}
            >
              <div className="source-picker-label"><span>Logo</span></div>
              <div className="source-options" role="group" aria-label="Logo source">
                {samples.map((item) => <button key={item.id} type="button" onClick={() => selectSample(item)} aria-label={`Use ${item.name} logo`} title={item.name} aria-pressed={!uploaded && item.id === sample.id} className={`source-option${!uploaded && item.id === sample.id ? " chosen" : ""}`}><SourcePreview source={item.source} color={item.activeInk[themeMode]} /></button>)}
                {uploaded && <button type="button" className="source-option chosen" aria-label={`Use uploaded ${markName} logo`} title={markName}><SourcePreview source={uploaded.source} color={color} /></button>}
                <button type="button" className="source-option source-upload" aria-label="Upload your logo" title="Upload your logo" onClick={() => uploadRef.current?.click()}>Upload</button>
              </div>
            </div>
            <div className="shape-control">
              <span className="control-label">Shape</span>
              <div className="shape-picker" role="group" aria-label="Sampling shape">{shapes.map((item) => <button key={item} type="button" onClick={() => setShape(item)} className={shape === item ? "chosen" : ""}><i className={`shape-swatch shape-swatch--${item}`} aria-hidden="true" /><span>{item}</span></button>)}</div>
            </div>
          </div>
          <div className="toolbar-controls">
            <div className="control-group">
              <span className="control-label">Assistant moment</span>
              <div className={`state-picker-wrap${statePickerOverflow ? " has-overflow" : ""}${statePickerAtEnd ? " is-at-end" : ""}`}>
                <div ref={statePickerRef} className="state-picker" role="group" aria-label="Assistant state">{stateControls.map((item) => <button key={`${item.state}-${item.thinkingStyle ?? "default"}`} type="button" onClick={() => { setState(item.state); if (item.thinkingStyle) setThinkingStyle(item.thinkingStyle); }} className={state === item.state && (!item.thinkingStyle || thinkingStyle === item.thinkingStyle) ? "chosen" : ""}>{item.label}</button>)}</div>
                <button className="state-scroll-next" type="button" aria-label={statePickerAtEnd ? "Show previous assistant moments" : "Show more assistant moments"} onClick={() => scrollStatePicker(statePickerAtEnd ? -1 : 1)}>
                  <span>{statePickerAtEnd ? "Back" : "More"}</span>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="usage-preview">
          <div className="usage-heading"><span>Preview at real UI sizes</span><b>{markName}</b></div>
          <div className="usage-grid">
            {sizes.map((size) => <article className="usage-card" key={size}>
              {statusPhase === "hidden" ? <AgentEmblem source={source} state={state} color={colors} inactiveColor={secondaryInk} colorMode={themeMode} size={size} shape={shape} thinkingStyle={thinkingStyle} animateVisibility={animateVisibility} label={`${markName} ${size} pixel agent emblem`} /> : <AgentEmblemThinking source={source} state={state} color={colors} inactiveColor={secondaryInk} colorMode={themeMode} size={size} shape={shape} thinkingStyle={thinkingStyle} animateVisibility={animateVisibility} animateText gap={6} label={`${markName} ${size} pixel agent emblem`} className="assistant-status" textClassName={`thinking-label thinking-label--${statusPhase}`} text={`${displayedStatus}...`} textStyle={{ "--status-size": `${Math.min(16, Math.max(12, Math.round(size * 0.62)))}px` } as CSSProperties} />}
              <small>{size}px</small>
            </article>)}
          </div>
        </div>

        <div className="appearance-details">
          <div className="appearance-heading">
            <span>Appearance</span>
            <button className="theme-button appearance-theme" type="button" onClick={toggleThemeMode} aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}>
              Theme · {themeMode}
            </button>
          </div>
          <div className="controls" ref={colorControlsRef} aria-label="Appearance controls">
            <ColorPicker label="Active ink" value={colorText} color={color} isOpen={openColorPicker === "active"} onToggle={() => setOpenColorPicker((current) => current === "active" ? null : "active")} onChange={updateActiveColor} onPick={updateActiveColor} />
            <ColorPicker label="Secondary ink" value={inactiveColorText} color={inactiveColor} enabled={useSecondaryInk} isOpen={openColorPicker === "inactive"} onEnabledChange={(enabled) => { setUseSecondaryInk(enabled); if (!enabled) setOpenColorPicker(null); }} onToggle={() => setOpenColorPicker((current) => current === "inactive" ? null : "inactive")} onChange={updateInactiveColor} onPick={updateInactiveColor} />
            <label className="setting-cell switch">
              <span><b>Motion</b><small>{animateVisibility ? "On" : "Off"}</small></span>
              <input type="checkbox" checked={animateVisibility} onChange={(event) => setAnimateVisibility(event.target.checked)} />
              <i aria-hidden="true" />
            </label>
          </div>
        </div>

      </section>

      <section className="sdk-example" aria-labelledby="sdk-title">
        <div className="sdk-intro">
          <h2 id="sdk-title">Built for the<br /><em>Vercel AI SDK.</em></h2>
          <p>Connect <code>useChat</code> status and message parts to the mark’s motion and status copy.</p>
        </div>

        <ol className={`sdk-steps${isStreamRestarting ? " is-restarting" : ""}`} aria-label="Vercel AI SDK event flow">
          {streamStages.map((stage, index) => {
            const isActive = streamStageIndex === index;
            const isExiting = exitingStreamStageId === stage.id;
            const isPast = index < streamStageIndex && !isExiting;
            const stackOffset = Math.max(0, index - streamStageIndex);
            const stackState = isActive ? "is-active" : isExiting ? "is-exiting" : isPast ? "is-past" : "is-future";
            return <li key={stage.id} className={stackState} style={{ "--stack-offset": stackOffset, "--stack-z": isExiting ? streamStages.length + 1 : isPast ? 0 : streamStages.length - stackOffset } as CSSProperties}>
            <button type="button" aria-pressed={streamStage.id === stage.id} aria-current={streamStage.id === stage.id ? "step" : undefined} onClick={() => {
              if (streamStage.id === stage.id) return;
              setIsStreamRestarting(false);
              if (!reducedMotion) setExitingStreamStageId(streamStage.id);
              setStreamStage(stage);
            }}>
              <span className="sdk-step-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="sdk-step-meta"><b>{stage.label}</b><code>{stage.signal}</code><small>{stage.detail}</small></span>
            </button>
          </li>})}
        </ol>

        <div key={streamStage.id} className="sdk-causal-link" aria-hidden="true"><i /></div>

        <div className="sdk-live">
          <div className="sdk-app-window" aria-live="polite">
            <div className="sdk-window-bar">
              <WindowDots />
              <div className="sdk-live-brand" aria-hidden="true"><SourcePreview source={source} color={color} /></div>
              <div className="sdk-window-event"><span>Current event</span><code key={liveStreamStage.id}>{liveStreamStage.signal}</code></div>
            </div>
            <div className="sdk-stage" style={{ "--stage-duration": `${liveStreamStage.duration}ms` } as CSSProperties}>
              <div className={`sdk-user-message${liveStreamStage.mode === "prompt" ? " is-current" : ""}`}>
                <p>How can my assistant show progress clearly?</p>
              </div>
              {liveStreamStage.mode !== "prompt" && <div className={`sdk-assistant-cycle${liveStreamStage.mode === "response" && showStreamAnswer ? " is-streaming-answer" : ""}`}>
                <AgentEmblemThinking
                source={source}
                activity={liveStreamStage.activity}
                color={colors}
                inactiveColor={secondaryInk}
                colorMode={themeMode}
                size={20}
                shape={shape}
                thinkingStyle={thinkingStyle}
                animateVisibility
                animateMotion
                animateText
                text={streamCopy}
                gap={14}
                className="sdk-status"
                textClassName="sdk-status-copy"
                textStyle={{
                  fontFamily: '"Instrument Sans", sans-serif',
                  fontSize: 16,
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.4,
                }}
                label={`${markName}: ${streamCopy}`}
                />
                {liveStreamStage.mode === "response" && showStreamAnswer && <p className="sdk-sample-answer" aria-label="A clear status keeps people oriented while the response streams.">
                  {SAMPLE_ANSWER_WORDS.slice(0, Math.max(0, streamedWordCount - 1)).join(" ")}{streamedWordCount > 1 ? " " : ""}
                  {streamedWordCount > 0 && <span key={streamedWordCount} className="sdk-answer-token" aria-hidden="true">{SAMPLE_ANSWER_WORDS[streamedWordCount - 1]}</span>}
                  <i className="sdk-answer-cursor" aria-hidden="true" />
                </p>}
              </div>}
              <i key={`progress-${liveStreamStage.id}`} className="sdk-progress" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="sdk-code">
          <div className="implementation-intro">
            <h3>One package,<br />your way.</h3>
            <p>Connect AI SDK activity or set the mark’s state with React props.</p>
          </div>
          <CodeWindow filename="ai-sdk-status.tsx">
            <span className="code-line"><span className="code-variable">const</span> <span className="code-punctuation">&#123;</span> <span className="code-prop">messages</span>, <span className="code-prop">status</span> <span className="code-punctuation">&#125;</span> <span className="code-punctuation">=</span> <span className="code-variable">useChat</span><span className="code-punctuation">()</span></span>
            <span className="code-line"><span className="code-variable">const</span> <span className="code-variable">part</span> <span className="code-punctuation">=</span> <span className="code-variable">messages</span><span className="code-punctuation">.</span><span className="code-variable">at</span><span className="code-punctuation">(</span><span className="code-number">-1</span><span className="code-punctuation">)?.</span><span className="code-variable">parts</span><span className="code-punctuation">.</span><span className="code-variable">at</span><span className="code-punctuation">(</span><span className="code-number">-1</span><span className="code-punctuation">)</span></span>
            <span className="code-line"><span className="code-variable">const</span> <span className="code-variable">activity</span> <span className="code-punctuation">=</span> <span className="code-punctuation">&#123;</span> <span className="code-prop">status</span>, <span className="code-prop">part</span> <span className="code-punctuation">&#125;</span></span>
            <span className="code-line"><span className="code-variable">const</span> <span className="code-variable">copy</span> <span className="code-punctuation">=</span> <span className="code-variable">getAgentEmblemStatusCopyFromAIActivity</span><span className="code-punctuation">(</span><span className="code-variable">activity</span><span className="code-punctuation">)</span></span>
            <span className="code-line"><span className="code-variable">const</span> <span className="code-variable">theme</span> <span className="code-punctuation">=</span> <span className="code-variable">useContext</span><span className="code-punctuation">(</span><span className="code-variable">ThemeContext</span><span className="code-punctuation">)</span></span>
            <span className="code-line"><span className="code-variable">const</span> <span className="code-variable">colors</span> <span className="code-punctuation">=</span> <span className="code-punctuation">&#123;</span> <span className="code-prop">light</span><span className="code-punctuation">:</span> <span className="code-string">&quot;#18181b&quot;</span>, <span className="code-prop">dark</span><span className="code-punctuation">:</span> <span className="code-string">&quot;#fafafa&quot;</span> <span className="code-punctuation">&#125;</span></span>
            <span className="code-line">&nbsp;</span>
            <span className="code-line"><span className="code-tag">&lt;AgentEmblemThinking</span></span>
            <span className="code-line">  <span className="code-prop">source</span><span className="code-punctuation">=&#123;</span><span className="code-variable">logoSvg</span><span className="code-punctuation">&#125;</span> <span className="code-prop">activity</span><span className="code-punctuation">=&#123;</span><span className="code-variable">activity</span><span className="code-punctuation">&#125;</span></span>
            <span className="code-line">  <span className="code-prop">text</span><span className="code-punctuation">=&#123;</span><span className="code-variable">copy</span><span className="code-punctuation">&#125;</span> <span className="code-prop">colorMode</span><span className="code-punctuation">=&#123;</span><span className="code-variable">theme</span><span className="code-punctuation">&#125;</span> <span className="code-prop">color</span><span className="code-punctuation">=&#123;</span><span className="code-variable">colors</span><span className="code-punctuation">&#125;</span></span>
            <span className="code-line">  <span className="code-prop">inactiveColor</span><span className="code-punctuation">=&#123;&#123;</span> <span className="code-prop">light</span><span className="code-punctuation">:</span> <span className="code-string">&quot;#71717a&quot;</span>, <span className="code-prop">dark</span><span className="code-punctuation">:</span> <span className="code-string">&quot;#a1a1aa&quot;</span> <span className="code-punctuation">&#125;&#125;</span></span>
            <span className="code-line">  <span className="code-prop">gap</span><span className="code-punctuation">=&#123;</span><span className="code-number">12</span><span className="code-punctuation">&#125;</span></span>
            <span className="code-line">  <span className="code-prop">textStyle</span><span className="code-punctuation">=&#123;&#123;</span> <span className="code-prop">fontSize</span><span className="code-punctuation">:</span> <span className="code-number">14</span>, <span className="code-prop">fontWeight</span><span className="code-punctuation">:</span> <span className="code-number">600</span> <span className="code-punctuation">&#125;&#125;</span></span>
            <span className="code-line">  <span className="code-prop">animateText</span></span>
            <span className="code-line"><span className="code-tag">/&gt;</span></span>
          </CodeWindow>
          <div className="implementation-divider" aria-hidden="true"><i /><span>or use React props</span><i /></div>
          <CodeWindow filename="agent-emblem.tsx">
            <span className="code-line"><span className="code-tag">&lt;AgentEmblem</span></span>
            <span className="code-line">  <span className="code-prop">source</span><span className="code-punctuation">=&#123;</span><span className="code-variable">logoSvg</span><span className="code-punctuation">&#125;</span></span>
            <span className="code-line">  <span className="code-prop">state</span><span className="code-punctuation">=</span><span className="code-string">&quot;{state}&quot;</span></span>
            <span className="code-line">  <span className="code-prop">size</span><span className="code-punctuation">=&#123;</span><span className="code-number">20</span><span className="code-punctuation">&#125;</span></span>
            <span className="code-line">  <span className="code-prop">colorMode</span><span className="code-punctuation">=</span><span className="code-string">&quot;{themeMode}&quot;</span></span>
            <span className="code-line">  <span className="code-prop">color</span><span className="code-punctuation">=&#123;&#123;</span> <span className="code-prop">light</span><span className="code-punctuation">:</span> <span className="code-string">&quot;{colors.light}&quot;</span>, <span className="code-prop">dark</span><span className="code-punctuation">:</span> <span className="code-string">&quot;{colors.dark}&quot;</span> <span className="code-punctuation">&#125;&#125;</span></span>
            {useSecondaryInk
              ? <span className="code-line">  <span className="code-prop">inactiveColor</span><span className="code-punctuation">=&#123;&#123;</span> <span className="code-prop">light</span><span className="code-punctuation">:</span> <span className="code-string">&quot;{inactiveColors.light}&quot;</span>, <span className="code-prop">dark</span><span className="code-punctuation">:</span> <span className="code-string">&quot;{inactiveColors.dark}&quot;</span> <span className="code-punctuation">&#125;&#125;</span></span>
              : <span className="code-line">  <span className="code-prop">inactiveColor</span><span className="code-punctuation">=&#123;</span><span className="code-boolean">false</span><span className="code-punctuation">&#125;</span></span>}
            <span className="code-line">  <span className="code-prop">shape</span><span className="code-punctuation">=</span><span className="code-string">&quot;{shape}&quot;</span></span>
            <span className="code-line">  <span className="code-prop">thinkingStyle</span><span className="code-punctuation">=</span><span className="code-string">&quot;{thinkingStyle}&quot;</span></span>
            <span className="code-line">  <span className="code-prop">animateVisibility</span><span className="code-punctuation">=&#123;</span><span className="code-boolean">{String(animateVisibility)}</span><span className="code-punctuation">&#125;</span></span>
            <span className="code-line"><span className="code-tag">/&gt;</span></span>
          </CodeWindow>
        </div>
      </section>
    </main>
  );
}
