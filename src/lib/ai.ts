import { useEffect, useState } from "react";
import type { AgentEmblemAIActivity, AgentEmblemAIStreamPart, AgentEmblemState } from "./types";

const COMPLETE_TYPES = new Set(["abort", "error", "finish", "finish-step"]);
const LOADING_TYPES = new Set(["start", "stream-start"]);

function partType(part: AgentEmblemAIStreamPart | null | undefined) {
  return typeof part?.type === "string" ? part.type : "";
}

function partStatus(part: AgentEmblemAIStreamPart | null | undefined) {
  return typeof part?.state === "string" ? part.state : "";
}

/**
 * Converts AI SDK stream activity into an AgentEmblem state.
 *
 * It accepts both raw `UIMessageChunk`/`fullStream` chunks and the finalized
 * parts exposed by `useChat`. Unsupported or terminal `*-end` chunks retain
 * the current state to prevent a distracting one-frame flicker between parts.
 */
export function getAgentEmblemStateFromAIActivity(
  activity: AgentEmblemAIActivity | null | undefined,
  currentState: AgentEmblemState = "idle",
): AgentEmblemState {
  const status = activity?.status?.toLowerCase();
  if (status === "submitted") return "loading";
  if (status === "ready" || status === "error") return "idle";

  const type = partType(activity?.part);
  const state = partStatus(activity?.part);
  if (!type) return currentState;
  if (COMPLETE_TYPES.has(type) || state === "output-error") return "idle";
  if (LOADING_TYPES.has(type)) return "loading";

  if (type === "reasoning" || type.startsWith("reasoning-")) {
    return type.endsWith("-end") ? currentState : "thinking";
  }
  if (type === "text" || type.startsWith("text-")) {
    return type.endsWith("-end") ? currentState : "composing";
  }
  if (type === "source" || type.startsWith("source-") || type === "tool-result") return "researching";
  if (type === "tool-call" || type.startsWith("tool-") || type.startsWith("dynamic-tool")) {
    return type.endsWith("-end") ? currentState : "researching";
  }
  if (type === "step-start" || type === "start-step") return "thinking";

  return currentState;
}

/**
 * Returns concise, user-facing progress copy for an AI SDK chat status or UI
 * message part. These labels describe observable stream activity; they do not
 * reveal or reconstruct a model's private chain-of-thought.
 */
export function getAgentEmblemStatusCopyFromAIActivity(
  activity: AgentEmblemAIActivity | null | undefined,
  currentCopy = "Ready",
) {
  const status = activity?.status?.toLowerCase();
  if (status === "submitted") return "Sending your message…";
  if (status === "ready") return "Response complete";
  if (status === "error") return "Something went wrong";

  const type = partType(activity?.part);
  if (type === "reasoning" || type.startsWith("reasoning-")) return "Thinking…";
  if (type === "source" || type.startsWith("source-")) return "Reading a source…";
  if (type === "tool-call" || type.startsWith("tool-") || type.startsWith("dynamic-tool")) return "Using a tool…";
  if (type === "text" || type.startsWith("text-")) return "Writing response…";

  return currentCopy;
}

/**
 * React adapter for AI SDK activity. It has no AI SDK dependency, so the same
 * component still works with a manually controlled `state` prop or another
 * agent framework.
 */
export function useAgentEmblemAIState(
  activity: AgentEmblemAIActivity | null | undefined,
  initialState: AgentEmblemState = "idle",
) {
  const [state, setState] = useState<AgentEmblemState>(initialState);

  useEffect(() => {
    setState((currentState) => getAgentEmblemStateFromAIActivity(activity, currentState));
  }, [activity?.part, activity?.status]);

  return state;
}
